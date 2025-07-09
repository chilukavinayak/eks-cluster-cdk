#!/bin/bash

# Complete build and deployment script for EKS cluster and applications

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
AWS_REGION=${AWS_REGION:-us-east-1}
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
CLUSTER_NAME="production-eks-cluster"
ECR_BACKEND_REPO="backend-api"
ECR_FRONTEND_REPO="frontend-app"

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

step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

check_prerequisites() {
    log "Checking prerequisites..."
    
    # Check required tools
    local missing_tools=()
    
    for tool in aws cdk kubectl docker node npm; do
        if ! command -v $tool &> /dev/null; then
            missing_tools+=($tool)
        fi
    done
    
    if [ ${#missing_tools[@]} -ne 0 ]; then
        error "Missing required tools: ${missing_tools[*]}"
    fi
    
    # Check AWS credentials
    if ! aws sts get-caller-identity &> /dev/null; then
        error "AWS credentials not configured"
    fi
    
    # Check Node.js version
    local node_version=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [ $node_version -lt 18 ]; then
        error "Node.js version 18 or higher required"
    fi
    
    log "Prerequisites check passed!"
}

setup_ecr_repositories() {
    step "Setting up ECR repositories..."
    
    # Create ECR repositories if they don't exist
    for repo in $ECR_BACKEND_REPO $ECR_FRONTEND_REPO; do
        if ! aws ecr describe-repositories --repository-names $repo --region $AWS_REGION &> /dev/null; then
            log "Creating ECR repository: $repo"
            aws ecr create-repository --repository-name $repo --region $AWS_REGION
        else
            log "ECR repository $repo already exists"
        fi
    done
    
    # Get ECR login
    log "Logging into ECR..."
    aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com
    
    log "ECR repositories setup completed!"
}

build_and_push_backend() {
    step "Building and pushing backend application..."
    
    cd applications/backend
    
    # Build Docker image
    log "Building backend Docker image..."
    docker build -t $ECR_BACKEND_REPO .
    
    # Tag and push to ECR
    docker tag $ECR_BACKEND_REPO:latest $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_BACKEND_REPO:latest
    docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_BACKEND_REPO:latest
    
    cd ../..
    log "Backend application built and pushed!"
}

build_and_push_frontend() {
    step "Building and pushing frontend application..."
    
    cd applications/frontend
    
    # Build Docker image
    log "Building frontend Docker image..."
    docker build -t $ECR_FRONTEND_REPO .
    
    # Tag and push to ECR
    docker tag $ECR_FRONTEND_REPO:latest $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_FRONTEND_REPO:latest
    docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_FRONTEND_REPO:latest
    
    cd ../..
    log "Frontend application built and pushed!"
}

deploy_infrastructure() {
    step "Deploying infrastructure..."
    
    # Install dependencies
    log "Installing dependencies..."
    npm install
    
    # Build TypeScript
    log "Building TypeScript..."
    npm run build
    
    # Bootstrap CDK if needed
    if ! aws cloudformation describe-stacks --stack-name CDKToolkit --region $AWS_REGION &> /dev/null; then
        log "Bootstrapping CDK..."
        cdk bootstrap --region $AWS_REGION
    fi
    
    # Deploy infrastructure stacks
    log "Deploying VPC stack..."
    cdk deploy EksVpcStack --require-approval never
    
    log "Deploying IAM stack..."
    cdk deploy EksIamStack --require-approval never
    
    log "Deploying EKS cluster stack..."
    cdk deploy EksClusterStack --require-approval never
    
    log "Deploying OIDC trust stack..."
    cdk deploy EksOidcTrustStack --require-approval never
    
    log "Deploying add-ons stack..."
    cdk deploy EksAddonsStack --require-approval never
    
    log "Infrastructure deployment completed!"
}

configure_kubectl() {
    step "Configuring kubectl..."
    
    # Update kubeconfig
    aws eks update-kubeconfig --region $AWS_REGION --name $CLUSTER_NAME
    
    # Test connection
    kubectl get nodes
    
    log "kubectl configured successfully!"
}

create_ssm_parameters() {
    step "Creating SSM parameters..."
    
    # Create feature flags
    aws ssm put-parameter --name "/eks/app/feature-flags/new-ui" --value "true" --type "String" --overwrite || true
    aws ssm put-parameter --name "/eks/app/feature-flags/analytics" --value "false" --type "String" --overwrite || true
    aws ssm put-parameter --name "/eks/app/config/environment" --value "production" --type "String" --overwrite || true
    aws ssm put-parameter --name "/eks/app/config/database-url" --value "postgresql://localhost:5432/mydb" --type "String" --overwrite || true
    
    log "SSM parameters created!"
}

update_k8s_manifests() {
    step "Updating Kubernetes manifests..."
    
    # Update image references
    sed -i.bak "s|276824024738|$AWS_ACCOUNT_ID|g" k8s/backend-deployment.yaml
    sed -i.bak "s|276824024738|$AWS_ACCOUNT_ID|g" k8s/frontend-deployment.yaml
    
    # Update IAM role ARNs
    sed -i.bak "s|ACCOUNT_ID|$AWS_ACCOUNT_ID|g" k8s/backend-service.yaml
    sed -i.bak "s|ACCOUNT_ID|$AWS_ACCOUNT_ID|g" k8s/frontend-service.yaml
    sed -i.bak "s|ACCOUNT_ID|$AWS_ACCOUNT_ID|g" k8s/ingress.yaml
    
    # Update region
    sed -i.bak "s|us-east-1|$AWS_REGION|g" k8s/backend-deployment.yaml
    sed -i.bak "s|us-east-1|$AWS_REGION|g" k8s/frontend-deployment.yaml
    sed -i.bak "s|us-east-1|$AWS_REGION|g" k8s/ingress.yaml
    
    # Clean up backup files
    rm -f k8s/*.bak
    
    log "Kubernetes manifests updated!"
}

deploy_applications() {
    step "Deploying applications..."
    
    # Deploy applications
    cd k8s
    ./deploy.sh
    cd ..
    
    log "Applications deployed!"
}

wait_for_alb() {
    step "Waiting for ALB to be ready..."
    
    local retries=0
    local max_retries=30
    
    while [ $retries -lt $max_retries ]; do
        local alb_dns=$(kubectl get ingress demo-app-ingress -n demo-app -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null || echo "")
        
        if [[ -n "$alb_dns" ]]; then
            log "ALB DNS: $alb_dns"
            
            # Test if ALB is responding
            if curl -s -o /dev/null -w "%{http_code}" "http://$alb_dns" | grep -q "200\|404"; then
                log "ALB is ready!"
                echo ""
                echo "🎉 Deployment completed successfully!"
                echo ""
                echo "Application URLs:"
                echo "  Frontend: http://$alb_dns"
                echo "  Backend API: http://$alb_dns/api"
                echo ""
                return 0
            fi
        fi
        
        log "Waiting for ALB to be ready... (attempt $((retries + 1))/$max_retries)"
        sleep 30
        retries=$((retries + 1))
    done
    
    warn "ALB not ready after $max_retries attempts. Please check manually."
}

verify_deployment() {
    step "Verifying deployment..."
    
    # Check cluster
    kubectl get nodes
    
    # Check applications
    kubectl get all -n demo-app
    
    # Check ingress
    kubectl get ingress -n demo-app
    
    log "Deployment verification completed!"
}

show_useful_commands() {
    echo ""
    echo "Useful commands:"
    echo "  kubectl get all -n demo-app"
    echo "  kubectl logs -n demo-app -l app=backend -f"
    echo "  kubectl logs -n demo-app -l app=frontend -f"
    echo "  kubectl get hpa -n demo-app"
    echo "  kubectl top pods -n demo-app"
    echo ""
    echo "To clean up:"
    echo "  kubectl delete namespace demo-app"
    echo "  ./scripts/destroy.sh"
}

main() {
    log "Starting complete EKS deployment..."
    
    check_prerequisites
    setup_ecr_repositories
    build_and_push_backend
    build_and_push_frontend
    deploy_infrastructure
    configure_kubectl
    create_ssm_parameters
    update_k8s_manifests
    deploy_applications
    verify_deployment
    wait_for_alb
    show_useful_commands
    
    log "Complete deployment finished!"
}

# Handle script arguments
case "${1:-deploy}" in
    deploy)
        main
        ;;
    infrastructure)
        check_prerequisites
        deploy_infrastructure
        configure_kubectl
        ;;
    applications)
        check_prerequisites
        setup_ecr_repositories
        build_and_push_backend
        build_and_push_frontend
        update_k8s_manifests
        deploy_applications
        ;;
    images)
        check_prerequisites
        setup_ecr_repositories
        build_and_push_backend
        build_and_push_frontend
        ;;
    verify)
        verify_deployment
        ;;
    *)
        echo "Usage: $0 {deploy|infrastructure|applications|images|verify}"
        exit 1
        ;;
esac
