# Application Deployment to EKS using Helm Charts

This guide provides a comprehensive approach to deploying applications to your private EKS cluster using Helm charts, following production best practices and security guidelines.

## Table of Contents

1. [Helm Setup and Installation](#1-helm-setup-and-installation)
2. [Application Deployment Strategy](#2-application-deployment-strategy)
3. [Helm Chart Structure](#3-helm-chart-structure)
4. [Environment-Specific Configurations](#4-environment-specific-configurations)
5. [Security Best Practices](#5-security-best-practices)
6. [CI/CD Integration](#6-cicd-integration)
7. [Monitoring and Observability](#7-monitoring-and-observability)
8. [Troubleshooting](#8-troubleshooting)

---

## 1. Helm Setup and Installation

### Prerequisites

- EKS cluster deployed and accessible via kubectl
- EC2 instance with kubectl configured (for private cluster access)
- Docker images pushed to Amazon ECR

### Install Helm

```bash
# On EC2 instance inside VPC
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash

# Verify installation
helm version

# Add commonly used repositories
helm repo add stable https://charts.helm.sh/stable
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update
```

### Create Namespace for Applications

```bash
# Create application namespace
kubectl create namespace applications

# Set as default namespace (optional)
kubectl config set-context --current --namespace=applications
```

---

## 2. Application Deployment Strategy

### Deployment Phases

#### Phase 1: Infrastructure Components (Deploy First)
- **Namespace creation**
- **Service accounts with IRSA**
- **Secrets and ConfigMaps**
- **Network policies**

#### Phase 2: Supporting Services (Deploy Second)
- **Databases** (RDS proxy, Redis)
- **Message queues** (SQS, SNS)
- **Storage** (EFS, S3 access)

#### Phase 3: Application Services (Deploy Third)
- **Backend APIs**
- **Worker services**
- **Cron jobs**

#### Phase 4: Frontend & Routing (Deploy Last)
- **Frontend applications**
- **Internal load balancers**
- **Service mesh (if using)**

### Application Architecture Example

```mermaid
graph TD
    A[Internet Gateway] --> B[Private ALB]
    B --> C[Frontend Service]
    C --> D[Backend API]
    D --> E[Database Service]
    D --> F[Cache Service]
    
    G[Worker Queue] --> H[Background Jobs]
    H --> E
    
    I[Monitoring] --> D
    I --> C
    I --> H
    
    classDef frontend fill:#e1f5fe,stroke:#01579b,color:#000
    classDef backend fill:#f3e5f5,stroke:#4a148c,color:#000
    classDef data fill:#e8f5e8,stroke:#1b5e20,color:#000
    
    class C frontend
    class D,H backend  
    class E,F data
```

---

## 3. Helm Chart Structure

### Standard Chart Directory Structure

```
my-application/
├── Chart.yaml                 # Chart metadata
├── values.yaml               # Default configuration values
├── values-dev.yaml           # Development environment values
├── values-stage.yaml         # Staging environment values  
├── values-prod.yaml          # Production environment values
├── templates/
│   ├── deployment.yaml       # Application deployment
│   ├── service.yaml          # Kubernetes service
│   ├── ingress.yaml          # Ingress configuration
│   ├── configmap.yaml        # Configuration data
│   ├── secret.yaml           # Sensitive data
│   ├── serviceaccount.yaml   # Service account with IRSA
│   ├── hpa.yaml              # Horizontal Pod Autoscaler
│   ├── pdb.yaml              # Pod Disruption Budget
│   ├── networkpolicy.yaml    # Network policies
│   └── NOTES.txt             # Post-install instructions
├── charts/                   # Dependent charts
└── tests/                    # Helm tests
    └── test-connection.yaml
```

### Chart.yaml Example

```yaml
# Chart.yaml
apiVersion: v2
name: my-application
description: A production-ready web application
type: application
version: 0.1.0
appVersion: "1.0.0"

maintainers:
  - name: Platform Team
    email: platform@company.com

dependencies:
  - name: postgresql
    version: 12.1.2
    repository: https://charts.bitnami.com/bitnami
    condition: postgresql.enabled
  - name: redis
    version: 17.3.7
    repository: https://charts.bitnami.com/bitnami
    condition: redis.enabled

keywords:
  - web
  - api
  - microservice

annotations:
  category: Application
```

### values.yaml (Default Configuration)

```yaml
# values.yaml
# Default values for my-application

## Global configuration
global:
  imageRegistry: "123456789012.dkr.ecr.us-east-1.amazonaws.com"
  imagePullSecrets:
    - name: ecr-registry-secret

## Application configuration
app:
  name: my-application
  version: "1.0.0"
  
## Image configuration
image:
  repository: my-application
  tag: "latest"
  pullPolicy: IfNotPresent

## Replica configuration
replicaCount: 2

## Service account configuration
serviceAccount:
  create: true
  annotations:
    eks.amazonaws.com/role-arn: ""
  name: ""

## Pod security context
podSecurityContext:
  fsGroup: 2000
  runAsNonRoot: true
  runAsUser: 1000

## Container security context
securityContext:
  allowPrivilegeEscalation: false
  capabilities:
    drop:
    - ALL
  readOnlyRootFilesystem: true
  runAsNonRoot: true
  runAsUser: 1000

## Service configuration
service:
  type: ClusterIP
  port: 80
  targetPort: 8080

## Ingress configuration (internal ALB)
ingress:
  enabled: true
  className: alb
  annotations:
    kubernetes.io/ingress.class: alb
    alb.ingress.kubernetes.io/scheme: internal
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/healthcheck-path: /health
  hosts:
    - host: my-app.internal.company.com
      paths:
        - path: /
          pathType: Prefix
  tls: []

## Resource limits
resources:
  limits:
    cpu: 500m
    memory: 512Mi
  requests:
    cpu: 250m
    memory: 256Mi

## Horizontal Pod Autoscaler
autoscaling:
  enabled: true
  minReplicas: 2
  maxReplicas: 10
  targetCPUUtilizationPercentage: 70
  targetMemoryUtilizationPercentage: 80

## Pod Disruption Budget
podDisruptionBudget:
  enabled: true
  minAvailable: 1

## Liveness and readiness probes
livenessProbe:
  httpGet:
    path: /health
    port: http
  initialDelaySeconds: 30
  periodSeconds: 10

readinessProbe:
  httpGet:
    path: /ready
    port: http
  initialDelaySeconds: 5
  periodSeconds: 5

## Node selector and tolerations
nodeSelector: {}
tolerations: []
affinity: {}

## Environment variables
env:
  - name: ENV
    value: "production"
  - name: LOG_LEVEL
    value: "info"

## ConfigMap data
configMap:
  data:
    database_host: "postgres.internal.company.com"
    redis_host: "redis.internal.company.com"
    api_timeout: "30s"

## Secret data (base64 encoded)
secret:
  data: {}
    # database_password: <base64-encoded-password>
    # api_key: <base64-encoded-key>

## Dependency configuration
postgresql:
  enabled: false
  
redis:
  enabled: false

## Network policies
networkPolicy:
  enabled: true
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              name: ingress-nginx
      ports:
        - protocol: TCP
          port: 8080
  egress:
    - to: []
      ports:
        - protocol: TCP
          port: 5432  # PostgreSQL
        - protocol: TCP
          port: 6379  # Redis
        - protocol: TCP
          port: 443   # HTTPS
```

### Environment-Specific Values

#### values-dev.yaml

```yaml
# values-dev.yaml
# Development environment overrides

replicaCount: 1

image:
  tag: "dev-latest"

resources:
  limits:
    cpu: 200m
    memory: 256Mi
  requests:
    cpu: 100m
    memory: 128Mi

autoscaling:
  enabled: false

env:
  - name: ENV
    value: "development"
  - name: LOG_LEVEL
    value: "debug"

serviceAccount:
  annotations:
    eks.amazonaws.com/role-arn: "arn:aws:iam::123456789012:role/dev-app-role"

ingress:
  hosts:
    - host: my-app-dev.internal.company.com
      paths:
        - path: /
          pathType: Prefix

postgresql:
  enabled: true
  auth:
    postgresPassword: "dev-password"
    database: "myapp_dev"

redis:
  enabled: true
  auth:
    enabled: false
```

#### values-prod.yaml

```yaml
# values-prod.yaml
# Production environment overrides

replicaCount: 5

image:
  tag: "v1.0.0"

resources:
  limits:
    cpu: 1000m
    memory: 1Gi
  requests:
    cpu: 500m
    memory: 512Mi

autoscaling:
  enabled: true
  minReplicas: 5
  maxReplicas: 50
  targetCPUUtilizationPercentage: 60

podDisruptionBudget:
  enabled: true
  minAvailable: 3

serviceAccount:
  annotations:
    eks.amazonaws.com/role-arn: "arn:aws:iam::123456789012:role/prod-app-role"

ingress:
  hosts:
    - host: my-app.internal.company.com
      paths:
        - path: /
          pathType: Prefix

# Use external managed services
postgresql:
  enabled: false

redis:
  enabled: false

configMap:
  data:
    database_host: "prod-postgres.cluster-xyz.us-east-1.rds.amazonaws.com"
    redis_host: "prod-redis.cache.amazonaws.com"
```

---

## 4. Environment-Specific Configurations

### Template Examples

#### Deployment Template

```yaml
# templates/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "my-application.fullname" . }}
  labels:
    {{- include "my-application.labels" . | nindent 4 }}
spec:
  {{- if not .Values.autoscaling.enabled }}
  replicas: {{ .Values.replicaCount }}
  {{- end }}
  selector:
    matchLabels:
      {{- include "my-application.selectorLabels" . | nindent 6 }}
  template:
    metadata:
      annotations:
        checksum/config: {{ include (print $.Template.BasePath "/configmap.yaml") . | sha256sum }}
        checksum/secret: {{ include (print $.Template.BasePath "/secret.yaml") . | sha256sum }}
      labels:
        {{- include "my-application.selectorLabels" . | nindent 8 }}
    spec:
      {{- with .Values.global.imagePullSecrets }}
      imagePullSecrets:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      serviceAccountName: {{ include "my-application.serviceAccountName" . }}
      securityContext:
        {{- toYaml .Values.podSecurityContext | nindent 8 }}
      containers:
        - name: {{ .Chart.Name }}
          securityContext:
            {{- toYaml .Values.securityContext | nindent 12 }}
          image: "{{ .Values.global.imageRegistry }}/{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}"
          imagePullPolicy: {{ .Values.image.pullPolicy }}
          ports:
            - name: http
              containerPort: {{ .Values.service.targetPort }}
              protocol: TCP
          {{- if .Values.livenessProbe }}
          livenessProbe:
            {{- toYaml .Values.livenessProbe | nindent 12 }}
          {{- end }}
          {{- if .Values.readinessProbe }}
          readinessProbe:
            {{- toYaml .Values.readinessProbe | nindent 12 }}
          {{- end }}
          resources:
            {{- toYaml .Values.resources | nindent 12 }}
          env:
            {{- range .Values.env }}
            - name: {{ .name }}
              value: {{ .value | quote }}
            {{- end }}
          envFrom:
            - configMapRef:
                name: {{ include "my-application.fullname" . }}
            - secretRef:
                name: {{ include "my-application.fullname" . }}
          volumeMounts:
            - name: tmp
              mountPath: /tmp
      volumes:
        - name: tmp
          emptyDir: {}
      {{- with .Values.nodeSelector }}
      nodeSelector:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      {{- with .Values.affinity }}
      affinity:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      {{- with .Values.tolerations }}
      tolerations:
        {{- toYaml . | nindent 8 }}
      {{- end }}
```

#### Service Account with IRSA

```yaml
# templates/serviceaccount.yaml
{{- if .Values.serviceAccount.create -}}
apiVersion: v1
kind: ServiceAccount
metadata:
  name: {{ include "my-application.serviceAccountName" . }}
  labels:
    {{- include "my-application.labels" . | nindent 4 }}
  {{- with .Values.serviceAccount.annotations }}
  annotations:
    {{- toYaml . | nindent 4 }}
  {{- end }}
automountServiceAccountToken: true
{{- end }}
```

#### Internal ALB Ingress

```yaml
# templates/ingress.yaml
{{- if .Values.ingress.enabled -}}
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: {{ include "my-application.fullname" . }}
  labels:
    {{- include "my-application.labels" . | nindent 4 }}
  {{- with .Values.ingress.annotations }}
  annotations:
    {{- toYaml . | nindent 4 }}
  {{- end }}
spec:
  {{- if .Values.ingress.className }}
  ingressClassName: {{ .Values.ingress.className }}
  {{- end }}
  {{- if .Values.ingress.tls }}
  tls:
    {{- range .Values.ingress.tls }}
    - hosts:
        {{- range .hosts }}
        - {{ . | quote }}
        {{- end }}
      secretName: {{ .secretName }}
    {{- end }}
  {{- end }}
  rules:
    {{- range .Values.ingress.hosts }}
    - host: {{ .host | quote }}
      http:
        paths:
          {{- range .paths }}
          - path: {{ .path }}
            pathType: {{ .pathType }}
            backend:
              service:
                name: {{ include "my-application.fullname" $ }}
                port:
                  number: {{ $.Values.service.port }}
          {{- end }}
    {{- end }}
{{- end }}
```

---

## 5. Security Best Practices

### IAM Roles for Service Accounts (IRSA)

#### 1. Create IAM Policy for Application

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject"
      ],
      "Resource": "arn:aws:s3:::my-app-bucket/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue"
      ],
      "Resource": "arn:aws:secretsmanager:us-east-1:123456789012:secret:my-app/*"
    }
  ]
}
```

#### 2. Create IAM Role with Trust Policy

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::123456789012:oidc-provider/oidc.eks.us-east-1.amazonaws.com/id/EXAMPLE"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "oidc.eks.us-east-1.amazonaws.com/id/EXAMPLE:sub": "system:serviceaccount:applications:my-application",
          "oidc.eks.us-east-1.amazonaws.com/id/EXAMPLE:aud": "sts.amazonaws.com"
        }
      }
    }
  ]
}
```

### Secret Management

#### Using AWS Secrets Manager

```yaml
# External Secrets Operator configuration
apiVersion: external-secrets.io/v1beta1
kind: SecretStore
metadata:
  name: aws-secrets-manager
spec:
  provider:
    aws:
      service: SecretsManager
      region: us-east-1
      auth:
        jwt:
          serviceAccountRef:
            name: my-application
---
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: app-secrets
spec:
  refreshInterval: 15s
  secretStoreRef:
    name: aws-secrets-manager
    kind: SecretStore
  target:
    name: my-application-secrets
    creationPolicy: Owner
  data:
  - secretKey: database-password
    remoteRef:
      key: my-app/database
      property: password
  - secretKey: api-key
    remoteRef:
      key: my-app/api
      property: key
```

### Network Policies

```yaml
# templates/networkpolicy.yaml
{{- if .Values.networkPolicy.enabled }}
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: {{ include "my-application.fullname" . }}
  labels:
    {{- include "my-application.labels" . | nindent 4 }}
spec:
  podSelector:
    matchLabels:
      {{- include "my-application.selectorLabels" . | nindent 6 }}
  policyTypes:
    {{- toYaml .Values.networkPolicy.policyTypes | nindent 4 }}
  {{- if .Values.networkPolicy.ingress }}
  ingress:
    {{- toYaml .Values.networkPolicy.ingress | nindent 4 }}
  {{- end }}
  {{- if .Values.networkPolicy.egress }}
  egress:
    {{- toYaml .Values.networkPolicy.egress | nindent 4 }}
  {{- end }}
{{- end }}
```

---

## 6. CI/CD Integration

### GitHub Actions Workflow

```yaml
# .github/workflows/deploy.yml
name: Deploy to EKS

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

env:
  AWS_REGION: us-east-1
  CLUSTER_NAME: prod-eks-cluster

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
    - name: Checkout code
      uses: actions/checkout@v3

    - name: Configure AWS credentials
      uses: aws-actions/configure-aws-credentials@v2
      with:
        role-to-assume: ${{ secrets.AWS_ROLE_TO_ASSUME }}
        aws-region: ${{ env.AWS_REGION }}

    - name: Login to Amazon ECR
      id: login-ecr
      uses: aws-actions/amazon-ecr-login@v1

    - name: Build and push Docker image
      env:
        ECR_REGISTRY: ${{ steps.login-ecr.outputs.registry }}
        ECR_REPOSITORY: my-application
        IMAGE_TAG: ${{ github.sha }}
      run: |
        docker build -t $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG .
        docker push $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG

    - name: Install kubectl
      uses: azure/setup-kubectl@v3

    - name: Install Helm
      uses: azure/setup-helm@v3
      with:
        version: '3.10.0'

    - name: Update kubeconfig
      run: |
        aws eks update-kubeconfig --region $AWS_REGION --name $CLUSTER_NAME

    - name: Deploy to staging
      if: github.ref == 'refs/heads/main'
      run: |
        helm upgrade --install my-application ./helm-chart \
          --namespace applications \
          --values ./helm-chart/values-stage.yaml \
          --set image.tag=${{ github.sha }} \
          --wait --timeout=600s

    - name: Deploy to production
      if: github.ref == 'refs/heads/main' && github.event_name == 'push'
      run: |
        helm upgrade --install my-application ./helm-chart \
          --namespace applications \
          --values ./helm-chart/values-prod.yaml \
          --set image.tag=${{ github.sha }} \
          --wait --timeout=600s
```

### ArgoCD Application (GitOps)

```yaml
# argocd/application.yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: my-application
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/company/my-application
    targetRevision: HEAD
    path: helm-chart
    helm:
      valueFiles:
        - values-prod.yaml
      parameters:
        - name: image.tag
          value: v1.0.0
  destination:
    server: https://kubernetes.default.svc
    namespace: applications
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
```

### Deployment Commands

```bash
# Development deployment
helm upgrade --install my-app ./helm-chart \
  --namespace applications \
  --values ./helm-chart/values-dev.yaml \
  --set image.tag=dev-latest \
  --create-namespace \
  --wait

# Staging deployment
helm upgrade --install my-app ./helm-chart \
  --namespace applications \
  --values ./helm-chart/values-stage.yaml \
  --set image.tag=v1.0.0-rc1 \
  --wait

# Production deployment
helm upgrade --install my-app ./helm-chart \
  --namespace applications \
  --values ./helm-chart/values-prod.yaml \
  --set image.tag=v1.0.0 \
  --wait

# Rollback if needed
helm rollback my-app 1 --namespace applications
```

---

## 7. Monitoring and Observability

### Prometheus Monitoring

```yaml
# Prometheus ServiceMonitor
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: my-application
spec:
  selector:
    matchLabels:
      app.kubernetes.io/name: my-application
  endpoints:
  - port: http
    path: /metrics
    interval: 30s
```

### Application Metrics

```yaml
# Add to values.yaml
monitoring:
  enabled: true
  serviceMonitor:
    enabled: true
    interval: 30s
    path: /metrics
  
  # Grafana dashboard
  grafana:
    dashboards:
      enabled: true
```

### Logging Configuration

```yaml
# Fluent Bit configuration for log shipping
apiVersion: v1
kind: ConfigMap
metadata:
  name: fluent-bit-config
data:
  fluent-bit.conf: |
    [SERVICE]
        Flush         1
        Log_Level     info
    
    [INPUT]
        Name              tail
        Path              /var/log/containers/*my-application*.log
        Parser            docker
        Tag               kube.*
        Refresh_Interval  5
    
    [OUTPUT]
        Name  cloudwatch_logs
        Match kube.*
        region us-east-1
        log_group_name /aws/eks/my-cluster/applications
        log_stream_prefix my-application-
        auto_create_group true
```

---

## 8. Troubleshooting

### Common Issues and Solutions

#### 1. Image Pull Errors

```bash
# Check ECR permissions
aws ecr describe-repositories --repository-names my-application

# Verify service account has correct IAM role
kubectl describe serviceaccount my-application -n applications

# Check image pull secrets
kubectl get secrets -n applications
kubectl describe secret ecr-registry-secret -n applications
```

#### 2. Pod Startup Issues

```bash
# Check pod status
kubectl get pods -n applications -l app.kubernetes.io/name=my-application

# View pod logs
kubectl logs -f deployment/my-application -n applications

# Describe pod for events
kubectl describe pod <pod-name> -n applications

# Check resource constraints
kubectl top pods -n applications
```

#### 3. Service Connectivity

```bash
# Test service endpoints
kubectl run debug --image=busybox -it --rm -- /bin/sh
# Inside pod: wget -qO- http://my-application.applications.svc.cluster.local

# Check service configuration
kubectl get svc my-application -n applications -o yaml

# Verify ingress configuration
kubectl get ingress -n applications
kubectl describe ingress my-application -n applications
```

#### 4. IRSA Issues

```bash
# Check service account annotations
kubectl get serviceaccount my-application -n applications -o yaml

# Verify OIDC provider
aws eks describe-cluster --name prod-eks-cluster --query 'cluster.identity.oidc.issuer'

# Test AWS credentials in pod
kubectl exec -it deployment/my-application -n applications -- aws sts get-caller-identity
```

### Helm Debugging Commands

```bash
# Dry run deployment
helm install my-app ./helm-chart --dry-run --debug

# Template validation
helm template my-app ./helm-chart --values ./helm-chart/values-prod.yaml

# Check release status
helm status my-app -n applications

# View release history
helm history my-app -n applications

# Get all resources for release
helm get all my-app -n applications
```

### Health Check Endpoints

```bash
# Application health checks
curl http://my-app.internal.company.com/health
curl http://my-app.internal.company.com/ready

# Kubernetes probes
kubectl get pods -n applications -o wide
kubectl describe pod <pod-name> -n applications | grep -A 10 Conditions
```

---

This comprehensive guide provides everything needed to deploy applications to your private EKS cluster using Helm charts, following production best practices for security, monitoring, and operational excellence.
