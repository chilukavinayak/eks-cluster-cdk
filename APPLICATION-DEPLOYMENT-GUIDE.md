# Application Deployment to EKS - Multi-Tenant Best Practices

## 🎯 Overview

This guide provides step-by-step instructions for deploying applications to your production EKS cluster with multi-tenancy best practices for organizational use.

## 📋 Prerequisites

1. EKS cluster deployed and running: `sats-portals-eks-cluster`
2. AWS CLI configured with appropriate permissions
3. kubectl installed
4. Docker for containerizing applications
5. Access to Amazon ECR for image registry

## 🚀 Step-by-Step Deployment Process

### Step 1: Configure Cluster Access

```bash
# Assume appropriate role for cluster access
./scripts/assume-eks-role.sh admin

# Update kubeconfig
aws eks update-kubeconfig --region us-east-1 --name sats-portals-eks-cluster

# Verify cluster access
kubectl get nodes
kubectl get namespaces
```

### Step 2: Create Application Namespace

```bash
# Create dedicated namespace for your application
kubectl create namespace your-app-name

# Label namespace for organization tracking
kubectl label namespace your-app-name \
  organization=your-org \
  team=your-team \
  environment=production \
  cost-center=your-cost-center
```

### Step 3: Set Up RBAC (Role-Based Access Control)

Create RBAC configuration for your application:

```yaml
# rbac-configs/your-app-rbac.yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: your-app-sa
  namespace: your-app-name
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::ACCOUNT-ID:role/your-app-role
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  namespace: your-app-name
  name: your-app-role
rules:
- apiGroups: [""]
  resources: ["pods", "services", "configmaps", "secrets"]
  verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: your-app-rolebinding
  namespace: your-app-name
subjects:
- kind: ServiceAccount
  name: your-app-sa
  namespace: your-app-name
roleRef:
  kind: Role
  name: your-app-role
  apiGroup: rbac.authorization.k8s.io
```

### Step 4: Configure Resource Quotas & Limits

```yaml
# manifests/your-app-name/resource-quota.yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: your-app-quota
  namespace: your-app-name
spec:
  hard:
    requests.cpu: "4"
    requests.memory: 8Gi
    limits.cpu: "8"
    limits.memory: 16Gi
    pods: "20"
    services: "10"
    persistentvolumeclaims: "5"
---
apiVersion: v1
kind: LimitRange
metadata:
  name: your-app-limits
  namespace: your-app-name
spec:
  limits:
  - default:
      cpu: 500m
      memory: 512Mi
    defaultRequest:
      cpu: 100m
      memory: 128Mi
    type: Container
```

### Step 5: Container Registry Setup

```bash
# Create ECR repository
aws ecr create-repository --repository-name your-org/your-app-name

# Get login token
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin ACCOUNT-ID.dkr.ecr.us-east-1.amazonaws.com

# Build and push your application
docker build -t your-app .
docker tag your-app:latest ACCOUNT-ID.dkr.ecr.us-east-1.amazonaws.com/your-org/your-app-name:latest
docker push ACCOUNT-ID.dkr.ecr.us-east-1.amazonaws.com/your-org/your-app-name:latest
```

### Step 6: Application Deployment

```yaml
# manifests/your-app-name/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: your-app
  namespace: your-app-name
  labels:
    app: your-app
    version: v1.0.0
spec:
  replicas: 3
  selector:
    matchLabels:
      app: your-app
  template:
    metadata:
      labels:
        app: your-app
        version: v1.0.0
    spec:
      serviceAccountName: your-app-sa
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
        fsGroup: 2000
      containers:
      - name: your-app
        image: ACCOUNT-ID.dkr.ecr.us-east-1.amazonaws.com/your-org/your-app-name:latest
        ports:
        - containerPort: 8080
        resources:
          requests:
            cpu: 100m
            memory: 128Mi
          limits:
            cpu: 500m
            memory: 512Mi
        env:
        - name: NODE_ENV
          value: "production"
        livenessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: your-app-service
  namespace: your-app-name
  annotations:
    service.beta.kubernetes.io/aws-load-balancer-type: "nlb"
    service.beta.kubernetes.io/aws-load-balancer-internal: "true"
spec:
  selector:
    app: your-app
  ports:
  - port: 80
    targetPort: 8080
    protocol: TCP
  type: LoadBalancer
```

### Step 7: Configure Ingress (Optional)

```yaml
# manifests/your-app-name/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: your-app-ingress
  namespace: your-app-name
  annotations:
    kubernetes.io/ingress.class: alb
    alb.ingress.kubernetes.io/scheme: internal
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/healthcheck-path: /health
spec:
  rules:
  - host: your-app.internal.company.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: your-app-service
            port:
              number: 80
```

### Step 8: Deploy Application

```bash
# Apply RBAC configurations
kubectl apply -f rbac-configs/your-app-rbac.yaml

# Apply resource quotas
kubectl apply -f manifests/your-app-name/resource-quota.yaml

# Deploy application
kubectl apply -f manifests/your-app-name/deployment.yaml

# Apply ingress (if using)
kubectl apply -f manifests/your-app-name/ingress.yaml

# Verify deployment
kubectl get pods -n your-app-name
kubectl get services -n your-app-name
kubectl describe deployment your-app -n your-app-name
```

## 🏢 Multi-Tenant Best Practices

### 1. Namespace Isolation Strategy

```bash
# Organizational namespace pattern
kubectl create namespace org-team-app-env
# Examples:
# acme-frontend-web-prod
# acme-backend-api-staging
# finance-reporting-analytics-dev
```

### 2. Network Policies for Isolation

```yaml
# manifests/your-app-name/network-policy.yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: your-app-network-policy
  namespace: your-app-name
spec:
  podSelector:
    matchLabels:
      app: your-app
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          name: allowed-namespace
    - podSelector:
        matchLabels:
          app: allowed-app
    ports:
    - protocol: TCP
      port: 8080
  egress:
  - to: []
    ports:
    - protocol: TCP
      port: 443  # HTTPS
    - protocol: TCP
      port: 53   # DNS
    - protocol: UDP
      port: 53   # DNS
```

### 3. Resource Management by Organization

```yaml
# Per-organization resource quotas
apiVersion: v1
kind: ResourceQuota
metadata:
  name: org-acme-quota
  namespace: acme-production
spec:
  hard:
    requests.cpu: "20"
    requests.memory: 40Gi
    limits.cpu: "40"
    limits.memory: 80Gi
    pods: "100"
    services: "50"
    persistentvolumeclaims: "20"
    count/ingresses.networking.k8s.io: "10"
```

### 4. Monitoring & Observability per Tenant

```yaml
# ServiceMonitor for Prometheus scraping
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: your-app-metrics
  namespace: your-app-name
  labels:
    app: your-app
    organization: your-org
spec:
  selector:
    matchLabels:
      app: your-app
  endpoints:
  - port: metrics
    path: /metrics
    interval: 30s
```

### 5. Cost Allocation & Tracking

```yaml
# Consistent labeling for cost allocation
metadata:
  labels:
    organization: "acme-corp"
    team: "frontend"
    cost-center: "engineering"
    environment: "production"
    application: "web-app"
    version: "v1.2.3"
```

## 🔒 Security Best Practices

### 1. Pod Security Standards

```yaml
# Pod Security Standards enforcement
apiVersion: v1
kind: Namespace
metadata:
  name: your-app-name
  labels:
    pod-security.kubernetes.io/enforce: restricted
    pod-security.kubernetes.io/audit: restricted
    pod-security.kubernetes.io/warn: restricted
```

### 2. Secrets Management

```bash
# Use AWS Secrets Manager
kubectl create secret generic your-app-secrets \
  --from-literal=database-url="postgresql://..." \
  --from-literal=api-key="..." \
  --namespace=your-app-name

# Or use External Secrets Operator (recommended)
# See external-secrets.yaml template
```

### 3. Image Security

```bash
# Enable ECR image scanning
aws ecr put-image-scanning-configuration \
  --repository-name your-org/your-app-name \
  --image-scanning-configuration scanOnPush=true

# Pull only signed images
# Use admission controllers like OPA Gatekeeper
```

## 📊 Monitoring & Alerting

### 1. Application Metrics

```yaml
# Expose metrics endpoint
apiVersion: v1
kind: Service
metadata:
  name: your-app-metrics
  namespace: your-app-name
  labels:
    app: your-app
spec:
  ports:
  - name: metrics
    port: 9090
    targetPort: 9090
  selector:
    app: your-app
```

### 2. Log Aggregation

```yaml
# Structured logging configuration
apiVersion: v1
kind: ConfigMap
metadata:
  name: logging-config
  namespace: your-app-name
data:
  log-level: "info"
  log-format: "json"
  log-output: "stdout"
```

### 3. Health Checks & SLIs

```yaml
# Comprehensive health checks
livenessProbe:
  httpGet:
    path: /health/live
    port: 8080
  initialDelaySeconds: 30
  periodSeconds: 10
  timeoutSeconds: 5
  failureThreshold: 3

readinessProbe:
  httpGet:
    path: /health/ready
    port: 8080
  initialDelaySeconds: 5
  periodSeconds: 5
  timeoutSeconds: 3
  failureThreshold: 3
```

## 🚀 CI/CD Integration

### 1. GitOps Workflow

```yaml
# ArgoCD Application
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: your-app
  namespace: argocd
spec:
  project: your-organization
  source:
    repoURL: https://github.com/your-org/your-app
    targetRevision: main
    path: k8s-manifests
  destination:
    server: https://kubernetes.default.svc
    namespace: your-app-name
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
```

### 2. Deployment Pipeline

```bash
# Pipeline stages
1. Build & Test
2. Security Scanning
3. Build Container Image
4. Push to ECR
5. Deploy to Staging
6. Integration Tests
7. Deploy to Production
8. Health Checks
```

## 📋 Deployment Checklist

- [ ] Namespace created with proper labels
- [ ] RBAC configured with service accounts
- [ ] Resource quotas and limits set
- [ ] Network policies applied
- [ ] Secrets configured securely
- [ ] Container images scanned for vulnerabilities
- [ ] Health checks implemented
- [ ] Monitoring and alerting configured
- [ ] Backup strategy defined
- [ ] Disaster recovery plan documented
- [ ] Security policies enforced
- [ ] Cost allocation tags applied

## 🚨 Common Pitfalls to Avoid

1. **Resource Limits**: Always set CPU/memory limits to prevent resource starvation
2. **Security Context**: Run containers as non-root users
3. **Image Tags**: Never use `latest` tag in production
4. **Secrets**: Never hardcode secrets in manifests
5. **Health Checks**: Implement proper liveness and readiness probes
6. **Network Policies**: Implement network segmentation between tenants
7. **Resource Quotas**: Set appropriate quotas to prevent resource abuse
8. **Monitoring**: Ensure comprehensive monitoring and alerting

## 📞 Next Steps

1. **Review** your application requirements
2. **Customize** templates for your specific use case
3. **Test** deployment in staging namespace first
4. **Implement** monitoring and alerting
5. **Document** application-specific procedures
6. **Train** team on operational procedures
