#!/bin/bash

# Application Deployment Script for EKS
# Usage: ./scripts/deploy-application.sh [app-name] [environment]

set -e

# Default values
APP_NAME=${1:-"example-app"}
ENVIRONMENT=${2:-"production"}
NAMESPACE="${APP_NAME}"
CLUSTER_NAME="sats-portals-eks-cluster"
REGION="us-east-1"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check if kubectl is installed
    if ! command -v kubectl &> /dev/null; then
        log_error "kubectl is not installed or not in PATH"
        exit 1
    fi
    
    # Check if AWS CLI is installed
    if ! command -v aws &> /dev/null; then
        log_error "AWS CLI is not installed or not in PATH"
        exit 1
    fi
    
    # Check if cluster access is configured
    if ! kubectl cluster-info &> /dev/null; then
        log_warning "No cluster access configured. Attempting to configure..."
        aws eks update-kubeconfig --region $REGION --name $CLUSTER_NAME
    fi
    
    log_success "Prerequisites check completed"
}

# Create namespace if it doesn't exist
create_namespace() {
    log_info "Creating namespace: $NAMESPACE"
    
    if kubectl get namespace $NAMESPACE &> /dev/null; then
        log_warning "Namespace $NAMESPACE already exists"
    else
        # Check if namespace manifest exists
        if [ -f "manifests/$APP_NAME/namespace.yaml" ]; then
            kubectl apply -f "manifests/$APP_NAME/namespace.yaml"
        else
            # Create basic namespace
            kubectl create namespace $NAMESPACE
            kubectl label namespace $NAMESPACE \
                environment=$ENVIRONMENT \
                app=$APP_NAME \
                managed-by=eks-cluster-cdk
        fi
        log_success "Namespace $NAMESPACE created"
    fi
}

# Apply RBAC configurations
apply_rbac() {
    log_info "Applying RBAC configurations..."
    
    if [ -f "manifests/$APP_NAME/rbac.yaml" ]; then
        kubectl apply -f "manifests/$APP_NAME/rbac.yaml"
        log_success "RBAC configurations applied"
    else
        log_warning "No RBAC configuration found for $APP_NAME"
    fi
}

# Apply resource quotas and limits
apply_resource_quotas() {
    log_info "Applying resource quotas and limits..."
    
    if [ -f "manifests/$APP_NAME/resource-quota.yaml" ]; then
        kubectl apply -f "manifests/$APP_NAME/resource-quota.yaml"
        log_success "Resource quotas applied"
    else
        log_warning "No resource quota configuration found for $APP_NAME"
    fi
}

# Apply network policies
apply_network_policies() {
    log_info "Applying network policies..."
    
    if [ -f "manifests/$APP_NAME/network-policy.yaml" ]; then
        kubectl apply -f "manifests/$APP_NAME/network-policy.yaml"
        log_success "Network policies applied"
    else
        log_warning "No network policy configuration found for $APP_NAME"
    fi
}

# Apply ConfigMaps
apply_configmaps() {
    log_info "Applying ConfigMaps..."
    
    if [ -f "manifests/$APP_NAME/configmap.yaml" ]; then
        kubectl apply -f "manifests/$APP_NAME/configmap.yaml"
        log_success "ConfigMaps applied"
    else
        log_warning "No ConfigMap configuration found for $APP_NAME"
    fi
}

# Apply Secrets (prompt for creation if not exists)
apply_secrets() {
    log_info "Checking for secrets..."
    
    if [ -f "manifests/$APP_NAME/secrets.yaml" ]; then
        kubectl apply -f "manifests/$APP_NAME/secrets.yaml"
        log_success "Secrets applied"
    else
        log_warning "No secrets configuration found for $APP_NAME"
        log_info "You may need to create secrets manually:"
        echo "kubectl create secret generic ${APP_NAME}-secrets \\"
        echo "  --from-literal=database-url='...' \\"
        echo "  --from-literal=api-key='...' \\"
        echo "  --namespace=$NAMESPACE"
    fi
}

# Deploy application
deploy_application() {
    log_info "Deploying application: $APP_NAME"
    
    if [ -f "manifests/$APP_NAME/deployment.yaml" ]; then
        kubectl apply -f "manifests/$APP_NAME/deployment.yaml"
        log_success "Application deployment applied"
    else
        log_error "No deployment configuration found for $APP_NAME"
        exit 1
    fi
}

# Deploy services
deploy_services() {
    log_info "Deploying services..."
    
    if [ -f "manifests/$APP_NAME/service.yaml" ]; then
        kubectl apply -f "manifests/$APP_NAME/service.yaml"
        log_success "Services deployed"
    else
        log_warning "No service configuration found for $APP_NAME"
    fi
}

# Deploy ingress
deploy_ingress() {
    log_info "Checking for ingress configuration..."
    
    if [ -f "manifests/$APP_NAME/ingress.yaml" ]; then
        kubectl apply -f "manifests/$APP_NAME/ingress.yaml"
        log_success "Ingress deployed"
    else
        log_info "No ingress configuration found for $APP_NAME"
    fi
}

# Apply HPA
apply_hpa() {
    log_info "Applying Horizontal Pod Autoscaler..."
    
    if [ -f "manifests/$APP_NAME/hpa.yaml" ]; then
        kubectl apply -f "manifests/$APP_NAME/hpa.yaml"
        log_success "HPA applied"
    else
        log_warning "No HPA configuration found for $APP_NAME"
    fi
}

# Wait for deployment to be ready
wait_for_deployment() {
    log_info "Waiting for deployment to be ready..."
    
    kubectl rollout status deployment/$APP_NAME -n $NAMESPACE --timeout=300s
    
    if [ $? -eq 0 ]; then
        log_success "Deployment is ready"
    else
        log_error "Deployment failed to become ready within timeout"
        exit 1
    fi
}

# Verify deployment
verify_deployment() {
    log_info "Verifying deployment..."
    
    # Check pods
    echo ""
    log_info "Pod status:"
    kubectl get pods -n $NAMESPACE -l app=$APP_NAME
    
    # Check services
    echo ""
    log_info "Service status:"
    kubectl get services -n $NAMESPACE
    
    # Check ingress
    echo ""
    log_info "Ingress status:"
    kubectl get ingress -n $NAMESPACE 2>/dev/null || log_info "No ingress resources found"
    
    # Check HPA
    echo ""
    log_info "HPA status:"
    kubectl get hpa -n $NAMESPACE 2>/dev/null || log_info "No HPA resources found"
    
    # Health check
    echo ""
    log_info "Running health check..."
    kubectl run --rm -i --tty health-check-$RANDOM \
        --image=curlimages/curl \
        --restart=Never \
        --namespace=$NAMESPACE \
        -- curl -f http://${APP_NAME}-service/health 2>/dev/null || log_warning "Health check failed or endpoint not available"
}

# Main deployment function
main() {
    echo "=========================================="
    echo "  EKS Application Deployment Script"
    echo "=========================================="
    echo "App Name: $APP_NAME"
    echo "Environment: $ENVIRONMENT"
    echo "Namespace: $NAMESPACE"
    echo "Cluster: $CLUSTER_NAME"
    echo "Region: $REGION"
    echo "=========================================="
    
    check_prerequisites
    create_namespace
    apply_rbac
    apply_resource_quotas
    apply_network_policies
    apply_configmaps
    apply_secrets
    deploy_application
    deploy_services
    deploy_ingress
    apply_hpa
    wait_for_deployment
    verify_deployment
    
    echo ""
    log_success "Application $APP_NAME deployed successfully!"
    echo ""
    log_info "Next steps:"
    echo "1. Test your application endpoints"
    echo "2. Configure monitoring and alerting"
    echo "3. Set up backup procedures"
    echo "4. Review security configurations"
    echo ""
    log_info "Useful commands:"
    echo "kubectl get all -n $NAMESPACE"
    echo "kubectl logs -f deployment/$APP_NAME -n $NAMESPACE"
    echo "kubectl describe deployment/$APP_NAME -n $NAMESPACE"
}

# Run main function
main "$@"
