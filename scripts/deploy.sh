#!/bin/bash

# Unified deployment script for EKS cluster
# Usage: ./scripts/deploy.sh <environment> [deployment-type] [addon-type]
# 
# Examples:
#   ./scripts/deploy.sh dev core           # Deploy only core infrastructure
#   ./scripts/deploy.sh dev addons all     # Deploy all addons (requires core)
#   ./scripts/deploy.sh dev full           # Deploy everything (core + all addons)
#   ./scripts/deploy.sh prod core          # Deploy production core
#   ./scripts/deploy.sh staging full       # Deploy full staging environment

set -e

# Default values
ENVIRONMENT=${1:-dev}
DEPLOYMENT_TYPE=${2:-core}
ADDON_TYPE=${3:-essential}

VALID_ENVIRONMENTS=("dev" "staging" "prod")
VALID_DEPLOYMENT_TYPES=("core" "addons" "full")
VALID_ADDON_TYPES=("essential" "core" "storage" "networking" "monitoring" "security" "all")

# Function to display usage
show_usage() {
    echo "Usage: $0 <environment> [deployment-type] [addon-type]"
    echo ""
    echo "Environment (required): ${VALID_ENVIRONMENTS[*]}"
    echo "Deployment types: ${VALID_DEPLOYMENT_TYPES[*]}"
    echo "Addon types: ${VALID_ADDON_TYPES[*]}"
    echo ""
    echo "Examples:"
    echo "  $0 dev core                    # Deploy core infrastructure only"
    echo "  $0 dev addons all              # Deploy all addons (requires core)"
    echo "  $0 dev full                    # Deploy everything (core + all addons)"
    echo "  $0 prod core                   # Deploy production core"
    echo "  $0 staging addons essential    # Deploy essential addons to staging"
    echo ""
    echo "Deployment Types:"
    echo "  core   - VPC, IAM, EKS cluster, node groups, OIDC trust"
    echo "  addons - Kubernetes addons (requires core infrastructure)"
    echo "  full   - Complete deployment (core + all addons)"
    echo ""
    echo "Addon Types:"
    echo "  essential   - Core + Storage addons"
    echo "  core        - ALB Controller, Cluster Autoscaler, Metrics Server"
    echo "  storage     - EBS CSI, EFS CSI drivers"
    echo "  networking  - VPC CNI, CoreDNS enhancements"
    echo "  monitoring  - Prometheus, Grafana, CloudWatch"
    echo "  security    - Falco, OPA Gatekeeper, Pod Security"
    echo "  all         - All available addons"
}

# Check for help flag
if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
    show_usage
    exit 0
fi

# Validate environment
if [[ ! " ${VALID_ENVIRONMENTS[@]} " =~ " ${ENVIRONMENT} " ]]; then
    echo "❌ Error: Invalid environment '${ENVIRONMENT}'"
    echo "Valid environments: ${VALID_ENVIRONMENTS[*]}"
    show_usage
    exit 1
fi

# Validate deployment type
if [[ ! " ${VALID_DEPLOYMENT_TYPES[@]} " =~ " ${DEPLOYMENT_TYPE} " ]]; then
    echo "❌ Error: Invalid deployment type '${DEPLOYMENT_TYPE}'"
    echo "Valid deployment types: ${VALID_DEPLOYMENT_TYPES[*]}"
    show_usage
    exit 1
fi

# Validate addon type
if [[ ! " ${VALID_ADDON_TYPES[@]} " =~ " ${ADDON_TYPE} " ]]; then
    echo "❌ Error: Invalid addon type '${ADDON_TYPE}'"
    echo "Valid addon types: ${VALID_ADDON_TYPES[*]}"
    show_usage
    exit 1
fi

# Set environment variables based on the environment
case ${ENVIRONMENT} in
    dev)
        export DEV_AWS_ACCOUNT_ID=${DEV_AWS_ACCOUNT_ID:-"276824024738"}
        export DEV_AWS_REGION=${DEV_AWS_REGION:-"us-east-1"}
        ;;
    staging)
        export STAGING_AWS_ACCOUNT_ID=${STAGING_AWS_ACCOUNT_ID:-"123456789013"}
        export STAGING_AWS_REGION=${STAGING_AWS_REGION:-"us-east-1"}
        ;;
    prod)
        export PROD_AWS_ACCOUNT_ID=${PROD_AWS_ACCOUNT_ID:-"123456789014"}
        export PROD_AWS_REGION=${PROD_AWS_REGION:-"us-east-1"}
        ;;
esac

export ENVIRONMENT=${ENVIRONMENT}

# Function to check prerequisites
check_prerequisites() {
    echo "🔍 Checking prerequisites..."
    
    # Check if required commands are available
    local missing_commands=()
    
    if ! command -v node >/dev/null 2>&1; then
        missing_commands+=("node")
    fi
    
    if ! command -v npm >/dev/null 2>&1; then
        missing_commands+=("npm")
    fi
    
    if ! command -v aws >/dev/null 2>&1; then
        missing_commands+=("aws")
    fi
    
    if ! command -v kubectl >/dev/null 2>&1; then
        missing_commands+=("kubectl")
    fi
    
    if [ ${#missing_commands[@]} -ne 0 ]; then
        echo "❌ Error: Missing required commands: ${missing_commands[*]}"
        echo "Please install the missing commands and try again."
        exit 1
    fi
    
    # Check AWS CLI configuration
    if ! aws sts get-caller-identity >/dev/null 2>&1; then
        echo "❌ Error: AWS CLI not configured or credentials invalid"
        echo "Please run 'aws configure' or set AWS credentials"
        exit 1
    fi
    
    # Check if package.json exists
    if [[ ! -f "package.json" ]]; then
        echo "❌ Error: package.json not found"
        echo "Please run this script from the project root directory"
        exit 1
    fi
    
    # Check if CDK app exists
    if [[ ! -f "src/app.ts" ]]; then
        echo "❌ Error: src/app.ts not found"
        echo "Please run this script from the project root directory"
        exit 1
    fi
    
    echo "✅ Prerequisites check passed"
}

echo "🚀 Deploying to ${ENVIRONMENT} environment"
echo "📋 Deployment type: ${DEPLOYMENT_TYPE}"
if [[ "${DEPLOYMENT_TYPE}" == "addons" || "${DEPLOYMENT_TYPE}" == "full" ]]; then
    echo "🔧 Addon type: ${ADDON_TYPE}"
fi

# Check prerequisites before proceeding
check_prerequisites

# Clean up old CDK output and ensure fresh synthesis
echo "🧹 Cleaning up old CDK output..."
if [[ -d "cdk.out" ]]; then
    rm -rf cdk.out
    echo "✅ Removed old cdk.out directory"
fi

# Clean up any cached node_modules TypeScript build files
echo "🧹 Cleaning TypeScript build cache..."
if [[ -d "lib" ]]; then
    rm -rf lib
    echo "✅ Removed old lib directory"
fi

# Build the project
echo "📦 Building TypeScript..."
if ! npm run build; then
    echo "❌ Error: TypeScript build failed"
    exit 1
fi

# Synthesize CDK templates to ensure they're fresh
echo "🔄 Synthesizing CDK templates..."
if ! npx cdk synth --context environment=${ENVIRONMENT} >/dev/null; then
    echo "❌ Error: CDK synthesis failed"
    exit 1
fi
echo "✅ Fresh CDK templates synthesized"

# Bootstrap CDK if needed
echo "🔧 Bootstrapping CDK..."
if ! npx cdk bootstrap --context environment=${ENVIRONMENT}; then
    echo "❌ Error: CDK bootstrap failed"
    exit 1
fi

# Function to deploy core infrastructure
deploy_core() {
    echo "🌐 Deploying VPC stack..."
    npx cdk deploy platform-eks-cluster-${ENVIRONMENT}-vpc-stack --context environment=${ENVIRONMENT} --require-approval never
    
    echo "🔐 Deploying IAM stack..."
    npx cdk deploy platform-eks-cluster-${ENVIRONMENT}-iam-stack --context environment=${ENVIRONMENT} --require-approval never
    
    echo "☸️ Deploying EKS cluster..."
    npx cdk deploy platform-eks-cluster-${ENVIRONMENT}-eks-stack --context environment=${ENVIRONMENT} --require-approval never
    
    echo "🖥️ Deploying node groups..."
    npx cdk deploy platform-eks-cluster-${ENVIRONMENT}-node-groups-stack --context environment=${ENVIRONMENT} --require-approval never
    
    # Deploy OIDC trust stack only if enabled
    if [[ "${ENVIRONMENT}" == "prod" ]]; then
        echo "🔐 Deploying OIDC trust stack..."
        npx cdk deploy platform-eks-cluster-${ENVIRONMENT}-oidc-trust-stack --context environment=${ENVIRONMENT} --require-approval never
    else
        echo "⏭️  Skipping OIDC trust stack (using inline roles for ${ENVIRONMENT} environment)"
    fi
    
    echo "✅ Core infrastructure deployment completed!"
    
    # Update kubeconfig
    echo "🔧 Updating kubeconfig..."
    local region=$(aws configure get region || echo "us-east-1")
    if ! aws eks update-kubeconfig --name "eks-cluster-${ENVIRONMENT}-cluster" --region ${region}; then
        echo "❌ Error: Failed to update kubeconfig"
        exit 1
    fi
    
    # Show cluster info
    echo "📊 Cluster information:"
    if ! kubectl cluster-info; then
        echo "⚠️  Warning: Could not get cluster info"
    fi
    
    if ! kubectl get nodes; then
        echo "⚠️  Warning: Could not get nodes"
    fi
}

# Function to deploy addons
deploy_addons() {
    # Check if core infrastructure exists
    local region=$(aws configure get region || echo "us-east-1")
    if ! aws eks describe-cluster --name "eks-cluster-${ENVIRONMENT}-cluster" --region ${region} >/dev/null 2>&1; then
        echo "❌ EKS cluster not found. Deploy core infrastructure first:"
        echo "   ./scripts/deploy.sh ${ENVIRONMENT} core"
        exit 1
    fi
    
    echo "✅ Core infrastructure found. Proceeding with addon deployment..."
    
    # Deploy addons based on type
    case ${ADDON_TYPE} in
        "essential")
            echo "🔧 Deploying essential addons only..."
            npx cdk deploy platform-eks-cluster-${ENVIRONMENT}-addons-core-stack --context environment=${ENVIRONMENT} --context enableAddons=true --require-approval never
            npx cdk deploy platform-eks-cluster-${ENVIRONMENT}-addons-storage-stack --context environment=${ENVIRONMENT} --context enableAddons=true --require-approval never
            ;;
        "core")
            echo "🔧 Deploying core addons..."
            npx cdk deploy platform-eks-cluster-${ENVIRONMENT}-addons-core-stack --context environment=${ENVIRONMENT} --context enableAddons=true --require-approval never
            ;;
        "storage")
            echo "💾 Deploying storage addons..."
            npx cdk deploy platform-eks-cluster-${ENVIRONMENT}-addons-storage-stack --context environment=${ENVIRONMENT} --context enableAddons=true --require-approval never
            ;;
        "networking")
            echo "🌐 Deploying networking addons..."
            npx cdk deploy platform-eks-cluster-${ENVIRONMENT}-addons-networking-stack --context environment=${ENVIRONMENT} --context enableAddons=true --require-approval never
            ;;
        "monitoring")
            echo "📊 Deploying monitoring addons..."
            npx cdk deploy platform-eks-cluster-${ENVIRONMENT}-addons-monitoring-stack --context environment=${ENVIRONMENT} --context enableAddons=true --require-approval never
            ;;
        "security")
            echo "🔒 Deploying security addons..."
            npx cdk deploy platform-eks-cluster-${ENVIRONMENT}-addons-security-stack --context environment=${ENVIRONMENT} --context enableAddons=true --require-approval never
            ;;
        "all")
            echo "🚀 Deploying all addons..."
            npx cdk deploy platform-eks-cluster-${ENVIRONMENT}-addons-core-stack --context environment=${ENVIRONMENT} --context enableAddons=true --require-approval never
            npx cdk deploy platform-eks-cluster-${ENVIRONMENT}-addons-storage-stack --context environment=${ENVIRONMENT} --context enableAddons=true --require-approval never
            npx cdk deploy platform-eks-cluster-${ENVIRONMENT}-addons-networking-stack --context environment=${ENVIRONMENT} --context enableAddons=true --require-approval never
            npx cdk deploy platform-eks-cluster-${ENVIRONMENT}-addons-monitoring-stack --context environment=${ENVIRONMENT} --context enableAddons=true --require-approval never
            npx cdk deploy platform-eks-cluster-${ENVIRONMENT}-addons-security-stack --context environment=${ENVIRONMENT} --context enableAddons=true --require-approval never
            ;;
    esac
    
    echo "✅ Addon deployment completed!"
}

# Main deployment logic
case ${DEPLOYMENT_TYPE} in
    "core")
        deploy_core
        echo ""
        echo "🎯 Next steps:"
        echo "   - Deploy addons: ./scripts/deploy.sh ${ENVIRONMENT} addons all"
        echo "   - Deploy demo app: kubectl apply -f k8s/"
        ;;
    "addons")
        deploy_addons
        echo ""
        echo "🎯 Next steps:"
        echo "   - Check addon status: kubectl get all -n kube-system"
        echo "   - Deploy demo app: kubectl apply -f k8s/"
        ;;
    "full")
        deploy_core
        echo ""
        echo "🔄 Proceeding with addon deployment..."
        deploy_addons
        echo ""
        echo "🎯 Full deployment completed!"
        echo "   - Check cluster status: kubectl get all -n kube-system"
        echo "   - Deploy demo app: kubectl apply -f k8s/"
        ;;
esac

echo ""
echo "🔍 Checking final cluster status:"
if ! kubectl get nodes; then
    echo "⚠️  Warning: Could not get cluster nodes"
fi

if ! kubectl get pods -A --field-selector=status.phase=Running | head -10; then
    echo "⚠️  Warning: Could not get running pods"
fi

echo ""
echo "📋 Environment Information:"
echo "Environment: ${ENVIRONMENT}"
echo "Account: $(aws sts get-caller-identity --query Account --output text 2>/dev/null || echo 'Unknown')"
echo "Region: $(aws configure get region 2>/dev/null || echo 'Unknown')"
echo ""
echo "🗑️  To destroy this environment:"
echo "./scripts/destroy.sh ${ENVIRONMENT}"
