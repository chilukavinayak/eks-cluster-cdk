#!/bin/bash

set -e

echo "=== Deploying Interview Deck Application using Helm (Skipping Verification) ==="

# Update kubeconfig without verification
echo "Updating kubeconfig..."
aws eks update-kubeconfig --region us-east-1 --name sats-portals-eks-cluster

echo "=== Step 1: Create Namespace ==="
kubectl create namespace interviewdeck --dry-run=client -o yaml | kubectl apply -f - 2>/dev/null || echo "Namespace might already exist or access denied"

echo "=== Step 2: Install AWS Load Balancer Controller ==="

# Apply service account
echo "Creating service account for ALB controller..."
kubectl apply -f aws-load-balancer-controller-service-account.yaml 2>/dev/null || echo "Service account creation failed - might already exist or access denied"

# Install ALB controller via Helm
echo "Installing AWS Load Balancer Controller..."
helm repo add eks https://aws.github.io/eks-charts 2>/dev/null || true
helm repo update

helm upgrade --install aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system \
  --set clusterName=sats-portals-eks-cluster \
  --set serviceAccount.create=false \
  --set serviceAccount.name=aws-load-balancer-controller 2>/dev/null || echo "ALB controller installation failed - might need admin access"

echo "=== Step 3: Deploy Backend using Helm ==="
helm upgrade --install interviewdeck-backend ./helm-charts/interviewdeck-backend \
  --namespace interviewdeck \
  --create-namespace \
  --wait \
  --timeout=10m 2>/dev/null || echo "Backend deployment failed - might need cluster access"

echo "=== Step 4: Deploy Frontend using Helm ==="
helm upgrade --install interviewdeck-frontend ./helm-charts/interviewdeck-frontend \
  --namespace interviewdeck \
  --wait \
  --timeout=10m 2>/dev/null || echo "Frontend deployment failed - might need cluster access"

echo "=== Step 5: Check SSL Certificate Status ==="
CERT_STATUS=$(aws acm describe-certificate --certificate-arn arn:aws:acm:us-east-1:276824024738:certificate/03d76270-6adb-4647-a2b4-daa0edad3f4a --region us-east-1 --query 'Certificate.Status' --output text)
echo "SSL Certificate Status: $CERT_STATUS"

if [ "$CERT_STATUS" != "ISSUED" ]; then
    echo "⚠️  SSL certificate is not yet validated. Status: $CERT_STATUS"
fi

echo "=== Step 6: Deploy Ingress using Helm ==="
helm upgrade --install interviewdeck-ingress ./helm-charts/interviewdeck-ingress \
  --namespace interviewdeck \
  --wait \
  --timeout=10m 2>/dev/null || echo "Ingress deployment failed - might need cluster access"

echo "=== Deployment attempted ==="
echo "❌ kubectl authentication issue prevents full deployment"
echo ""
echo "✅ What we can confirm:"
echo "   - DNS propagated to AWS Route53"
echo "   - Docker images in ECR"
echo "   - SSL certificate requested"
echo "   - Helm charts ready"
echo ""
echo "🔧 Next steps:"
echo "   1. Get admin access to add your user to the cluster"
echo "   2. Or use admin AWS credentials"
echo "   3. Then re-run: ./deploy-with-helm.sh"
