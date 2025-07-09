#!/bin/bash

# Production-grade EKS destruction script

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
AWS_REGION=${AWS_REGION:-us-east-1}
CLUSTER_NAME="production-eks-cluster"

# Functions
log() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

confirm_destruction() {
    warn "This will destroy all EKS cluster resources including:"
    echo "  - EKS cluster and node groups"
    echo "  - VPC and networking components"
    echo "  - IAM roles and policies"
    echo "  - CloudWatch log groups"
    echo "  - Load balancers and associated resources"
    echo ""
    warn "This action cannot be undone!"
    echo ""
    read -p "Are you sure you want to continue? (type 'yes' to confirm): " confirmation
    
    if [[ "$confirmation" != "yes" ]]; then
        log "Destruction cancelled."
        exit 0
    fi
}

cleanup_load_balancers() {
    log "Cleaning up load balancers created by ALB controller..."
    
    # Get all load balancers tagged with the cluster
    aws elbv2 describe-load-balancers --region $AWS_REGION --query "LoadBalancers[?contains(LoadBalancerName, 'k8s-')]" --output table || true
    
    # Note: Manual cleanup may be required for ALB/NLB created by Kubernetes services
    warn "Please ensure all ALB/NLB resources created by Kubernetes services are deleted manually if needed."
}

cleanup_security_groups() {
    log "Cleaning up security groups..."
    
    # List security groups that may be created by EKS
    aws ec2 describe-security-groups --region $AWS_REGION --filters "Name=group-name,Values=k8s-*" --query "SecurityGroups[*].GroupId" --output table || true
    
    warn "Some security groups may need manual deletion if they have dependencies."
}

destroy_stacks() {
    log "Destroying CDK stacks..."
    
    # Build the project first
    log "Building TypeScript project..."
    npm run build
    
    # Destroy stacks in reverse order
    log "Destroying add-ons stack..."
    cdk destroy EksAddonsStack --force || warn "Failed to destroy add-ons stack, continuing..."
    
    log "Destroying EKS cluster stack..."
    cdk destroy EksClusterStack --force || warn "Failed to destroy cluster stack, continuing..."
    
    log "Destroying IAM stack..."
    cdk destroy EksIamStack --force || warn "Failed to destroy IAM stack, continuing..."
    
    log "Destroying VPC stack..."
    cdk destroy EksVpcStack --force || warn "Failed to destroy VPC stack, continuing..."
    
    log "All stacks destruction completed!"
}

cleanup_cloudwatch_logs() {
    log "Cleaning up CloudWatch log groups..."
    
    # Delete EKS cluster log groups
    aws logs delete-log-group --log-group-name "/aws/eks/cluster/logs" --region $AWS_REGION || true
    aws logs delete-log-group --log-group-name "/aws/containerinsights/$CLUSTER_NAME/application" --region $AWS_REGION || true
    aws logs delete-log-group --log-group-name "/aws/containerinsights/$CLUSTER_NAME/performance" --region $AWS_REGION || true
    
    # List remaining log groups
    log "Remaining CloudWatch log groups:"
    aws logs describe-log-groups --log-group-name-prefix "/aws/eks" --region $AWS_REGION --query "logGroups[*].logGroupName" --output table || true
}

cleanup_ssm_parameters() {
    log "Cleaning up SSM parameters..."
    
    # Delete SSM parameters created by the stack
    aws ssm delete-parameters --names \
        "/eks/vpc-id" \
        "/eks/private-subnet-ids" \
        "/eks/public-subnet-ids" \
        "/eks/cluster-role-arn" \
        "/eks/node-group-role-arn" \
        "/eks/alb-controller-role-arn" \
        "/eks/cluster-name" \
        "/eks/cluster-endpoint" \
        "/eks/oidc-issuer-url" \
        "/eks/cluster-security-group-id" \
        "/eks/sample-secret-arn" \
        "/eks/app/config/database-url" \
        "/eks/app/feature-flags/new-ui" \
        --region $AWS_REGION || true
    
    log "SSM parameters cleanup completed!"
}

cleanup_secrets() {
    log "Cleaning up AWS Secrets Manager secrets..."
    
    # Delete secrets created by the stack
    aws secretsmanager delete-secret --secret-id "eks-sample-secret" --force-delete-without-recovery --region $AWS_REGION || true
    
    log "Secrets cleanup completed!"
}

remove_kubectl_config() {
    log "Removing kubectl configuration..."
    
    # Remove cluster from kubeconfig
    kubectl config delete-cluster "arn:aws:eks:$AWS_REGION:$(aws sts get-caller-identity --query Account --output text):cluster/$CLUSTER_NAME" || true
    kubectl config delete-context "arn:aws:eks:$AWS_REGION:$(aws sts get-caller-identity --query Account --output text):cluster/$CLUSTER_NAME" || true
    kubectl config unset "users.arn:aws:eks:$AWS_REGION:$(aws sts get-caller-identity --query Account --output text):cluster/$CLUSTER_NAME" || true
    
    log "kubectl configuration cleanup completed!"
}

verify_cleanup() {
    log "Verifying cleanup..."
    
    # Check if cluster still exists
    if aws eks describe-cluster --name $CLUSTER_NAME --region $AWS_REGION &> /dev/null; then
        warn "EKS cluster still exists. Manual cleanup may be required."
    else
        log "EKS cluster successfully deleted."
    fi
    
    # Check for remaining resources
    log "Checking for remaining resources..."
    
    # Check VPC
    local vpc_id=$(aws ec2 describe-vpcs --filters "Name=tag:Name,Values=EksVpcStack*" --query "Vpcs[0].VpcId" --output text --region $AWS_REGION 2>/dev/null || echo "None")
    if [[ "$vpc_id" != "None" && "$vpc_id" != "null" ]]; then
        warn "VPC still exists: $vpc_id"
    fi
    
    # Check security groups
    local sg_count=$(aws ec2 describe-security-groups --filters "Name=group-name,Values=*eks*" --query "length(SecurityGroups)" --output text --region $AWS_REGION 2>/dev/null || echo "0")
    if [[ "$sg_count" != "0" ]]; then
        warn "$sg_count EKS-related security groups still exist"
    fi
    
    log "Cleanup verification completed!"
}

show_manual_cleanup_steps() {
    warn "If you encounter issues, you may need to manually clean up:"
    echo ""
    echo "1. Delete any remaining ALB/NLB resources:"
    echo "   aws elbv2 describe-load-balancers --region $AWS_REGION"
    echo ""
    echo "2. Delete any remaining security groups:"
    echo "   aws ec2 describe-security-groups --filters \"Name=group-name,Values=k8s-*\" --region $AWS_REGION"
    echo ""
    echo "3. Delete any remaining CloudWatch log groups:"
    echo "   aws logs describe-log-groups --log-group-name-prefix \"/aws/eks\" --region $AWS_REGION"
    echo ""
    echo "4. Check CloudFormation stacks:"
    echo "   aws cloudformation list-stacks --region $AWS_REGION"
    echo ""
    echo "5. If CDK stacks are stuck, try:"
    echo "   cdk destroy --force"
    echo ""
}

main() {
    log "Starting EKS cluster destruction..."
    
    confirm_destruction
    cleanup_load_balancers
    cleanup_security_groups
    destroy_stacks
    cleanup_cloudwatch_logs
    cleanup_ssm_parameters
    cleanup_secrets
    remove_kubectl_config
    verify_cleanup
    show_manual_cleanup_steps
    
    log "Destruction script completed!"
    log "Please check AWS console to ensure all resources are deleted."
}

# Handle script arguments
case "${1:-destroy}" in
    destroy)
        main
        ;;
    verify)
        verify_cleanup
        ;;
    cleanup-logs)
        cleanup_cloudwatch_logs
        ;;
    cleanup-ssm)
        cleanup_ssm_parameters
        ;;
    cleanup-secrets)
        cleanup_secrets
        ;;
    *)
        echo "Usage: $0 {destroy|verify|cleanup-logs|cleanup-ssm|cleanup-secrets}"
        exit 1
        ;;
esac
