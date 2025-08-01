#!/bin/bash

set -e

echo "=== Deploying Interview Deck Application via AWS CLI/CDK ==="

# Create temporary credentials file
TEMP_CREDS=$(aws sts assume-role \
  --role-arn arn:aws:iam::276824024738:role/sats-portals-eks-cluster-admin-role \
  --role-session-name eks-admin-session \
  --output json)

ACCESS_KEY=$(echo $TEMP_CREDS | jq -r '.Credentials.AccessKeyId')
SECRET_KEY=$(echo $TEMP_CREDS | jq -r '.Credentials.SecretAccessKey')
SESSION_TOKEN=$(echo $TEMP_CREDS | jq -r '.Credentials.SessionToken')

echo "Got temporary credentials for admin role"

# Export the credentials
export AWS_ACCESS_KEY_ID=$ACCESS_KEY
export AWS_SECRET_ACCESS_KEY=$SECRET_KEY
export AWS_SESSION_TOKEN=$SESSION_TOKEN

echo "=== Step 1: Update kubeconfig with admin credentials ==="
aws eks update-kubeconfig --region us-east-1 --name sats-portals-eks-cluster

echo "=== Step 2: Test cluster access ==="
kubectl get nodes

echo "=== Step 3: Run Helm deployment ==="
./deploy-with-helm.sh

echo "✅ Deployment completed with admin credentials!"
