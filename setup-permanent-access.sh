#!/bin/bash

echo "=== Setting up Permanent EKS Access ==="

# Create AWS config for role assumption
mkdir -p ~/.aws

# Add EKS admin role to AWS config
cat >> ~/.aws/config << 'EOF'

[profile eks-admin]
role_arn = arn:aws:iam::276824024738:role/sats-portals-eks-cluster-admin-role
source_profile = default
region = us-east-1
EOF

echo "✅ AWS config updated with eks-admin profile"

# Update kubeconfig with the admin profile
AWS_PROFILE=eks-admin aws eks update-kubeconfig --region us-east-1 --name sats-portals-eks-cluster --alias sats-portals-admin

echo "✅ Kubeconfig updated with permanent access"

# Test access
echo "Testing cluster access..."
AWS_PROFILE=eks-admin kubectl get nodes

echo ""
echo "✅ Permanent access configured!"
echo ""
echo "📋 Usage Instructions:"
echo ""
echo "1. Always use the eks-admin profile for cluster access:"
echo "   export AWS_PROFILE=eks-admin"
echo ""
echo "2. Or prefix commands with the profile:"
echo "   AWS_PROFILE=eks-admin kubectl get pods -n interviewdeck"
echo ""
echo "3. To make it default, add to your shell profile:"
echo "   echo 'export AWS_PROFILE=eks-admin' >> ~/.zshrc"
echo ""
echo "4. Check your application status:"
echo "   kubectl get all -n interviewdeck"
echo ""
echo "5. Get load balancer URL:"
echo "   kubectl get svc interviewdeck-frontend-lb -n interviewdeck"
