#!/bin/bash

set -e

echo "=== Secure Deployment Script ==="

# Function to refresh credentials
refresh_creds() {
    echo "Refreshing admin credentials..."
    TEMP_CREDS=$(aws sts assume-role \
      --role-arn arn:aws:iam::276824024738:role/sats-portals-eks-cluster-admin-role \
      --role-session-name eks-admin-session \
      --output json)
    
    export AWS_ACCESS_KEY_ID=$(echo $TEMP_CREDS | jq -r '.Credentials.AccessKeyId')
    export AWS_SECRET_ACCESS_KEY=$(echo $TEMP_CREDS | jq -r '.Credentials.SecretAccessKey')
    export AWS_SESSION_TOKEN=$(echo $TEMP_CREDS | jq -r '.Credentials.SessionToken')
    
    aws eks update-kubeconfig --region us-east-1 --name sats-portals-eks-cluster
}

# Refresh credentials
refresh_creds

echo "=== Step 1: Create Namespace ==="
kubectl create namespace interviewdeck || echo "Namespace exists"

echo "=== Step 2: Deploy Backend ==="
helm upgrade --install interviewdeck-backend ./helm-charts/interviewdeck-backend \
  --namespace interviewdeck \
  --create-namespace \
  --wait \
  --timeout=10m

# Refresh credentials before next step
refresh_creds

echo "=== Step 3: Deploy Frontend ==="
helm upgrade --install interviewdeck-frontend ./helm-charts/interviewdeck-frontend \
  --namespace interviewdeck \
  --wait \
  --timeout=10m

# Refresh credentials before next step
refresh_creds

echo "=== Step 4: Deploy Ingress ==="
helm upgrade --install interviewdeck-ingress ./helm-charts/interviewdeck-ingress \
  --namespace interviewdeck \
  --wait \
  --timeout=10m

echo "=== Step 5: Check Status ==="
kubectl get all -n interviewdeck

echo "=== Step 6: Get Load Balancer DNS ==="
sleep 30
ALB_DNS=$(kubectl get ingress interviewdeck-ingress -n interviewdeck -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null || echo "pending")

if [ "$ALB_DNS" != "pending" ] && [ -n "$ALB_DNS" ]; then
    echo "✅ Load Balancer DNS: $ALB_DNS"
    
    echo "=== Step 7: Update Route53 DNS Records ==="
    
    # Reset to original credentials for Route53 operations
    unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
    
    # Create A record for root domain
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
    echo ""
    echo "🌐 Your application will be available at:"
    echo "   - http://$ALB_DNS (direct access)"
    echo "   - https://interviewdeck.io (after DNS propagation)"
    echo "   - https://www.interviewdeck.io (after DNS propagation)"
else
    echo "⏳ Load Balancer still provisioning. Check status with:"
    echo "kubectl get ingress interviewdeck-ingress -n interviewdeck"
fi

echo ""
echo "✅ Deployment completed successfully!"
