#!/bin/bash

set -e

echo "=== Deploying Interview Deck Application using Helm ==="

# Check if kubectl can connect to cluster
echo "Checking cluster connectivity..."
if ! kubectl cluster-info > /dev/null 2>&1; then
    echo "❌ Cannot connect to EKS cluster. Updating kubeconfig..."
    aws eks update-kubeconfig --region us-east-1 --name sats-portals-eks-cluster
fi

# Verify cluster access
echo "Verifying cluster access..."
kubectl get nodes

echo "=== Step 1: Create Namespace ==="
kubectl create namespace interviewdeck --dry-run=client -o yaml | kubectl apply -f -

echo "=== Step 2: Install AWS Load Balancer Controller ==="

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

echo "=== Step 3: Deploy Backend using Helm ==="
helm upgrade --install interviewdeck-backend ./helm-charts/interviewdeck-backend \
  --namespace interviewdeck \
  --create-namespace \
  --wait \
  --timeout=10m

echo "=== Step 4: Deploy Frontend using Helm ==="
helm upgrade --install interviewdeck-frontend ./helm-charts/interviewdeck-frontend \
  --namespace interviewdeck \
  --wait \
  --timeout=10m

echo "=== Step 5: Check SSL Certificate Status ==="
CERT_STATUS=$(aws acm describe-certificate --certificate-arn arn:aws:acm:us-east-1:276824024738:certificate/03d76270-6adb-4647-a2b4-daa0edad3f4a --region us-east-1 --query 'Certificate.Status' --output text)
echo "SSL Certificate Status: $CERT_STATUS"

if [ "$CERT_STATUS" != "ISSUED" ]; then
    echo "⚠️  SSL certificate is not yet validated. Status: $CERT_STATUS"
    echo "You may need to wait for DNS propagation to complete."
fi

echo "=== Step 6: Deploy Ingress using Helm ==="
helm upgrade --install interviewdeck-ingress ./helm-charts/interviewdeck-ingress \
  --namespace interviewdeck \
  --wait \
  --timeout=10m

echo "=== Step 7: Get Load Balancer Information ==="

echo "Waiting for Load Balancer to be provisioned..."
sleep 60

# Get ALB DNS name
ALB_DNS=$(kubectl get ingress interviewdeck-ingress -n interviewdeck -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null || echo "pending")

if [ "$ALB_DNS" = "pending" ] || [ -z "$ALB_DNS" ]; then
    echo "⏳ Load Balancer is still being provisioned. This can take 2-5 minutes."
    echo "Run this command to check status:"
    echo "kubectl get ingress interviewdeck-ingress -n interviewdeck"
else
    echo "✅ Load Balancer DNS: $ALB_DNS"
    
    echo "=== Step 8: Update Route53 DNS Records ==="
    
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
echo "Helm releases:"
helm list -n interviewdeck

echo ""
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
echo "=== Useful Commands ==="
echo "Check status:"
echo "  kubectl get all -n interviewdeck"
echo "  helm list -n interviewdeck"
echo ""
echo "View logs:"
echo "  kubectl logs -l app.kubernetes.io/name=interviewdeck-backend -n interviewdeck"
echo "  kubectl logs -l app.kubernetes.io/name=interviewdeck-frontend -n interviewdeck"
echo ""
echo "Update deployments:"
echo "  helm upgrade interviewdeck-backend ./helm-charts/interviewdeck-backend -n interviewdeck"
echo "  helm upgrade interviewdeck-frontend ./helm-charts/interviewdeck-frontend -n interviewdeck"

echo ""
echo "✅ Deployment completed successfully!"
