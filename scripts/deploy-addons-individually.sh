#!/bin/bash

# Deploy EKS Add-ons One by One
# Use this script if you're getting rate limiting errors with add-ons

set -e

echo "🔧 Deploying EKS Add-ons one by one to avoid rate limiting"
echo

# List of add-ons to deploy individually
addons=(
    "AWS Load Balancer Controller"
    "EBS CSI Driver" 
    "Cluster Autoscaler"
    "Metrics Server"
)

# Function to wait for user confirmation
wait_for_confirmation() {
    local addon_name=$1
    echo "Ready to deploy: $addon_name"
    echo "Press Enter to continue, or Ctrl+C to stop..."
    read
}

# Function to check pods are running
check_addon_pods() {
    local addon_name=$1
    echo "Checking $addon_name pods..."
    kubectl get pods -n kube-system | grep -E "(load-balancer|ebs|cluster-autoscaler|metrics-server)" || echo "Pods may still be starting..."
}

echo "📋 Instructions for manual deployment:"
echo "1. Edit src/stacks/addons-stack.ts"
echo "2. Comment out all add-ons except the current one"
echo "3. Run: npx cdk deploy EksAddonsStack"
echo "4. Wait for deployment to complete"
echo "5. Verify pods are running"
echo "6. Uncomment the next add-on and repeat"
echo

echo "Here's the order to deploy add-ons:"
echo

for i in "${!addons[@]}"; do
    addon="${addons[$i]}"
    num=$((i + 1))
    
    echo "📦 Step $num: $addon"
    
    case $addon in
        "AWS Load Balancer Controller")
            echo "   Keep only: this.installAWSLoadBalancerController(cluster);"
            echo "   Comment: // this.installEBSCSIDriver(cluster);"
            echo "   Comment: // this.installClusterAutoscaler(cluster);"
            echo "   Comment: // this.installMetricsServer(cluster);"
            ;;
        "EBS CSI Driver")
            echo "   Keep: this.installAWSLoadBalancerController(cluster);"
            echo "   Keep: this.installEBSCSIDriver(cluster);"
            echo "   Comment: // this.installClusterAutoscaler(cluster);"
            echo "   Comment: // this.installMetricsServer(cluster);"
            ;;
        "Cluster Autoscaler")
            echo "   Keep: this.installAWSLoadBalancerController(cluster);"
            echo "   Keep: this.installEBSCSIDriver(cluster);"
            echo "   Keep: this.installClusterAutoscaler(cluster);"
            echo "   Comment: // this.installMetricsServer(cluster);"
            ;;
        "Metrics Server")
            echo "   Keep: this.installAWSLoadBalancerController(cluster);"
            echo "   Keep: this.installEBSCSIDriver(cluster);"
            echo "   Keep: this.installClusterAutoscaler(cluster);"
            echo "   Keep: this.installMetricsServer(cluster);"
            ;;
    esac
    
    wait_for_confirmation "$addon"
    
    echo "🚀 Deploy with: npx cdk deploy EksAddonsStack"
    echo "⏳ Wait for deployment to complete..."
    echo
    
    # Option to automatically deploy if user wants
    read -p "Do you want me to deploy this automatically? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "🚀 Deploying $addon..."
        npx cdk deploy EksAddonsStack --require-approval never
        
        echo "⏳ Waiting 30 seconds for pods to start..."
        sleep 30
        
        check_addon_pods "$addon"
        
        echo "✅ $addon deployment attempt completed"
        echo "⏳ Waiting 60 seconds before next add-on..."
        sleep 60
    else
        echo "⏭️  Skipping automatic deployment. Deploy manually then continue."
    fi
    
    echo "----------------------------------------"
done

echo "🎉 All add-ons deployment instructions completed!"
echo
echo "Final verification:"
echo "kubectl get pods -n kube-system"
echo "kubectl get ingressclass"
echo "kubectl top nodes"
