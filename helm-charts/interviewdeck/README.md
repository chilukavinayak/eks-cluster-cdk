# InterviewDeck Helm Chart

A Helm chart for deploying InterviewDeck.io - Technical Interview Preparation Platform on Kubernetes.

## Prerequisites

- Kubernetes 1.19+
- Helm 3.2.0+
- AWS Load Balancer Controller (for ingress)
- ECR access for image pulling

## Installation

### 1. Install in Development Environment

```bash
# Install with development values
helm install interviewdeck ./helm-charts/interviewdeck \
  --namespace interviewdeck \
  --create-namespace \
  --values ./helm-charts/interviewdeck/values-dev.yaml
```

### 2. Install in Production Environment

```bash
# Install with production values
helm install interviewdeck ./helm-charts/interviewdeck \
  --namespace interviewdeck \
  --create-namespace \
  --values ./helm-charts/interviewdeck/values-prod.yaml
```

### 3. Upgrade Deployment

```bash
# Upgrade with new values
helm upgrade interviewdeck ./helm-charts/interviewdeck \
  --namespace interviewdeck \
  --values ./helm-charts/interviewdeck/values-prod.yaml
```

### 4. Uninstall

```bash
helm uninstall interviewdeck --namespace interviewdeck
```

## Configuration

### Image Configuration

```yaml
global:
  imageRegistry: "276824024738.dkr.ecr.us-east-1.amazonaws.com"

frontend:
  image:
    repository: "interviewdeck-frontend"
    tag: "latest"
    pullPolicy: Always

backend:
  image:
    repository: "interviewdeck-backend"  
    tag: "latest"
    pullPolicy: Always
```

### SSL Configuration

```yaml
ssl:
  enabled: true
  certificateArn: "arn:aws:acm:us-east-1:276824024738:certificate/your-cert-arn"
```

### Environment Variables

```yaml
backend:
  env:
    SPRING_PROFILES_ACTIVE: "prod"
    SPRING_DATASOURCE_URL: "jdbc:postgresql://postgres:5432/interviewdeck"
    JWT_SECRET: "your-secure-jwt-secret"
  
  secrets:
    GOOGLE_CLIENT_ID: "base64-encoded-client-id"
    GOOGLE_CLIENT_SECRET: "base64-encoded-secret"
```

## Values Files

- `values.yaml` - Default configuration
- `values-dev.yaml` - Development environment
- `values-prod.yaml` - Production environment

## Components

### Frontend
- React/TypeScript application
- Nginx web server
- Configurable resources and scaling

### Backend  
- Spring Boot microservices
- Multi-port configuration (auth, content, payment)
- Health checks and readiness probes
- ConfigMap and Secret integration

### Ingress
- AWS Application Load Balancer
- SSL/TLS termination
- Host-based routing
- Automatic certificate integration

## Monitoring

Enable monitoring by setting:

```yaml
monitoring:
  enabled: true
  serviceMonitor:
    enabled: true
```

## Security

- Pod Security Context configured
- Non-root user execution
- Read-only root filesystem option
- Security contexts for containers

## Autoscaling

```yaml
autoscaling:
  enabled: true
  minReplicas: 2
  maxReplicas: 10
  targetCPUUtilizationPercentage: 70
```

## Troubleshooting

### Check pod status
```bash
kubectl get pods -n interviewdeck
```

### View logs
```bash
kubectl logs -n interviewdeck deployment/interviewdeck-frontend
kubectl logs -n interviewdeck deployment/interviewdeck-backend
```

### Check ingress
```bash
kubectl describe ingress -n interviewdeck
```

### Port forwarding for local testing
```bash
kubectl port-forward -n interviewdeck service/interviewdeck-frontend 8080:80
```
