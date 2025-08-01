# InterviewDeck Helm Charts

This directory contains Helm charts for deploying the InterviewDeck application to Kubernetes/EKS.

## Charts

### 1. PostgreSQL Database (`postgresql/`)
- PostgreSQL 14.9 database
- Persistent storage with EBS volumes
- Default database: `interviewdeck`
- Default username: `interviewdeck`

### 2. Backend Services (`interviewdeck-backend/`)
- Auth Service (port 8080)
- Content Service (port 8081) 
- Payment Service (port 8082)
- Spring Boot applications with Java 17
- Auto-scaling enabled (2-10 replicas)
- Health checks on `/actuator/health`

### 3. Frontend (`interviewdeck-frontend/`)
- React application with Vite
- Nginx serving static files
- Auto-scaling enabled (2-10 replicas)
- ALB ingress for external access

## Prerequisites

1. **EKS Cluster**: Running EKS cluster with worker nodes
2. **AWS Load Balancer Controller**: Installed for ALB ingress
3. **Docker Images**: Built and pushed to ECR
4. **Helm 3**: Installed on your machine
5. **kubectl**: Configured for your EKS cluster

## Quick Start

### 1. Build and Push Images
```bash
./build-and-push-images.sh
```

### 2. Deploy Everything
```bash
./deploy-interviewdeck.sh
```

## Manual Deployment

### 1. Create Namespace
```bash
kubectl create namespace interviewdeck
```

### 2. Deploy PostgreSQL
```bash
helm install postgresql ./helm-charts/postgresql --namespace interviewdeck
```

### 3. Deploy Backend Services
```bash
helm install interviewdeck-backend ./helm-charts/interviewdeck-backend --namespace interviewdeck
```

### 4. Deploy Frontend
```bash
helm install interviewdeck-frontend ./helm-charts/interviewdeck-frontend --namespace interviewdeck
```

## Configuration

### Image Registry
Update the image repository in values files:
- `helm-charts/interviewdeck-frontend/values.yaml`
- `helm-charts/interviewdeck-backend/values.yaml`

### Domain Configuration
Update ingress hosts in values files:
- Frontend: `interviewdeck.yourdomain.com`
- Backend: `api.interviewdeck.yourdomain.com`

### SSL Certificates
Update the certificate ARN in ingress annotations:
```yaml
alb.ingress.kubernetes.io/certificate-arn: arn:aws:acm:region:account:certificate/cert-id
```

### Database Configuration
PostgreSQL settings in `helm-charts/postgresql/values.yaml`:
- Storage size (default: 20Gi)
- Resource limits
- Credentials (should use Kubernetes secrets in production)

## Monitoring

### Check Pod Status
```bash
kubectl get pods -n interviewdeck
```

### View Logs
```bash
# Backend services
kubectl logs -l app.kubernetes.io/component=auth-service -n interviewdeck
kubectl logs -l app.kubernetes.io/component=content-service -n interviewdeck
kubectl logs -l app.kubernetes.io/component=payment-service -n interviewdeck

# Frontend
kubectl logs -l app.kubernetes.io/name=interviewdeck-frontend -n interviewdeck
```

### Check Services
```bash
kubectl get services -n interviewdeck
kubectl get ingress -n interviewdeck
```

## Scaling

The application includes Horizontal Pod Autoscaler (HPA) configurations:
- CPU threshold: 80%
- Memory threshold: 80%
- Min replicas: 2
- Max replicas: 10

## Cleanup

```bash
helm uninstall interviewdeck-frontend -n interviewdeck
helm uninstall interviewdeck-backend -n interviewdeck
helm uninstall postgresql -n interviewdeck
kubectl delete namespace interviewdeck
```

## Troubleshooting

### Common Issues

1. **Pod Startup Issues**: Check resource limits and node capacity
2. **Database Connection**: Verify PostgreSQL service is running
3. **Image Pull Errors**: Ensure ECR permissions and image availability
4. **Ingress Issues**: Verify AWS Load Balancer Controller installation

### Health Checks

All services include readiness and liveness probes:
- Backend: `/actuator/health` endpoint
- Frontend: Root path `/`
- Database: `pg_isready` command
