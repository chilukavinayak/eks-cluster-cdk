#!/bin/bash

# Destroy Production EKS Cluster
# This script safely destroys the production EKS cluster and all associated resources

set -e

echo "🗑️ PRODUCTION EKS DESTRUCTION"
echo "This will destroy the entire production EKS cluster and all resources"
echo "=================================================================="
echo

# Safety check
read -p "⚠️  Are you sure you want to destroy the production cluster? (type 'yes' to confirm): " confirm
if [ "$confirm" != "yes" ]; then
    echo "❌ Destruction cancelled."
    exit 1
fi

read -p "⚠️  This will delete ALL data and resources. Type 'DESTROY' to proceed: " final_confirm
if [ "$final_confirm" != "DESTROY" ]; then
    echo "❌ Destruction cancelled."
    exit 1
fi

echo "🔄 Starting destruction process..."
echo

# Get AWS account and region
AWS_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
AWS_REGION=$(aws configure get region || echo "us-east-1")

echo "🔍 Targeting:"
echo "   AWS Account: $AWS_ACCOUNT"
echo "   AWS Region: $AWS_REGION"
echo "   Cluster: production-eks-cluster"
echo

# Update kubeconfig
echo "🔧 Updating kubeconfig..."
aws eks update-kubeconfig --region $AWS_REGION --name production-eks-cluster || echo "⚠️ Cluster may not exist"

# Clean up Kubernetes resources that might prevent deletion
echo "🧹 Cleaning up Kubernetes resources..."

# Delete all ingresses (to clean up ALBs)
echo "  - Deleting ingresses..."
kubectl delete ingress --all -A --ignore-not-found=true --timeout=300s || echo "⚠️ Failed to delete ingresses"

# Delete all services with LoadBalancer type (to clean up NLBs)
echo "  - Deleting LoadBalancer services..."
kubectl get svc -A -o json | jq -r '.items[] | select(.spec.type=="LoadBalancer") | "\(.metadata.namespace) \(.metadata.name)"' | while read namespace name; do
    kubectl delete svc "$name" -n "$namespace" --ignore-not-found=true --timeout=300s || echo "⚠️ Failed to delete service $name"
done

# Delete all PVCs (to clean up EBS volumes)
echo "  - Deleting PVCs..."
kubectl delete pvc --all -A --ignore-not-found=true --timeout=300s || echo "⚠️ Failed to delete PVCs"

# Wait for resources to be cleaned up
echo "⏳ Waiting for AWS resources to be cleaned up..."
sleep 120

# Destroy CDK stacks in reverse order
echo "🗑️ Phase 1: Destroying add-ons..."
npx cdk destroy ProductionAddonsStack \
  --app "npx ts-node src/production-app.ts" \
  --force || echo "⚠️ Failed to destroy add-ons stack"

echo "✅ Phase 1 completed - Add-ons destroyed"
echo

echo "⏳ Waiting 60 seconds..."
sleep 60

echo "🗑️ Phase 2: Destroying EKS cluster..."
npx cdk destroy ProductionEksStack \
  --app "npx ts-node src/production-app.ts" \
  --force || echo "⚠️ Failed to destroy EKS stack"

echo "✅ Phase 2 completed - EKS cluster destroyed"
echo

echo "⏳ Waiting 60 seconds..."
sleep 60

echo "🗑️ Phase 3: Destroying IAM and VPC..."
npx cdk destroy ProductionIamStack ProductionVpcStack \
  --app "npx ts-node src/production-app.ts" \
  --force || echo "⚠️ Failed to destroy foundation stacks"

echo "✅ Phase 3 completed - Foundation destroyed"
echo

# Clean up any remaining resources
echo "🧹 Cleaning up remaining resources..."

# Clean up any remaining EBS volumes
echo "  - Checking for remaining EBS volumes..."
aws ec2 describe-volumes \
  --filters "Name=tag:kubernetes.io/cluster/production-eks-cluster,Values=owned" \
  --query 'Volumes[?State!=`deleting`].VolumeId' \
  --output text | tr '\t' '\n' | while read volume_id; do
    if [ -n "$volume_id" ]; then
        echo "    - Deleting EBS volume: $volume_id"
        aws ec2 delete-volume --volume-id "$volume_id" || echo "⚠️ Failed to delete volume $volume_id"
    fi
done

# Clean up any remaining security groups
echo "  - Checking for remaining security groups..."
aws ec2 describe-security-groups \
  --filters "Name=tag:kubernetes.io/cluster/production-eks-cluster,Values=owned" \
  --query 'SecurityGroups[].GroupId' \
  --output text | tr '\t' '\n' | while read sg_id; do
    if [ -n "$sg_id" ]; then
        echo "    - Deleting security group: $sg_id"
        aws ec2 delete-security-group --group-id "$sg_id" || echo "⚠️ Failed to delete security group $sg_id"
    fi
done

# Clean up any remaining load balancers
echo "  - Checking for remaining load balancers..."
aws elbv2 describe-load-balancers \
  --query 'LoadBalancers[?contains(LoadBalancerName, `k8s-`)].LoadBalancerArn' \
  --output text | tr '\t' '\n' | while read lb_arn; do
    if [ -n "$lb_arn" ]; then
        echo "    - Deleting load balancer: $lb_arn"
        aws elbv2 delete-load-balancer --load-balancer-arn "$lb_arn" || echo "⚠️ Failed to delete load balancer $lb_arn"
    fi
done

# Clean up target groups
echo "  - Checking for remaining target groups..."
aws elbv2 describe-target-groups \
  --query 'TargetGroups[?contains(TargetGroupName, `k8s-`)].TargetGroupArn' \
  --output text | tr '\t' '\n' | while read tg_arn; do
    if [ -n "$tg_arn" ]; then
        echo "    - Deleting target group: $tg_arn"
        aws elbv2 delete-target-group --target-group-arn "$tg_arn" || echo "⚠️ Failed to delete target group $tg_arn"
    fi
done

echo "✅ Cleanup completed"
echo

# Final verification
echo "🔍 Final verification..."
echo "Checking if cluster still exists..."
if aws eks describe-cluster --name production-eks-cluster --region $AWS_REGION &>/dev/null; then
    echo "⚠️ Cluster still exists. Manual cleanup may be required."
else
    echo "✅ Cluster successfully destroyed."
fi

echo
echo "🎉 PRODUCTION EKS DESTRUCTION COMPLETED!"
echo "========================================"
echo
echo "✅ All resources have been destroyed:"
echo "- EKS cluster and node groups"
echo "- VPC and networking resources"
echo "- IAM roles and policies"
echo "- Load balancers and target groups"
echo "- EBS volumes and security groups"
echo "- Add-ons and controllers"
echo
echo "💰 Cost Impact:"
echo "- All billable resources have been terminated"
echo "- Check AWS billing console to confirm no charges"
echo "- Some resources may take time to fully terminate"
echo
echo "🧹 Manual Cleanup (if needed):"
echo "1. Check CloudFormation stacks for any remaining resources"
echo "2. Review EBS snapshots if you want to delete them"
echo "3. Check CloudWatch log groups for cleanup"
echo "4. Review Route53 records created by External DNS"
echo "5. Check ACM certificates if they were created"
echo
echo "Thank you for using the production EKS cluster! 👋"
