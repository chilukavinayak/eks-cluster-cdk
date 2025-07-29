#!/bin/bash

# EKS Role Assumption Helper Script
# Helps users assume different EKS roles for secure cluster access

set -e

CLUSTER_NAME="sats-portals-eks-cluster"
REGION="us-east-1"
PROFILE_DIR="$HOME/.aws/eks-profiles"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Create profile directory if it doesn't exist
mkdir -p "$PROFILE_DIR"

show_help() {
    echo "🔐 EKS Role Assumption Helper"
    echo ""
    echo "Usage: $0 [ROLE] [OPTIONS]"
    echo ""
    echo "Roles:"
    echo "  admin       - Full cluster administrative access"
    echo "  dev         - Developer access to development namespaces"
    echo "  readonly    - Read-only access to cluster resources"
    echo "  cicd        - CI/CD pipeline access"
    echo ""
    echo "Options:"
    echo "  -h, --help  - Show this help message"
    echo "  -l, --list  - List current AWS identity"
    echo "  -c, --clean - Clean up temporary credentials"
    echo ""
    echo "Examples:"
    echo "  $0 admin                    # Assume admin role"
    echo "  $0 dev                      # Assume developer role"
    echo "  $0 readonly                 # Assume read-only role"
    echo "  $0 -c                       # Clean up credentials"
}

get_role_arn() {
    local role_type=$1
    case $role_type in
        "admin")
            echo "arn:aws:iam::$(aws sts get-caller-identity --query Account --output text):role/${CLUSTER_NAME}-admin-role"
            ;;
        "dev")
            echo "arn:aws:iam::$(aws sts get-caller-identity --query Account --output text):role/${CLUSTER_NAME}-dev-role"
            ;;
        "readonly")
            echo "arn:aws:iam::$(aws sts get-caller-identity --query Account --output text):role/${CLUSTER_NAME}-readonly-role"
            ;;
        "cicd")
            echo "arn:aws:iam::$(aws sts get-caller-identity --query Account --output text):role/${CLUSTER_NAME}-cicd-role"
            ;;
        *)
            echo ""
            ;;
    esac
}

assume_role() {
    local role_type=$1
    local role_arn=$(get_role_arn $role_type)
    
    if [ -z "$role_arn" ]; then
        echo -e "${RED}❌ Invalid role type: $role_type${NC}"
        show_help
        exit 1
    fi
    
    echo -e "${BLUE}🔄 Assuming $role_type role...${NC}"
    echo "Role ARN: $role_arn"
    
    # Assume the role
    local session_name="eks-$role_type-$(date +%s)"
    local assume_output=$(aws sts assume-role \
        --role-arn "$role_arn" \
        --role-session-name "$session_name" \
        --output json)
    
    if [ $? -ne 0 ]; then
        echo -e "${RED}❌ Failed to assume role. Check your permissions.${NC}"
        exit 1
    fi
    
    # Extract credentials
    local access_key=$(echo "$assume_output" | jq -r '.Credentials.AccessKeyId')
    local secret_key=$(echo "$assume_output" | jq -r '.Credentials.SecretAccessKey')
    local session_token=$(echo "$assume_output" | jq -r '.Credentials.SessionToken')
    local expiration=$(echo "$assume_output" | jq -r '.Credentials.Expiration')
    
    # Create profile file
    local profile_file="$PROFILE_DIR/eks-$role_type-credentials"
    cat > "$profile_file" << EOF
export AWS_ACCESS_KEY_ID="$access_key"
export AWS_SECRET_ACCESS_KEY="$secret_key"
export AWS_SESSION_TOKEN="$session_token"
export EKS_ROLE="$role_type"
export EKS_ROLE_EXPIRATION="$expiration"
EOF
    
    echo -e "${GREEN}✅ Successfully assumed $role_type role${NC}"
    echo -e "${YELLOW}📝 Credentials expire at: $expiration${NC}"
    echo ""
    echo "To use these credentials, run:"
    echo -e "${BLUE}source $profile_file${NC}"
    echo ""
    echo "Then update kubeconfig:"
    echo -e "${BLUE}aws eks update-kubeconfig --region $REGION --name $CLUSTER_NAME${NC}"
    echo ""
    echo "Test access:"
    echo -e "${BLUE}kubectl auth whoami${NC}"
}

list_identity() {
    echo -e "${BLUE}🔍 Current AWS Identity:${NC}"
    aws sts get-caller-identity --output table
    
    if [ -n "$EKS_ROLE" ]; then
        echo ""
        echo -e "${GREEN}📋 Active EKS Role: $EKS_ROLE${NC}"
        if [ -n "$EKS_ROLE_EXPIRATION" ]; then
            echo -e "${YELLOW}⏰ Expires: $EKS_ROLE_EXPIRATION${NC}"
        fi
    fi
}

clean_credentials() {
    echo -e "${BLUE}🧹 Cleaning up temporary credentials...${NC}"
    
    # Remove profile files
    rm -f "$PROFILE_DIR"/eks-*-credentials
    
    # Unset environment variables
    unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
    unset EKS_ROLE EKS_ROLE_EXPIRATION
    
    echo -e "${GREEN}✅ Credentials cleaned up${NC}"
    echo ""
    echo "You may want to update kubeconfig with your default credentials:"
    echo -e "${BLUE}aws eks update-kubeconfig --region $REGION --name $CLUSTER_NAME${NC}"
}

# Main logic
case "${1:-}" in
    admin|dev|readonly|cicd)
        assume_role "$1"
        ;;
    -l|--list)
        list_identity
        ;;
    -c|--clean)
        clean_credentials
        ;;
    -h|--help|"")
        show_help
        ;;
    *)
        echo -e "${RED}❌ Unknown option: $1${NC}"
        show_help
        exit 1
        ;;
esac
