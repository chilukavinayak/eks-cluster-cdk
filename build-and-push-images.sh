#!/bin/bash

# Build and push Docker images for InterviewDeck
set -e

# Configuration
AWS_REGION=${AWS_REGION:-"us-east-1"}
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_REGISTRY="$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"
IMAGE_TAG=${IMAGE_TAG:-"latest"}

# ECR repository names
FRONTEND_REPO="interviewdeck-frontend"
BACKEND_REPO="interviewdeck-backend"

echo "Building and pushing InterviewDeck images to ECR..."
echo "Registry: $ECR_REGISTRY"
echo "Tag: $IMAGE_TAG"

# Login to ECR
echo "Logging in to ECR..."
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ECR_REGISTRY

# Create ECR repositories if they don't exist
echo "Creating ECR repositories..."
aws ecr create-repository --repository-name $FRONTEND_REPO --region $AWS_REGION 2>/dev/null || echo "Frontend repository already exists"
aws ecr create-repository --repository-name $BACKEND_REPO --region $AWS_REGION 2>/dev/null || echo "Backend repository already exists"

# Build and push frontend image
echo "Building frontend image..."
cd /Users/vinayak.chiluka/workspace/repo/interview-deck-io/interviewdeck-io-frontend
docker build -t $FRONTEND_REPO:$IMAGE_TAG .
docker tag $FRONTEND_REPO:$IMAGE_TAG $ECR_REGISTRY/$FRONTEND_REPO:$IMAGE_TAG

echo "Pushing frontend image..."
docker push $ECR_REGISTRY/$FRONTEND_REPO:$IMAGE_TAG

# Build and push backend image
echo "Building backend image..."
cd /Users/vinayak.chiluka/workspace/repo/interview-deck-io/interviewdeck-io-backend
docker build -t $BACKEND_REPO:$IMAGE_TAG .
docker tag $BACKEND_REPO:$IMAGE_TAG $ECR_REGISTRY/$BACKEND_REPO:$IMAGE_TAG

echo "Pushing backend image..."
docker push $ECR_REGISTRY/$BACKEND_REPO:$IMAGE_TAG

echo "Images built and pushed successfully!"
echo "Frontend: $ECR_REGISTRY/$FRONTEND_REPO:$IMAGE_TAG"
echo "Backend: $ECR_REGISTRY/$BACKEND_REPO:$IMAGE_TAG"

# Update Helm values with ECR image URLs
echo "Updating Helm values files with ECR image URLs..."
cd /Users/vinayak.chiluka/workspace/repo/eks-cluster-cdk

# Update frontend values
sed -i.bak "s|repository: your-registry/interviewdeck-frontend|repository: $ECR_REGISTRY/$FRONTEND_REPO|g" helm-charts/interviewdeck-frontend/values.yaml

# Update backend values
sed -i.bak "s|repository: your-registry/interviewdeck-backend|repository: $ECR_REGISTRY/$BACKEND_REPO|g" helm-charts/interviewdeck-backend/values.yaml

echo "Helm values updated with ECR image URLs"
