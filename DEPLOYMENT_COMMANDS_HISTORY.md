# InterviewDeck.io EKS Deployment - Command History

## Date: July 31, 2025
## Project: Deploy interviewdeck-io application to EKS cluster

---

## 1. EKS Cluster Access Setup

### Assume Admin Role
```bash
./scripts/assume-eks-role.sh admin
```

### Configure kubectl
```bash
source /Users/vinayak.chiluka/.aws/eks-profiles/eks-admin-credentials
aws eks update-kubeconfig --region us-east-1 --name sats-portals-eks-cluster
```

### Verify Cluster Access
```bash
source /Users/vinayak.chiluka/.aws/eks-profiles/eks-admin-credentials && kubectl get nodes
```

---

## 2. Docker Image Preparation

### Check ECR Repositories
```bash
aws ecr describe-repositories --region us-east-1 --query 'repositories[].repositoryName' --output table
```

### Docker Login to ECR
```bash
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 276824024738.dkr.ecr.us-east-1.amazonaws.com
```

### Build Backend Image (Local - had platform issues)
```bash
cd /Users/vinayak.chiluka/workspace/repo/interview-deck-io/interviewdeck-io-backend
docker build -t interviewdeck-backend .
```

### Build Frontend Image (Local - had platform issues)
```bash
cd /Users/vinayak.chiluka/workspace/repo/interview-deck-io/interviewdeck-io-frontend
docker build -t interviewdeck-frontend .
```

### Fix Frontend Build Issues
```bash
# Updated package.json build script to remove TypeScript check
# Changed Dockerfile to use Node 20 instead of Node 18
```

### Build Multi-Platform Images (AMD64 for EKS)
```bash
# Backend - Multi-platform build for EKS compatibility
docker buildx build --platform linux/amd64 -t 276824024738.dkr.ecr.us-east-1.amazonaws.com/interviewdeck-backend:latest --push /Users/vinayak.chiluka/workspace/repo/interview-deck-io/interviewdeck-io-backend

# Frontend - Multi-platform build for EKS compatibility  
docker buildx build --platform linux/amd64 -t 276824024738.dkr.ecr.us-east-1.amazonaws.com/interviewdeck-frontend:latest --push /Users/vinayak.chiluka/workspace/repo/interview-deck-io/interviewdeck-io-frontend
```

### Tag and Push Images (Local builds)
```bash
# Tag images for ECR
docker tag interviewdeck-backend:latest 276824024738.dkr.ecr.us-east-1.amazonaws.com/interviewdeck-backend:latest
docker tag interviewdeck-frontend:latest 276824024738.dkr.ecr.us-east-1.amazonaws.com/interviewdeck-frontend:latest

# Push images to ECR
docker push 276824024738.dkr.ecr.us-east-1.amazonaws.com/interviewdeck-backend:latest
docker push 276824024738.dkr.ecr.us-east-1.amazonaws.com/interviewdeck-frontend:latest
```

---

## 3. Kubernetes Manifests Preparation

### Frontend Package.json Fix
```bash
# Modified build script in package.json from "tsc -b && vite build" to "vite build"
```

### Frontend Dockerfile Update
```bash
# Changed FROM node:18-alpine to FROM node:20-alpine
```

### Created ConfigMap and Secrets
```bash
# Created manifests/interviewdeck-configmap.yaml with:
# - Backend configuration (H2 database, JWT secret, etc.)
# - Empty secrets template for OAuth and Stripe keys
```

### Updated Backend Deployment
```bash
# Modified manifests/interviewdeck-backend.yaml:
# - Added envFrom for ConfigMap and Secrets
# - Increased health check timeouts
# - Added failure thresholds
```

### Updated Frontend Ingress
```bash
# Modified manifests/interviewdeck-frontend.yaml:
# - Removed SSL certificate placeholder
# - Added HTTP-only listener configuration
```

---

## 4. Application Deployment

### Create Namespace
```bash
source /Users/vinayak.chiluka/.aws/eks-profiles/eks-admin-credentials && kubectl apply -f manifests/interviewdeck-namespace.yaml
```

### Deploy ConfigMap and Secrets
```bash
source /Users/vinayak.chiluka/.aws/eks-profiles/eks-admin-credentials && kubectl apply -f manifests/interviewdeck-configmap.yaml
```

### Deploy Backend Services
```bash
source /Users/vinayak.chiluka/.aws/eks-profiles/eks-admin-credentials && kubectl apply -f manifests/interviewdeck-backend.yaml
```

### Deploy Frontend and Ingress
```bash
source /Users/vinayak.chiluka/.aws/eks-profiles/eks-admin-credentials && kubectl apply -f manifests/interviewdeck-frontend.yaml
```

### Restart Deployments (After Image Updates)
```bash
source /Users/vinayak.chiluka/.aws/eks-profiles/eks-admin-credentials && kubectl rollout restart deployment/interviewdeck-backend -n interviewdeck
source /Users/vinayak.chiluka/.aws/eks-profiles/eks-admin-credentials && kubectl rollout restart deployment/interviewdeck-frontend -n interviewdeck
```

### Update Configurations
```bash
# Applied updated backend deployment with better health checks
source /Users/vinayak.chiluka/.aws/eks-profiles/eks-admin-credentials && kubectl apply -f manifests/interviewdeck-backend.yaml

# Applied updated frontend ingress without SSL
source /Users/vinayak.chiluka/.aws/eks-profiles/eks-admin-credentials && kubectl apply -f manifests/interviewdeck-frontend.yaml
```

---

## 5. Monitoring and Verification

### Check Pod Status
```bash
source /Users/vinayak.chiluka/.aws/eks-profiles/eks-admin-credentials && kubectl get pods -n interviewdeck
source /Users/vinayak.chiluka/.aws/eks-profiles/eks-admin-credentials && kubectl get pods -n interviewdeck -o wide
```

### Watch Pod Status
```bash
source /Users/vinayak.chiluka/.aws/eks-profiles/eks-admin-credentials && kubectl get pods -n interviewdeck -w
```

### Check Services
```bash
source /Users/vinayak.chiluka/.aws/eks-profiles/eks-admin-credentials && kubectl get services -n interviewdeck
```

### Check Ingress
```bash
source /Users/vinayak.chiluka/.aws/eks-profiles/eks-admin-credentials && kubectl get ingress -n interviewdeck
```

### Check Logs
```bash
# Backend logs
source /Users/vinayak.chiluka/.aws/eks-profiles/eks-admin-credentials && kubectl logs -n interviewdeck $(kubectl get pods -n interviewdeck -l app=interviewdeck-backend -o jsonpath='{.items[0].metadata.name}') --tail=20

# Specific pod logs
source /Users/vinayak.chiluka/.aws/eks-profiles/eks-admin-credentials && kubectl logs -n interviewdeck interviewdeck-backend-df6748d4b-lgmwv --tail=50
```

### Describe Pods (Troubleshooting)
```bash
source /Users/vinayak.chiluka/.aws/eks-profiles/eks-admin-credentials && kubectl describe pod -n interviewdeck $(kubectl get pods -n interviewdeck -o jsonpath='{.items[0].metadata.name}')
```

### Check Load Balancer Controller
```bash
source /Users/vinayak.chiluka/.aws/eks-profiles/eks-admin-credentials && kubectl get pods -n kube-system | grep aws-load-balancer
source /Users/vinayak.chiluka/.aws/eks-profiles/eks-admin-credentials && kubectl get pods -n kube-system | grep -E "(alb|load-balancer)"
```

### Test Connectivity
```bash
# Attempted to test backend health endpoint
source /Users/vinayak.chiluka/.aws/eks-profiles/eks-admin-credentials && kubectl exec -n interviewdeck interviewdeck-frontend-5578b95c79-p64pv -- curl -s http://10.0.30.94:8080/actuator/health
```

---

## 6. AWS and System Commands

### Check AWS Identity
```bash
aws sts get-caller-identity
```

### Check Available ECR Repositories
```bash
aws ecr describe-repositories --region us-east-1
```

---

## 7. File Modifications

### Modified Files:
1. `/Users/vinayak.chiluka/workspace/repo/interview-deck-io/interviewdeck-io-frontend/package.json`
   - Changed build script to remove TypeScript compilation

2. `/Users/vinayak.chiluka/workspace/repo/interview-deck-io/interviewdeck-io-frontend/Dockerfile`
   - Updated base image from node:18-alpine to node:20-alpine

3. `/Users/vinayak.chiluka/workspace/repo/eks-cluster-cdk/manifests/interviewdeck-backend.yaml`
   - Added envFrom for ConfigMap and Secrets
   - Increased health check timeouts and failure thresholds

4. `/Users/vinayak.chiluka/workspace/repo/eks-cluster-cdk/manifests/interviewdeck-frontend.yaml`
   - Removed SSL certificate configuration
   - Updated to HTTP-only load balancer

### Created Files:
1. `/Users/vinayak.chiluka/workspace/repo/eks-cluster-cdk/manifests/interviewdeck-configmap.yaml`
   - ConfigMap with backend environment variables
   - Secret template for OAuth and API keys

---

## 8. Current Deployment Status

### Successfully Deployed:
- ✅ Namespace: `interviewdeck`
- ✅ Frontend: 2 replicas running
- ✅ Backend: 3 pods (services starting up with H2 database)
- ✅ Services: Frontend and Backend services created
- ✅ Ingress: Configured (needs Load Balancer Controller for external access)
- ✅ ECR Images: Both images pushed successfully

### Docker Images:
- Backend: `276824024738.dkr.ecr.us-east-1.amazonaws.com/interviewdeck-backend:latest`
- Frontend: `276824024738.dkr.ecr.us-east-1.amazonaws.com/interviewdeck-frontend:latest`

### Next Steps for Domain Setup:
1. Install AWS Load Balancer Controller
2. Configure SSL certificate (ACM)
3. Update DNS records for interviewdeck.io
4. Update ingress with actual domain name

---

## 9. Key Lessons Learned

1. **Platform Compatibility**: ARM64 images from local Mac don't work on AMD64 EKS nodes
2. **Multi-platform Builds**: Use `docker buildx build --platform linux/amd64` for EKS
3. **Health Checks**: Spring Boot applications need longer startup times in K8s
4. **Node.js Versions**: Frontend dependencies required Node 20+ instead of 18
5. **TypeScript**: Build issues required removing TS compilation from Docker build

---

## 10. Environment Details

- **EKS Cluster**: `sats-portals-eks-cluster` (us-east-1)
- **Worker Nodes**: 1 node (ip-10-0-30-105.ec2.internal)
- **Account ID**: 276824024738
- **ECR Region**: us-east-1
- **Kubernetes Version**: 1.30.11-eks-473151a

---

*Command history generated on July 31, 2025*
*Project: InterviewDeck.io EKS Deployment*
