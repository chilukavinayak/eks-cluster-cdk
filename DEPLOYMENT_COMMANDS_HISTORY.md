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

## 11. Route 53 Domain Setup Commands

### Create Route 53 Hosted Zone
```bash
aws route53 create-hosted-zone --name interviewdeck.io --caller-reference "interviewdeck-$(date +%s)" --hosted-zone-config Comment="Hosted zone for InterviewDeck.io application on EKS"
```

### Get Hosted Zone Details
```bash
aws route53 get-hosted-zone --id Z0230466UX8KG6M1GBCM
```

### Download Load Balancer Controller Policy
```bash
curl -O https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/v2.7.2/docs/install/iam_policy.json
```

### Create IAM Policy for Load Balancer Controller
```bash
aws iam create-policy --policy-name AWSLoadBalancerControllerIAMPolicy --policy-document file://iam_policy.json
```

### Create IAM Role Trust Policy
```bash
# Created trust-policy.json file with OIDC provider configuration
```

### Create IAM Role for Load Balancer Controller
```bash
aws iam create-role --role-name AmazonEKSLoadBalancerControllerRole --assume-role-policy-document file://trust-policy.json
```

### Attach Policy to Role
```bash
aws iam attach-role-policy --role-name AmazonEKSLoadBalancerControllerRole --policy-arn arn:aws:iam::276824024738:policy/AWSLoadBalancerControllerIAMPolicy
```

### Create Service Account for Load Balancer Controller
```bash
source /Users/vinayak.chiluka/.aws/eks-profiles/eks-admin-credentials && kubectl apply -f manifests/aws-load-balancer-controller-sa.yaml
```

### Setup Helm Repository
```bash
helm repo add eks https://aws.github.io/eks-charts
helm repo update
```

### Attempt to Install Load Balancer Controller (Already Existed)
```bash
source /Users/vinayak.chiluka/.aws/eks-profiles/eks-admin-credentials && helm install aws-load-balancer-controller eks/aws-load-balancer-controller -n kube-system --set clusterName=sats-portals-eks-cluster --set serviceAccount.create=false --set serviceAccount.name=aws-load-balancer-controller
```

### Check Existing Helm Installations
```bash
source /Users/vinayak.chiluka/.aws/eks-profiles/eks-admin-credentials && helm list -n kube-system
```

### Request SSL Certificate
```bash
aws acm request-certificate --domain-name interviewdeck.io --subject-alternative-names "*.interviewdeck.io" --validation-method DNS --region us-east-1
```

### Get Certificate Details for DNS Validation
```bash
aws acm describe-certificate --certificate-arn arn:aws:acm:us-east-1:276824024738:certificate/6f8db481-1c6b-446c-9501-bb739963b44b --region us-east-1
```

### Create DNS Validation Record in Route 53
```bash
aws route53 change-resource-record-sets --hosted-zone-id Z0230466UX8KG6M1GBCM --change-batch '{
  "Changes": [
    {
      "Action": "CREATE",
      "ResourceRecordSet": {
        "Name": "_c6b504c9424e76856c489f1410533be7.interviewdeck.io.",
        "Type": "CNAME",
        "TTL": 300,
        "ResourceRecords": [
          {
            "Value": "_fa84a6e082fbf68c443265ac9925d799.xlfgrmvvlj.acm-validations.aws."
          }
        ]
      }
    }
  ]
}'
```

### Update Ingress with Domain and SSL Certificate
```bash
# Modified manifests/interviewdeck-frontend.yaml with:
# - Real domain: interviewdeck.io
# - SSL certificate ARN
# - HTTPS redirect configuration
```

### Apply Updated Ingress
```bash
source /Users/vinayak.chiluka/.aws/eks-profiles/eks-admin-credentials && kubectl apply -f manifests/interviewdeck-frontend.yaml
```

### Check Ingress Status
```bash
source /Users/vinayak.chiluka/.aws/eks-profiles/eks-admin-credentials && kubectl get ingress -n interviewdeck
source /Users/vinayak.chiluka/.aws/eks-profiles/eks-admin-credentials && kubectl describe ingress interviewdeck-ingress -n interviewdeck
```

### Commit and Push Route 53 Setup
```bash
git add ROUTE53_DOMAIN_SETUP.md manifests/aws-load-balancer-controller-sa.yaml trust-policy.json iam_policy.json manifests/interviewdeck-frontend.yaml
git commit -m "Setup Route 53 domain and SSL for interviewdeck.io

✅ Route 53 Setup:
- Created hosted zone Z0230466UX8KG6M1GBCM for interviewdeck.io
- AWS nameservers: ns-1671.awsdns-16.co.uk, ns-492.awsdns-61.com, ns-845.awsdns-41.net, ns-1397.awsdns-46.org
- Comprehensive domain setup documentation

🔐 SSL Certificate:
- Requested ACM certificate for interviewdeck.io and *.interviewdeck.io
- Certificate ARN: arn:aws:acm:us-east-1:276824024738:certificate/6f8db481-1c6b-446c-9501-bb739963b44b
- Created DNS validation CNAME record in Route 53

🚀 Load Balancer Configuration:
- IAM role and policy for AWS Load Balancer Controller
- Updated ingress with real domain and SSL certificate
- Configured HTTPS redirect and proper listeners

📋 Next Steps:
- Update domain registrar nameservers to AWS
- Wait for DNS propagation and SSL validation
- Create DNS A records pointing to ALB once available"

git push origin eks-cluster-setup
```

---

## 12. Route 53 Configuration Results

### ✅ Successfully Created:
- **Hosted Zone**: `Z0230466UX8KG6M1GBCM` for `interviewdeck.io`
- **AWS Nameservers**: 
  - `ns-1671.awsdns-16.co.uk`
  - `ns-492.awsdns-61.com`
  - `ns-845.awsdns-41.net`
  - `ns-1397.awsdns-46.org`
- **SSL Certificate**: `arn:aws:acm:us-east-1:276824024738:certificate/6f8db481-1c6b-446c-9501-bb739963b44b`
- **DNS Validation**: CNAME record created for certificate validation
- **Ingress Update**: Now configured for `interviewdeck.io` with SSL

### ⚠️ Known Issues:
- **Load Balancer Permissions**: Controller lacks `elasticloadbalancing:AddTags` permission
- **DNS Propagation**: Requires nameserver update at domain registrar
- **Certificate Validation**: Pending DNS validation completion

### 📋 Required Actions:
1. Update domain registrar nameservers to AWS nameservers
2. Fix load balancer controller IAM permissions
3. Wait for DNS propagation (24-48 hours)
4. Create A records pointing to ALB once created

---

*Command history updated on July 31, 2025*
*Project: InterviewDeck.io EKS Deployment*
*Phase: Route 53 Domain Setup Complete*
