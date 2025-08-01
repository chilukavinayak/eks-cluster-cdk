#!/bin/bash

set -e

echo "=== Deploying Interview Deck Application to EKS ==="

# Check if kubectl can connect to cluster
echo "Checking cluster connectivity..."
if ! kubectl cluster-info > /dev/null 2>&1; then
    echo "❌ Cannot connect to EKS cluster. Updating kubeconfig..."
    aws eks update-kubeconfig --region us-east-1 --name sats-portals-eks-cluster
fi

# Verify cluster access
echo "Verifying cluster access..."
kubectl get nodes

echo "=== Step 1: Install AWS Load Balancer Controller ==="

# Apply service account
echo "Creating service account for ALB controller..."
kubectl apply -f aws-load-balancer-controller-service-account.yaml

# Install ALB controller via Helm
echo "Installing AWS Load Balancer Controller..."
helm repo add eks https://aws.github.io/eks-charts 2>/dev/null || true
helm repo update

helm upgrade --install aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system \
  --set clusterName=sats-portals-eks-cluster \
  --set serviceAccount.create=false \
  --set serviceAccount.name=aws-load-balancer-controller

echo "Waiting for ALB controller to be ready..."
kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=aws-load-balancer-controller -n kube-system --timeout=300s

echo "=== Step 2: Deploy Application ==="

# Create namespace
echo "Creating namespace..."
kubectl apply -f manifests/namespace.yaml

# Deploy backend
echo "Deploying backend..."
kubectl apply -f manifests/backend-deployment.yaml

# Deploy frontend  
echo "Deploying frontend..."
kubectl apply -f manifests/frontend-deployment.yaml

# Wait for deployments
echo "Waiting for deployments to be ready..."
kubectl wait --for=condition=available deployment/interviewdeck-backend -n interviewdeck --timeout=300s
kubectl wait --for=condition=available deployment/interviewdeck-frontend -n interviewdeck --timeout=300s

echo "=== Step 3: Create Ingress ==="

# Check SSL certificate status
echo "Checking SSL certificate status..."
CERT_STATUS=$(aws acm describe-certificate --certificate-arn arn:aws:acm:us-east-1:276824024738:certificate/03d76270-6adb-4647-a2b4-daa0edad3f4a --region us-east-1 --query 'Certificate.Status' --output text)
echo "SSL Certificate Status: $CERT_STATUS"

if [ "$CERT_STATUS" != "ISSUED" ]; then
    echo "⚠️  SSL certificate is not yet validated. Status: $CERT_STATUS"
    echo "You may need to wait for DNS propagation to complete."
fi

# Deploy ingress
echo "Creating ingress..."
kubectl apply -f manifests/ingress.yaml

echo "=== Step 4: Get Load Balancer Information ==="

echo "Waiting for Load Balancer to be provisioned..."
sleep 30

# Get ALB DNS name
ALB_DNS=$(kubectl get ingress interviewdeck-ingress -n interviewdeck -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null || echo "pending")

if [ "$ALB_DNS" = "pending" ] || [ -z "$ALB_DNS" ]; then
    echo "⏳ Load Balancer is still being provisioned. This can take 2-5 minutes."
    echo "Run this command to check status:"
    echo "kubectl get ingress interviewdeck-ingress -n interviewdeck"
else
    echo "✅ Load Balancer DNS: $ALB_DNS"
    
    echo "=== Step 5: Update Route53 DNS Records ==="
    
    # Create A record for root domain
    echo "Creating A record for interviewdeck.io..."
    aws route53 change-resource-record-sets --hosted-zone-id Z0230466UX8KG6M1GBCM --change-batch '{
      "Changes": [
        {
          "Action": "UPSERT",
          "ResourceRecordSet": {
            "Name": "interviewdeck.io",
            "Type": "A",
            "AliasTarget": {
              "DNSName": "'$ALB_DNS'",
              "EvaluateTargetHealth": true,
              "HostedZoneId": "Z35SXDOTRQ7X7K"
            }
          }
        }
      ]
    }'
    
    # Create CNAME for www
    echo "Creating CNAME record for www.interviewdeck.io..."
    aws route53 change-resource-record-sets --hosted-zone-id Z0230466UX8KG6M1GBCM --change-batch '{
      "Changes": [
        {
          "Action": "UPSERT",
          "ResourceRecordSet": {
            "Name": "www.interviewdeck.io",
            "Type": "CNAME",
            "TTL": 300,
            "ResourceRecords": [
              {
                "Value": "interviewdeck.io"
              }
            ]
          }
        }
      ]
    }'
    
    echo "✅ DNS records created!"
fi

echo "=== Deployment Status ==="
echo "Pods:"
kubectl get pods -n interviewdeck

echo ""
echo "Services:"
kubectl get services -n interviewdeck

echo ""
echo "Ingress:"
kubectl get ingress -n interviewdeck

echo ""
echo "=== Next Steps ==="
echo "1. Wait for DNS propagation (can take 5-60 minutes)"
echo "2. Test your application:"
echo "   - http://$ALB_DNS (direct ALB access)"
echo "   - https://interviewdeck.io (once DNS propagates)"
echo "   - https://www.interviewdeck.io (once DNS propagates)"

echo ""
echo "✅ Deployment completed successfully!"
