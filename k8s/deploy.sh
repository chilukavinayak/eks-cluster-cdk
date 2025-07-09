#!/bin/bash

# Kubernetes deployment script for demo application

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
NAMESPACE="demo-app"
BACKEND_IMAGE="276824024738.dkr.ecr.us-east-1.amazonaws.com/backend-api:latest"
FRONTEND_IMAGE="276824024738.dkr.ecr.us-east-1.amazonaws.com/frontend-app:latest"

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
    
    # Check if kubectl is available
    if ! command -v kubectl &> /dev/null; then
        error "kubectl is not installed. Please install it first."
    fi
    
    # Check if we can connect to the cluster
    if ! kubectl cluster-info &> /dev/null; then
        error "Cannot connect to Kubernetes cluster. Please check your kubeconfig."
    fi
    
    # Check if cluster has required add-ons
    if ! kubectl get deployment aws-load-balancer-controller -n kube-system &> /dev/null; then
        warn "AWS Load Balancer Controller not found. Make sure it's installed."
    fi
    
    if ! kubectl get csidriver secrets-store.csi.k8s.io &> /dev/null; then
        warn "Secrets Store CSI Driver not found. Make sure it's installed."
    fi
    
    log "Prerequisites check completed!"
}

create_namespace() {
    log "Creating namespace..."
    kubectl apply -f namespace.yaml
    log "Namespace created/updated!"
}

update_image_references() {
    log "Updating image references..."
    
    # Update backend deployment
    sed -i.bak "s|276824024738.dkr.ecr.us-east-1.amazonaws.com/backend-api:latest|${BACKEND_IMAGE}|g" backend-deployment.yaml
    
    # Update frontend deployment
    sed -i.bak "s|276824024738.dkr.ecr.us-east-1.amazonaws.com/frontend-app:latest|${FRONTEND_IMAGE}|g" frontend-deployment.yaml
    
    log "Image references updated!"
}

deploy_backend() {
    log "Deploying backend application..."
    
    # Deploy backend service account and secret providers
    kubectl apply -f backend-service.yaml
    
    # Wait for secret providers to be ready
    sleep 5
    
    # Deploy backend deployment
    kubectl apply -f backend-deployment.yaml
    
    # Wait for deployment to be ready
    kubectl rollout status deployment/backend-deployment -n $NAMESPACE --timeout=300s
    
    log "Backend deployment completed!"
}

deploy_frontend() {
    log "Deploying frontend application..."
    
    # Deploy frontend service account
    kubectl apply -f frontend-service.yaml
    
    # Deploy frontend deployment
    kubectl apply -f frontend-deployment.yaml
    
    # Wait for deployment to be ready
    kubectl rollout status deployment/frontend-deployment -n $NAMESPACE --timeout=300s
    
    log "Frontend deployment completed!"
}

deploy_ingress() {
    log "Deploying ingress..."
    
    # Note: You'll need to update the certificate ARN and domain in ingress.yaml
    warn "Please update the certificate ARN and domain in ingress.yaml before deploying to production"
    
    kubectl apply -f ingress.yaml
    
    log "Ingress deployed!"
}

deploy_autoscaling() {
    log "Deploying autoscaling configuration..."
    
    # Deploy HPA
    kubectl apply -f hpa.yaml
    
    # Deploy PDB
    kubectl apply -f pdb.yaml
    
    log "Autoscaling configuration deployed!"
}

deploy_network_policies() {
    log "Deploying network policies..."
    
    kubectl apply -f network-policy.yaml
    
    log "Network policies deployed!"
}

verify_deployment() {
    log "Verifying deployment..."
    
    # Check namespace
    kubectl get namespace $NAMESPACE
    
    # Check deployments
    kubectl get deployments -n $NAMESPACE
    
    # Check services
    kubectl get services -n $NAMESPACE
    
    # Check pods
    kubectl get pods -n $NAMESPACE
    
    # Check ingress
    kubectl get ingress -n $NAMESPACE
    
    # Check HPA
    kubectl get hpa -n $NAMESPACE
    
    # Check PDB
    kubectl get pdb -n $NAMESPACE
    
    log "Deployment verification completed!"
}

get_ingress_url() {
    log "Getting ingress URL..."
    
    # Get ALB DNS name
    local alb_dns=$(kubectl get ingress demo-app-ingress -n $NAMESPACE -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
    
    if [[ -n "$alb_dns" ]]; then
        log "Application is available at: https://$alb_dns"
        log "API is available at: https://$alb_dns/api"
    else
        warn "ALB DNS name not yet available. Please check again in a few minutes."
    fi
}

show_logs() {
    log "Showing recent logs..."
    
    echo "Backend logs:"
    kubectl logs -n $NAMESPACE -l app=backend --tail=20
    
    echo "Frontend logs:"
    kubectl logs -n $NAMESPACE -l app=frontend --tail=20
}

cleanup() {
    log "Cleaning up backup files..."
    rm -f *.bak
}

main() {
    log "Starting Kubernetes deployment..."
    
    check_prerequisites
    create_namespace
    update_image_references
    deploy_backend
    deploy_frontend
    deploy_ingress
    deploy_autoscaling
    deploy_network_policies
    verify_deployment
    get_ingress_url
    cleanup
    
    log "Deployment completed successfully!"
    log "Use 'kubectl get all -n $NAMESPACE' to check the status"
}

# Handle script arguments
case "${1:-deploy}" in
    deploy)
        main
        ;;
    verify)
        verify_deployment
        ;;
    logs)
        show_logs
        ;;
    url)
        get_ingress_url
        ;;
    clean)
        cleanup
        ;;
    *)
        echo "Usage: $0 {deploy|verify|logs|url|clean}"
        exit 1
        ;;
esac
