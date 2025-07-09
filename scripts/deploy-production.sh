#!/bin/bash

# Deploy Production EKS Cluster
# This script deploys a full-featured, production-ready EKS cluster

set -e

echo "🚀 PRODUCTION EKS DEPLOYMENT"
echo "This will deploy a complete production-ready EKS cluster with all features"
echo "========================================================================"
echo

# Check prerequisites
echo "📋 Checking prerequisites..."

# Check AWS CLI
if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI not found. Please install AWS CLI first."
    exit 1
fi

# Check kubectl
if ! command -v kubectl &> /dev/null; then
    echo "❌ kubectl not found. Please install kubectl first."
    exit 1
fi

# Check helm
if ! command -v helm &> /dev/null; then
    echo "❌ Helm not found. Please install Helm first."
    exit 1
fi

# Check AWS credentials
if ! aws sts get-caller-identity &> /dev/null; then
    echo "❌ AWS credentials not configured. Please configure AWS credentials."
    exit 1
fi

# Get AWS account and region
AWS_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
AWS_REGION=$(aws configure get region || echo "us-east-1")

echo "✅ Prerequisites checked"
echo "   AWS Account: $AWS_ACCOUNT"
echo "   AWS Region: $AWS_REGION"
echo

# Bootstrap CDK if needed
echo "🔧 Bootstrapping CDK..."
npx cdk bootstrap aws://$AWS_ACCOUNT/$AWS_REGION --app "npx ts-node src/production-app.ts"
echo "✅ CDK bootstrapped"
echo

# Build TypeScript
echo "🔨 Building TypeScript..."
npm run build
echo "✅ TypeScript built"
echo

# Deploy in phases to avoid rate limiting
echo "📦 Phase 1: Deploying VPC and IAM foundation..."
npx cdk deploy ProductionVpcStack ProductionIamStack \
  --app "npx ts-node src/production-app.ts" \
  --require-approval never \
  --concurrency 2

echo "✅ Phase 1 completed - VPC and IAM deployed"
echo

echo "⏳ Waiting 60 seconds for IAM propagation..."
sleep 60

echo "📦 Phase 2: Deploying EKS cluster..."
npx cdk deploy ProductionEksStack \
  --app "npx ts-node src/production-app.ts" \
  --require-approval never

echo "✅ Phase 2 completed - EKS cluster deployed"
echo

echo "⏳ Waiting 120 seconds for cluster stabilization..."
sleep 120

# Configure kubectl
echo "🔧 Configuring kubectl..."
aws eks update-kubeconfig --region $AWS_REGION --name production-eks-cluster
echo "✅ kubectl configured"
echo

# Test cluster connectivity
echo "🧪 Testing cluster connectivity..."
kubectl get svc
kubectl get nodes
echo "✅ Cluster is accessible"
echo

echo "📦 Phase 3: Deploying add-ons..."
npx cdk deploy ProductionAddonsStack \
  --app "npx ts-node src/production-app.ts" \
  --require-approval never

echo "✅ Phase 3 completed - Add-ons deployed"
echo

# Wait for add-ons to be ready
echo "⏳ Waiting for add-ons to be ready..."
sleep 60

# Verify add-ons
echo "🔍 Verifying add-ons..."
echo "Checking AWS Load Balancer Controller..."
kubectl get deployment -n kube-system aws-load-balancer-controller || echo "⚠️ ALB Controller not ready yet"

echo "Checking Cluster Autoscaler..."
kubectl get deployment -n kube-system cluster-autoscaler || echo "⚠️ Cluster Autoscaler not ready yet"

echo "Checking Metrics Server..."
kubectl get deployment -n kube-system metrics-server || echo "⚠️ Metrics Server not ready yet"

echo "Checking CoreDNS..."
kubectl get deployment -n kube-system coredns || echo "⚠️ CoreDNS not ready yet"

echo "Checking all pods..."
kubectl get pods -A

echo
echo "🎉 PRODUCTION EKS DEPLOYMENT COMPLETED!"
echo "========================================"
echo
echo "📊 Cluster Information:"
echo "- Cluster Name: production-eks-cluster"
echo "- Region: $AWS_REGION"
echo "- Account: $AWS_ACCOUNT"
echo "- Endpoint: $(kubectl config view --minify -o jsonpath='{.clusters[0].cluster.server}')"
echo
echo "🛠️ Available Features:"
echo "- ✅ Multi-AZ EKS cluster with managed node groups"
echo "- ✅ Primary, Spot, and High-Memory node groups"
echo "- ✅ AWS Load Balancer Controller for ALB/NLB"
echo "- ✅ Cluster Autoscaler for automatic scaling"
echo "- ✅ Metrics Server for HPA"
echo "- ✅ External DNS for Route53 integration"
echo "- ✅ Fluent Bit for CloudWatch logging"
echo "- ✅ Kubernetes Dashboard"
echo "- ✅ Secrets Store CSI Driver with AWS provider"
echo "- ✅ Network policies for security"
echo "- ✅ RBAC and service accounts"
echo "- ✅ KMS encryption for secrets"
echo "- ✅ Comprehensive monitoring and logging"
echo
echo "🔧 Next Steps:"
echo "1. Deploy your applications to the 'demo-app' namespace"
echo "2. Configure your domain in Route53 for External DNS"
echo "3. Set up SSL certificates in ACM"
echo "4. Configure monitoring alerts in CloudWatch"
echo "5. Set up backup policies for EBS volumes"
echo
echo "📝 Common Commands:"
echo "- View cluster: kubectl get nodes"
echo "- View all pods: kubectl get pods -A"
echo "- View ingress: kubectl get ingress -n demo-app"
echo "- View HPA: kubectl get hpa -n demo-app"
echo "- View logs: kubectl logs -n demo-app -l app=demo-app"
echo "- Scale deployment: kubectl scale deployment demo-app -n demo-app --replicas=5"
echo
echo "🚨 Important Notes:"
echo "- This is a production cluster with real AWS resources"
echo "- Monitor your AWS costs as this cluster will incur charges"
echo "- Review and adjust resource limits based on your needs"
echo "- Consider setting up automated backups and disaster recovery"
echo "- Regularly update cluster and add-on versions"
echo
echo "Happy Kubernetes! 🎉"
