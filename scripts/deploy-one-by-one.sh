#!/bin/bash

# EKS Cluster One-by-One Deployment Script
# This script deploys each stack individually with delays to avoid rate limiting

set -e  # Exit on any error

echo "🚀 Starting EKS Cluster deployment (one by one approach)"
echo "This will take approximately 30-45 minutes total"
echo

# Function to wait with countdown
wait_with_countdown() {
    local seconds=$1
    local message=$2
    
    echo "$message"
    for ((i=seconds; i>=1; i--)); do
        printf "\rWaiting %d seconds... " $i
        sleep 1
    done
    echo
}

# Function to check if deployment was successful
check_deployment() {
    local stack_name=$1
    local status=$(aws cloudformation describe-stacks --stack-name $stack_name --query 'Stacks[0].StackStatus' --output text 2>/dev/null || echo "NOT_FOUND")
    
    if [[ "$status" == "CREATE_COMPLETE" || "$status" == "UPDATE_COMPLETE" ]]; then
        echo "✅ $stack_name deployed successfully"
        return 0
    else
        echo "❌ $stack_name deployment failed or not found (Status: $status)"
        return 1
    fi
}

# Step 1: Deploy VPC
echo "📦 Step 1/5: Deploying VPC Stack..."
npx cdk deploy EksVpcStack --require-approval never
check_deployment "EksVpcStack"
wait_with_countdown 60 "Waiting for VPC to stabilize..."

# Step 2: Deploy IAM
echo "📦 Step 2/5: Deploying IAM Stack..."
npx cdk deploy EksIamStack --require-approval never
check_deployment "EksIamStack"
wait_with_countdown 60 "Waiting for IAM roles to propagate..."

# Step 3: Deploy EKS Cluster (control plane only)
echo "📦 Step 3/5: Deploying EKS Cluster Stack (control plane only)..."
echo "⚠️  If this fails with rate limiting, try:"
echo "   npx cdk deploy MinimalEksClusterStack --require-approval never"
npx cdk deploy EksClusterStack --require-approval never
check_deployment "EksClusterStack"
wait_with_countdown 180 "Waiting for cluster control plane to be ready..."

# Check cluster status
echo "🔍 Checking cluster status..."
cluster_status=$(aws eks describe-cluster --name production-eks-cluster --query 'cluster.status' --output text 2>/dev/null || echo "NOT_FOUND")
if [[ "$cluster_status" == "ACTIVE" ]]; then
    echo "✅ Cluster is ACTIVE"
else
    echo "⚠️  Cluster status: $cluster_status (may still be creating)"
fi

# Step 4: Deploy Node Groups
echo "📦 Step 4/5: Deploying Node Groups Stack..."
npx cdk deploy EksNodeGroupsStack --require-approval never
check_deployment "EksNodeGroupsStack"
wait_with_countdown 120 "Waiting for nodes to be ready..."

# Configure kubectl
echo "🔧 Configuring kubectl..."
aws eks update-kubeconfig --region ${AWS_DEFAULT_REGION:-us-east-1} --name production-eks-cluster

# Check nodes
echo "🔍 Checking node status..."
kubectl get nodes || echo "⚠️  Nodes not ready yet, you may need to wait longer"

# Step 5: Deploy Add-ons
echo "📦 Step 5/5: Deploying Add-ons Stack..."
npx cdk deploy EksAddonsStack --require-approval never
check_deployment "EksAddonsStack"

echo
echo "🎉 Deployment completed successfully!"
echo
echo "Next steps:"
echo "1. Check cluster status: kubectl get nodes"
echo "2. Check add-ons: kubectl get pods -n kube-system"
echo "3. Test ALB controller: kubectl get ingressclass"
echo
echo "If you encounter any issues, check the deployment logs above."
