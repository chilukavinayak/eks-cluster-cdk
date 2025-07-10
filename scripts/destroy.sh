#!/bin/bash

# Unified destruction script for EKS cluster
# Usage: ./scripts/destroy.sh <environment> [destroy-type]
# 
# Examples:
#   ./scripts/destroy.sh dev addons        # Destroy only addons (keep core)
#   ./scripts/destroy.sh dev core          # Destroy only core infrastructure
#   ./scripts/destroy.sh dev full          # Destroy everything (addons + core)
#   ./scripts/destroy.sh prod full         # Destroy production environment

set -e

# Default values
ENVIRONMENT=${1:-dev}
DESTROY_TYPE=${2:-full}

VALID_ENVIRONMENTS=("dev" "staging" "prod")
VALID_DESTROY_TYPES=("addons" "core" "full")

# Function to display usage
show_usage() {
    echo "Usage: $0 <environment> [destroy-type]"
    echo ""
    echo "Environment (required): ${VALID_ENVIRONMENTS[*]}"
    echo "Destroy types: ${VALID_DESTROY_TYPES[*]}"
    echo ""
    echo "Examples:"
    echo "  $0 dev addons      # Destroy only addons (keep core infrastructure)"
    echo "  $0 dev core        # Destroy only core infrastructure"
    echo "  $0 dev full        # Destroy everything (default)"
    echo "  $0 prod full       # Destroy production environment"
    echo ""
    echo "Destroy Types:"
    echo "  addons - Remove only Kubernetes addons (keep core infrastructure)"
    echo "  core   - Remove only core infrastructure (VPC, IAM, EKS, NodeGroups)"
    echo "  full   - Remove everything (addons + core infrastructure)"
    echo ""
    echo "⚠️  WARNING: Destruction is irreversible!"
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

# Validate destroy type
if [[ ! " ${VALID_DESTROY_TYPES[@]} " =~ " ${DESTROY_TYPE} " ]]; then
    echo "❌ Error: Invalid destroy type '${DESTROY_TYPE}'"
    echo "Valid destroy types: ${VALID_DESTROY_TYPES[*]}"
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
    
    if ! command -v aws >/dev/null 2>&1; then
        missing_commands+=("aws")
    fi
    
    if ! command -v npm >/dev/null 2>&1; then
        missing_commands+=("npm")
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
    
    echo "✅ Prerequisites check passed"
}

echo "🚨 WARNING: This will destroy resources in the ${ENVIRONMENT} environment!"
echo "📋 Destroy type: ${DESTROY_TYPE}"

# Check prerequisites before proceeding
check_prerequisites

# Enhanced warning for production
if [[ "${ENVIRONMENT}" == "prod" ]]; then
    echo "⚠️  🔥 PRODUCTION ENVIRONMENT DETECTED! 🔥"
    echo "This will destroy production resources that may be serving live traffic!"
    echo "Please type 'DESTROY-PRODUCTION' to confirm:"
    read -r confirmation
    if [[ "$confirmation" != "DESTROY-PRODUCTION" ]]; then
        echo "❌ Production destruction cancelled."
        exit 1
    fi
else
    read -p "Are you sure you want to continue? (yes/no): " -r
    if [[ ! $REPLY =~ ^[Yy]es$ ]]; then
        echo "❌ Destruction cancelled."
        exit 1
    fi
fi

echo "🗑️  Destroying ${ENVIRONMENT} environment (${DESTROY_TYPE})..."

# Build the project
echo "📦 Building TypeScript..."
if ! npm run build; then
    echo "❌ Error: TypeScript build failed"
    exit 1
fi

# Function to destroy addons
destroy_addons() {
    echo "🔧 Destroying addons..."
    
    echo "🔒 Destroying security addons..."
    npx cdk destroy platform-eks-cluster-${ENVIRONMENT}-addons-security-stack --context environment=${ENVIRONMENT} --force || true
    
    echo "📊 Destroying monitoring addons..."
    npx cdk destroy platform-eks-cluster-${ENVIRONMENT}-addons-monitoring-stack --context environment=${ENVIRONMENT} --force || true
    
    echo "🌐 Destroying networking addons..."
    npx cdk destroy platform-eks-cluster-${ENVIRONMENT}-addons-networking-stack --context environment=${ENVIRONMENT} --force || true
    
    echo "💾 Destroying storage addons..."
    npx cdk destroy platform-eks-cluster-${ENVIRONMENT}-addons-storage-stack --context environment=${ENVIRONMENT} --force || true
    
    echo "🔧 Destroying core addons..."
    npx cdk destroy platform-eks-cluster-${ENVIRONMENT}-addons-core-stack --context environment=${ENVIRONMENT} --force || true
    
    echo "✅ Addons destroyed!"
}

# Function to destroy core infrastructure
destroy_core() {
    echo "🔧 Destroying core infrastructure..."
    
    echo "🔑 Destroying OIDC trust..."
    npx cdk destroy platform-eks-cluster-${ENVIRONMENT}-oidc-trust-stack --context environment=${ENVIRONMENT} --force || true
    
    echo "🖥️ Destroying node groups..."
    npx cdk destroy platform-eks-cluster-${ENVIRONMENT}-node-groups-stack --context environment=${ENVIRONMENT} --force || true
    
    echo "☸️ Destroying EKS cluster..."
    npx cdk destroy platform-eks-cluster-${ENVIRONMENT}-eks-stack --context environment=${ENVIRONMENT} --force || true
    
    echo "🔐 Destroying IAM stack..."
    npx cdk destroy platform-eks-cluster-${ENVIRONMENT}-iam-stack --context environment=${ENVIRONMENT} --force || true
    
    echo "🌐 Destroying VPC stack..."
    npx cdk destroy platform-eks-cluster-${ENVIRONMENT}-vpc-stack --context environment=${ENVIRONMENT} --force || true
    
    echo "✅ Core infrastructure destroyed!"
}

# Main destruction logic
case ${DESTROY_TYPE} in
    "addons")
        destroy_addons
        echo ""
        echo "🎯 Addons destroyed. Core infrastructure remains."
        echo "   - To destroy core: ./scripts/destroy.sh ${ENVIRONMENT} core"
        echo "   - To redeploy addons: ./scripts/deploy.sh ${ENVIRONMENT} addons all"
        ;;
    "core")
        destroy_core
        echo ""
        echo "🎯 Core infrastructure destroyed."
        echo "   - To redeploy: ./scripts/deploy.sh ${ENVIRONMENT} core"
        ;;
    "full")
        destroy_addons
        echo ""
        echo "🔄 Proceeding with core infrastructure destruction..."
        destroy_core
        echo ""
        echo "🎯 Complete environment destroyed!"
        echo "   - To redeploy: ./scripts/deploy.sh ${ENVIRONMENT} full"
        ;;
esac

echo ""
echo "✅ Environment ${ENVIRONMENT} destruction completed!"
echo "📋 Destroyed: ${DESTROY_TYPE}"

# Show final status
echo ""
echo "🔍 Final AWS CloudFormation stacks status:"
region=$(aws configure get region 2>/dev/null || echo "us-east-1")
aws cloudformation describe-stacks --region ${region} --query "Stacks[?contains(StackName, 'platform-eks-cluster-${ENVIRONMENT}')].{Name:StackName,Status:StackStatus}" --output table 2>/dev/null || echo "No remaining stacks found."
