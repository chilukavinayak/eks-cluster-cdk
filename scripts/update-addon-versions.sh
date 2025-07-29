#!/bin/bash

# Automatic EKS Add-on Version Updater
# This script automatically updates EKS add-ons to the latest compatible versions

set -e

CLUSTER_NAME="sats-portals-eks-cluster"
REGION="us-east-1"

echo "🔄 Checking and updating EKS add-on versions for cluster: $CLUSTER_NAME"

# Get current Kubernetes version
K8S_VERSION=$(aws eks describe-cluster --name $CLUSTER_NAME --region $REGION --query 'cluster.version' --output text)
echo "📋 Current Kubernetes version: $K8S_VERSION"

# Function to get latest compatible version for an add-on
get_latest_addon_version() {
    local addon_name=$1
    aws eks describe-addon-versions \
        --kubernetes-version $K8S_VERSION \
        --addon-name $addon_name \
        --region $REGION \
        --query 'addons[0].addonVersions[0].addonVersion' \
        --output text
}

# Function to update add-on if needed
update_addon_if_needed() {
    local addon_name=$1
    local latest_version=$2
    
    # Get current version
    local current_version=$(aws eks describe-addon \
        --cluster-name $CLUSTER_NAME \
        --addon-name $addon_name \
        --region $REGION \
        --query 'addon.addonVersion' \
        --output text 2>/dev/null || echo "NOT_INSTALLED")
    
    if [ "$current_version" = "NOT_INSTALLED" ]; then
        echo "❌ $addon_name is not installed"
        return
    fi
    
    if [ "$current_version" != "$latest_version" ]; then
        echo "🔄 Updating $addon_name: $current_version → $latest_version"
        aws eks update-addon \
            --cluster-name $CLUSTER_NAME \
            --addon-name $addon_name \
            --addon-version $latest_version \
            --resolve-conflicts OVERWRITE \
            --region $REGION
        echo "✅ $addon_name updated successfully"
    else
        echo "✅ $addon_name is already up to date ($current_version)"
    fi
}

# Update all add-ons
echo ""
echo "🔍 Checking add-on versions..."

# VPC CNI
latest_vpc_cni=$(get_latest_addon_version "vpc-cni")
update_addon_if_needed "vpc-cni" "$latest_vpc_cni"

# CoreDNS  
latest_coredns=$(get_latest_addon_version "coredns")
update_addon_if_needed "coredns" "$latest_coredns"

# Kube Proxy
latest_kube_proxy=$(get_latest_addon_version "kube-proxy")
update_addon_if_needed "kube-proxy" "$latest_kube_proxy"

# EBS CSI Driver
latest_ebs_csi=$(get_latest_addon_version "aws-ebs-csi-driver")
update_addon_if_needed "aws-ebs-csi-driver" "$latest_ebs_csi"

echo ""
echo "🎉 Add-on version check complete!"

# Show final status
echo ""
echo "📊 Final add-on status:"
for addon in vpc-cni coredns kube-proxy aws-ebs-csi-driver; do
    version=$(aws eks describe-addon \
        --cluster-name $CLUSTER_NAME \
        --addon-name $addon \
        --region $REGION \
        --query 'addon.addonVersion' \
        --output text 2>/dev/null || echo "NOT_INSTALLED")
    echo "  • $addon: $version"
done

echo ""
echo "✨ All add-ons are now running the latest compatible versions!"
