#!/bin/bash

# Deploy MINIMAL EKS cluster - just get SOMETHING working first
set -e

echo "🎯 MINIMAL EKS DEPLOYMENT"
echo "This deploys ONLY the control plane using raw CloudFormation"
echo "Goal: Get basic cluster working, then add everything else manually"
echo

# Deploy in order with delays
echo "📦 1/3: Deploying VPC..."
npx cdk deploy EksVpcStack --require-approval never
echo "✅ VPC deployed"
echo "Waiting 60 seconds..."
sleep 60

echo "📦 2/3: Deploying IAM..."
npx cdk deploy EksIamStack --require-approval never
echo "✅ IAM deployed"
echo "Waiting 60 seconds..."
sleep 60

echo "📦 3/3: Deploying Super Minimal EKS..."
npx cdk deploy SuperMinimalEksStack --require-approval never
echo "✅ Minimal EKS deployed"

echo "🔧 Configuring kubectl..."
aws eks update-kubeconfig --region ${AWS_DEFAULT_REGION:-us-east-1} --name production-eks-cluster

echo "🧪 Testing cluster..."
kubectl get svc

echo
echo "🎉 SUCCESS! You now have a working EKS cluster (control plane only)"
echo
echo "Next steps (do these MANUALLY):"
echo "1. Add node group via AWS Console"
echo "2. Install ALB Controller manually"
echo "3. Test with a simple pod"
echo
echo "To add node group:"
echo "1. Go to AWS Console -> EKS -> production-eks-cluster"
echo "2. Click 'Add node group'"
echo "3. Use role: EksNodeGroupRole"
echo "4. Use instance type: m5.large"
echo "5. Use private subnets"
