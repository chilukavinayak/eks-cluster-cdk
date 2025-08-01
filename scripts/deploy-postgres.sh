#!/bin/bash

# Deploy PostgreSQL to EKS cluster
echo "Deploying PostgreSQL to EKS cluster..."

# Apply PostgreSQL deployment
kubectl apply -f manifests/postgres-deployment.yaml

echo "Waiting for PostgreSQL to be ready..."
kubectl wait --for=condition=ready pod -l app=postgres --timeout=300s

echo "PostgreSQL deployment completed!"
echo "Service available at: postgres-service:5432"
echo "Database: interviewdeck"
echo "Username: interviewdeck_user"
echo "Password: Use the secret 'postgres-secret'"

# Verify deployment
echo -e "\nVerifying deployment..."
kubectl get pods -l app=postgres
kubectl get svc postgres-service
kubectl get pvc postgres-pvc
