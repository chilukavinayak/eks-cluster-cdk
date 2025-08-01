# EKS Kubectl Authentication Issue & Solution

## 🚨 Current Issue
The AWS user `shakti` doesn't have permissions to access the EKS cluster via kubectl.

## 📋 Status
✅ **Domain nameservers propagated** - AWS Route53 active  
✅ **Docker images built and pushed** to ECR  
✅ **Helm charts created** for frontend/backend/ingress  
❌ **kubectl authentication** - needs cluster access setup

## 🔧 Solution Options

### Option 1: Add IAM User to EKS Cluster (Recommended)

Run this from the **admin user** who created the cluster:

```bash
# Get current configmap
kubectl get configmap aws-auth -n kube-system -o yaml > aws-auth.yaml

# Edit the configmap to add user permissions
kubectl edit configmap aws-auth -n kube-system
```

Add this section to the configmap:
```yaml
mapUsers: |
  - userarn: arn:aws:iam::276824024738:user/shakti
    username: shakti
    groups:
    - system:masters
```

### Option 2: Use Admin Credentials Temporarily

If you have access to the admin credentials that created the cluster:

```bash
# Switch to admin profile
export AWS_PROFILE=admin-profile-name

# Update kubeconfig
aws eks update-kubeconfig --region us-east-1 --name sats-portals-eks-cluster

# Run deployment
./deploy-with-helm.sh
```

### Option 3: Deploy via AWS CLI (Alternative)

```bash
# Deploy using CDK with additional manifests
cd /path/to/cdk-project
cdk deploy --all
```

## 🚀 Quick Deploy (Once kubectl works)

```bash
cd /Users/vinayak.chiluka/workspace/repo/eks-cluster-cdk
./deploy-with-helm.sh
```

## 📊 What's Ready to Deploy

1. **Backend Services**: Auth, Content, Payment (Spring Boot)
2. **Frontend**: React application (NGINX)  
3. **Load Balancer**: ALB with SSL certificate
4. **Auto-scaling**: HPA configured
5. **Health Checks**: Liveness/readiness probes
6. **DNS**: Route53 records ready to create

## 🔍 Check Current Status

```bash
# Verify DNS propagation (✅ Working)
dig NS interviewdeck.io

# Check SSL certificate status
aws acm describe-certificate \
  --certificate-arn arn:aws:acm:us-east-1:276824024738:certificate/03d76270-6adb-4647-a2b4-daa0edad3f4a \
  --region us-east-1 \
  --query 'Certificate.Status'

# Check cluster status (✅ Working)
aws eks describe-cluster --name sats-portals-eks-cluster --region us-east-1 --query 'cluster.status'
```

## 📝 Next Steps

1. **Fix kubectl authentication** (use one of the options above)
2. **Run deployment script**: `./deploy-with-helm.sh`
3. **Test application**: https://interviewdeck.io

---

**Everything is ready for deployment once kubectl authentication is resolved!**
