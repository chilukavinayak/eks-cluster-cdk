# Commands History - Sats Portals EKS Cluster

## Project Setup
```bash
# Initialize npm project
npm init -y

# Install CDK dependencies
npm install aws-cdk-lib constructs source-map-support

# Install development dependencies
npm install --save-dev typescript @types/node ts-node aws-cdk
```

## Completed Commands
```bash
# Initialize TypeScript configuration
npx tsc --init ✅

# Compile TypeScript
npm run build ✅

# Test CDK synthesis
npm run synth ✅ (with validation errors fixed)

# Find available VPCs
aws ec2 describe-vpcs --region us-east-1 --query "Vpcs[*].[VpcId,IsDefault,CidrBlock]" --output table ✅

# Configuration updated with VPC: vpc-092aba922d044380f (default VPC)
# Instance type updated to m5.large ✅
# Fixed circular dependencies and token resolution issues ✅
# Modified for default VPC (public subnets) compatibility ✅
# Created private subnet configuration in environment.json ✅
# Modified foundation stack to create private subnets with NAT Gateway ✅
# Updated to use 10.0.0.0/16 CIDR range ✅
# Added createNewVpc flag to choose between new VPC or existing VPC ✅
# Foundation stack now creates complete VPC with public/private subnets ✅
```

## Deployment Commands (COMPLETED ✅)
```bash
# Bootstrap CDK (run once per AWS account/region)
cdk bootstrap ✅

# Deploy stacks incrementally (COMPLETED - OLD APPROACH)
cdk deploy sats-portals-dev-Foundation --require-approval never ✅
cdk deploy sats-portals-dev-EksCluster --require-approval never ✅
cdk deploy sats-portals-dev-Compute --require-approval never ✅
cdk deploy sats-portals-dev-Addons --require-approval never ✅

# Configure kubectl access
aws eks update-kubeconfig --region us-east-1 --name sats-portals-eks-cluster ✅

# Test cluster access
kubectl get nodes ✅
kubectl get pods --all-namespaces ✅
```

## 🆕 NEW IMPROVED DEPLOYMENT (Role-Based Access)
```bash
# Bootstrap CDK (if not done already)
cdk bootstrap

# Deploy with proper IAM role management
cdk deploy sats-portals-dev-Foundation --require-approval never
cdk deploy sats-portals-dev-IAM --require-approval never
cdk deploy sats-portals-dev-EksCluster --require-approval never
cdk deploy sats-portals-dev-Compute --require-approval never  
cdk deploy sats-portals-dev-Addons --require-approval never

# Configure role-based access
./scripts/assume-eks-role.sh admin
source ~/.aws/eks-profiles/eks-admin-credentials
aws eks update-kubeconfig --region us-east-1 --name sats-portals-eks-cluster

# Apply RBAC configurations
kubectl apply -f rbac-configs/developer-rbac.yaml
kubectl apply -f rbac-configs/readonly-rbac.yaml

# Test access with different roles
./scripts/assume-eks-role.sh readonly
./scripts/assume-eks-role.sh dev
```

## Cluster Access and Management
```bash
# Get cluster information
aws eks describe-cluster --name sats-portals-eks-cluster

# Check add-on versions
aws eks list-addons --cluster-name sats-portals-eks-cluster
aws eks describe-addon --cluster-name sats-portals-eks-cluster --addon-name vpc-cni
aws eks describe-addon --cluster-name sats-portals-eks-cluster --addon-name coredns
aws eks describe-addon --cluster-name sats-portals-eks-cluster --addon-name kube-proxy
aws eks describe-addon --cluster-name sats-portals-eks-cluster --addon-name aws-ebs-csi-driver

# Update add-ons to latest compatible versions
aws eks update-addon --cluster-name sats-portals-eks-cluster --addon-name vpc-cni --addon-version v1.20.0-eksbuild.1
aws eks update-addon --cluster-name sats-portals-eks-cluster --addon-name coredns --addon-version v1.11.4-eksbuild.14
aws eks update-addon --cluster-name sats-portals-eks-cluster --addon-name kube-proxy --addon-version v1.30.14-eksbuild.2
aws eks update-addon --cluster-name sats-portals-eks-cluster --addon-name aws-ebs-csi-driver --addon-version v1.46.0-eksbuild.1

# View nodes and pods
kubectl get nodes
kubectl get pods --all-namespaces
kubectl get services --all-namespaces

# Check cluster resources
kubectl describe nodes
kubectl top nodes
kubectl get events --all-namespaces --sort-by='.lastTimestamp'
```

## Add-on Version Compatibility Status
Current versions vs Latest compatible for Kubernetes 1.30:
- **VPC CNI**: v1.18.1-eksbuild.1 → v1.20.0-eksbuild.1 (needs update)
- **CoreDNS**: v1.11.1-eksbuild.9 → v1.11.4-eksbuild.14 (needs update)  
- **Kube Proxy**: v1.30.0-eksbuild.3 → v1.30.14-eksbuild.2 (needs update)
- **EBS CSI**: v1.30.0-eksbuild.1 → v1.46.0-eksbuild.1 (needs update)

## ✨ NEW: Role-Based Access Benefits

**🔒 Security Improvements:**
- ✅ No hardcoded users in infrastructure code
- ✅ Principle of least privilege access
- ✅ Easy credential rotation and management
- ✅ Audit trail for all cluster access
- ✅ Temporary credentials with automatic expiration

**👥 Team Management:**
- ✅ Multiple access levels (Admin, Dev, ReadOnly, CI/CD)
- ✅ Easy onboarding/offboarding of team members
- ✅ Role-based permissions with RBAC
- ✅ Scalable to multiple teams and projects

**🚀 Operations:**
- ✅ Automated role assumption scripts
- ✅ CI/CD pipeline ready
- ✅ Compatible with identity providers (OIDC)
- ✅ Works with AWS SSO and external IdPs

## Infrastructure Summary
✅ **Successfully Deployed:**
- VPC with public/private subnets across 3 AZs
- EKS Cluster v1.30 with comprehensive logging
- Managed Node Groups (primary + spot instances)
- Fargate profiles for system and application workloads  
- Essential add-ons (VPC CNI, CoreDNS, Kube Proxy, EBS CSI)
- KMS encryption for secrets and logs
- Production-ready security configurations
- **NEW:** Role-based IAM access management
- **NEW:** RBAC configurations for different user types

## Project Details
- **Project Name**: sats portals
- **Region**: us-east-1
- **Environment**: dev
- **Cluster Name**: sats-portals-eks-cluster
- **VPC CIDR**: 10.0.0.0/16
- **Service CIDR**: 172.20.0.0/16
