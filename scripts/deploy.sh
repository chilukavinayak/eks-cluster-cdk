#!/bin/bash

# Production-grade EKS deployment script

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

check_prerequisites() {
    log "Checking prerequisites..."
    
    # Check if AWS CLI is installed
    if ! command -v aws &> /dev/null; then
        error "AWS CLI is not installed. Please install it first."
    fi
    
    # Check if CDK is installed
    if ! command -v cdk &> /dev/null; then
        error "AWS CDK is not installed. Please install it with: npm install -g aws-cdk"
    fi
    
    # Check if kubectl is installed
    if ! command -v kubectl &> /dev/null; then
        warn "kubectl is not installed. You'll need it to manage the cluster."
    fi
    
    # Check AWS credentials
    if ! aws sts get-caller-identity &> /dev/null; then
        error "AWS credentials are not configured. Please run 'aws configure' first."
    fi
    
    log "Prerequisites check passed!"
}

install_dependencies() {
    log "Installing dependencies..."
    npm install
    log "Dependencies installed successfully!"
}

bootstrap_cdk() {
    log "Bootstrapping CDK..."
    
    # Check if CDK is already bootstrapped
    if aws cloudformation describe-stacks --stack-name CDKToolkit --region $AWS_REGION &> /dev/null; then
        log "CDK already bootstrapped in region $AWS_REGION"
    else
        log "Bootstrapping CDK in region $AWS_REGION..."
        cdk bootstrap --region $AWS_REGION
        log "CDK bootstrapped successfully!"
    fi
}

deploy_infrastructure() {
    log "Deploying infrastructure..."
    
    # Build the project
    log "Building TypeScript project..."
    npm run build
    
    # Deploy stacks in order
    log "Deploying VPC stack..."
    cdk deploy EksVpcStack --require-approval never
    
    log "Deploying IAM stack..."
    cdk deploy EksIamStack --require-approval never
    
    log "Deploying EKS cluster stack..."
    cdk deploy EksClusterStack --require-approval never
    
    log "Deploying add-ons stack..."
    cdk deploy EksAddonsStack --require-approval never
    
    log "Infrastructure deployment completed!"
}

configure_kubectl() {
    log "Configuring kubectl..."
    
    # Update kubeconfig
    aws eks update-kubeconfig --region $AWS_REGION --name $CLUSTER_NAME
    
    # Test connection
    if kubectl get nodes &> /dev/null; then
        log "kubectl configured successfully!"
        log "Cluster nodes:"
        kubectl get nodes
    else
        error "Failed to configure kubectl. Please check your AWS credentials and region."
    fi
}

verify_deployment() {
    log "Verifying deployment..."
    
    # Check cluster status
    log "Checking cluster status..."
    kubectl get nodes
    
    # Check system pods
    log "Checking system pods..."
    kubectl get pods -n kube-system
    
    # Check add-ons
    log "Checking AWS Load Balancer Controller..."
    kubectl get deployment aws-load-balancer-controller -n kube-system
    
    log "Checking Cluster Autoscaler..."
    kubectl get deployment cluster-autoscaler -n kube-system
    
    log "Checking EBS CSI Driver..."
    kubectl get pods -n kube-system | grep ebs-csi
    
    log "Deployment verification completed!"
}

show_next_steps() {
    log "Deployment completed successfully! 🎉"
    echo ""
    echo "Next steps:"
    echo "1. Deploy your applications using kubectl"
    echo "2. Check the examples/ directory for sample applications"
    echo "3. Monitor your cluster using AWS CloudWatch Container Insights"
    echo "4. Access Kubernetes Dashboard (if needed):"
    echo "   kubectl proxy"
    echo "   http://localhost:8001/api/v1/namespaces/kube-system/services/https:kubernetes-dashboard:/proxy/"
    echo ""
    echo "Useful commands:"
    echo "  kubectl get nodes"
    echo "  kubectl get pods -A"
    echo "  kubectl top nodes"
    echo "  kubectl top pods"
    echo ""
    echo "To clean up resources:"
    echo "  ./scripts/destroy.sh"
}

main() {
    log "Starting EKS cluster deployment..."
    
    check_prerequisites
    install_dependencies
    bootstrap_cdk
    deploy_infrastructure
    configure_kubectl
    verify_deployment
    show_next_steps
    
    log "Deployment script completed successfully!"
}

# Handle script arguments
case "${1:-deploy}" in
    deploy)
        main
        ;;
    prerequisites)
        check_prerequisites
        ;;
    bootstrap)
        bootstrap_cdk
        ;;
    verify)
        verify_deployment
        ;;
    *)
        echo "Usage: $0 {deploy|prerequisites|bootstrap|verify}"
        exit 1
        ;;
esac
