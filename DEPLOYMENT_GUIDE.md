# Complete Deployment Guide

This guide walks you through deploying a production-grade EKS cluster with a sample application demonstrating all the features.

## Prerequisites

- AWS CLI configured with appropriate permissions
- Docker installed (for building images)
- kubectl installed
- AWS CDK CLI installed (`npm install -g aws-cdk`)
- Node.js 18+ and npm
- An AWS account with appropriate IAM permissions

## Step-by-Step Deployment

### 1. Deploy Infrastructure

First, deploy the EKS cluster and all required infrastructure:

```bash
# Install dependencies
npm install

# Deploy the infrastructure
./scripts/deploy.sh
```

This will deploy:
- VPC with public/private subnets across 3 AZs
- EKS cluster with managed node groups
- All required IAM roles and policies
- AWS Load Balancer Controller
- EBS/EFS CSI drivers
- Secrets Manager and SSM Parameter Store integration
- CloudWatch monitoring and logging

### 2. Build and Push Application Images

Build and push the frontend and backend application images to ECR:

```bash
# Create ECR repositories
aws ecr create-repository --repository-name backend-api --region us-east-1
aws ecr create-repository --repository-name frontend-app --region us-east-1

# Get login token for ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 276824024738.dkr.ecr.us-east-1.amazonaws.com



# Build and push backend
cd applications/backend
docker build -t backend-api .
docker tag backend-api:latest 276824024738.dkr.ecr.us-east-1.amazonaws.com/backend-api:latest
docker push 276824024738.dkr.ecr.us-east-1.amazonaws.com/backend-api:latest

# Errors run this command

npm install
npm install --package-lock-only


# Build and push frontend
cd ../frontend
docker build -t frontend-app .
docker tag frontend-app:latest 276824024738.dkr.ecr.us-east-1.amazonaws.com/frontend-app:latest
docker push 276824024738.dkr.ecr.us-east-1.amazonaws.com/frontend-app:latest
```

### 3. Configure Application Deployment

Update the Kubernetes manifests with your specific values:

```bash
# Update ECR image URLs in deployment files
sed -i 's/your-account/276824024738/g' k8s/backend-deployment.yaml
sed -i 's/your-account/276824024738/g' k8s/frontend-deployment.yaml

# Update IAM role ARNs
sed -i 's/ACCOUNT_ID/276824024738/g' k8s/backend-service.yaml
sed -i 's/ACCOUNT_ID/276824024738/g' k8s/frontend-service.yaml

# Update certificate ARN and domain (optional for testing)
sed -i 's/ACCOUNT_ID/276824024738/g' k8s/ingress.yaml
sed -i 's/CERTIFICATE_ID/YOUR_CERTIFICATE_ID/g' k8s/ingress.yaml
sed -i 's/demo-app.example.com/your-domain.com/g' k8s/ingress.yaml
```

### 4. Create Required SSM Parameters

Create the SSM parameters that the application expects:

```bash
# Create feature flags
aws ssm put-parameter --name "/eks/app/feature-flags/new-ui" --value "true" --type "String"
aws ssm put-parameter --name "/eks/app/feature-flags/analytics" --value "false" --type "String"
aws ssm put-parameter --name "/eks/app/config/environment" --value "production" --type "String"

# Create database configuration (update with your actual values)
aws ssm put-parameter --name "/eks/app/config/database-url" --value "postgresql://localhost:5432/mydb" --type "String"
```

### 5. Update Secrets Manager

The CDK already creates a sample secret. You can update it with real values:

```bash
# Update the secret with real database credentials
aws secretsmanager update-secret --secret-id "eks-sample-secret" --secret-string '{
  "username": "your-db-user",
  "password": "your-db-password",
  "db_host": "your-rds-endpoint",
  "db_port": "5432",
  "db_name": "your-database"
}'
```

### 6. Deploy Applications

Deploy the applications to the EKS cluster:

```bash
cd k8s
./deploy.sh
```

This will:
- Create the demo-app namespace
- Deploy backend and frontend applications
- Create services for inter-service communication
- Set up ingress for external access
- Configure horizontal pod autoscaling
- Set up pod disruption budgets
- Apply network policies

### 7. Verify Deployment

Check that everything is running:

```bash
# Check all resources
kubectl get all -n demo-app

# Check ingress
kubectl get ingress -n demo-app

# Check logs
kubectl logs -n demo-app -l app=backend
kubectl logs -n demo-app -l app=frontend

# Check autoscaling
kubectl get hpa -n demo-app
kubectl describe hpa -n demo-app
```

### 8. Access the Application

Get the ALB DNS name and access the application:

```bash
# Get ALB DNS name
kubectl get ingress demo-app-ingress -n demo-app -o jsonpath='{.status.loadBalancer.ingress[0].hostname}'

# Access the application
curl -k https://ALB_DNS_NAME
```

## Architecture Overview

The deployed architecture includes:

### Network Architecture
- **VPC**: Custom VPC with public/private subnets across 3 AZs
- **Private Subnets**: EKS worker nodes deployed in private subnets
- **Public Subnets**: ALB deployed in public subnets
- **NAT Gateways**: One per AZ for high availability
- **VPC Endpoints**: Reduce NAT Gateway costs for AWS services

### Security Architecture
- **IAM Roles**: Separate roles for cluster, nodes, and service accounts
- **IRSA**: IAM Roles for Service Accounts for fine-grained permissions
- **Network Policies**: Restrict pod-to-pod communication
- **Security Groups**: Minimal required ports
- **Secrets Management**: AWS Secrets Manager integration
- **Configuration**: SSM Parameter Store integration

### Application Architecture
- **Frontend**: React application served by Nginx
- **Backend**: Node.js Express API
- **Communication**: Internal service-to-service communication
- **External Access**: ALB for internet-facing traffic
- **Load Balancing**: Application Load Balancer with multiple targets

### Monitoring and Observability
- **CloudWatch Logs**: All application and cluster logs
- **Container Insights**: Cluster and pod metrics
- **Prometheus**: Metrics collection (optional)
- **Grafana**: Visualization (optional)

## Testing the Application

### 1. Access the Frontend

Navigate to the ALB DNS name to access the React frontend application. The frontend provides:

- **API Status**: Shows backend connectivity and health
- **User Management**: Demonstrates CRUD operations
- **Configuration Display**: Shows SSM parameters and feature flags
- **System Metrics**: Real-time backend performance metrics

### 2. Test API Endpoints

Test the backend API directly:

```bash
# Get API status
curl https://ALB_DNS_NAME/api/status

# Get users
curl https://ALB_DNS_NAME/api/users

# Get configuration
curl https://ALB_DNS_NAME/api/config

# Get metrics
curl https://ALB_DNS_NAME/api/metrics

# Create a user
curl -X POST https://ALB_DNS_NAME/api/users \
  -H "Content-Type: application/json" \
  -d '{"name": "Test User", "email": "test@example.com", "role": "user"}'
```

### 3. Test Autoscaling

Generate load to test horizontal pod autoscaling:

```bash
# Install Apache Bench (if not already installed)
sudo apt-get install apache2-utils  # Ubuntu/Debian
# or
brew install apache2-utils  # macOS

# Generate load
ab -n 10000 -c 50 https://ALB_DNS_NAME/api/status
```

Watch the HPA scale up:

```bash
kubectl get hpa -n demo-app -w
```

### 4. Test Secrets and Configuration

Update SSM parameters and secrets to see configuration changes:

```bash
# Update a feature flag
aws ssm put-parameter --name "/eks/app/feature-flags/new-ui" --value "false" --type "String" --overwrite

# The application will pick up the change on the next API call
```

## Production Considerations

### 1. SSL/TLS Configuration
- Upload SSL certificates to ACM
- Update ingress with proper certificate ARN
- Configure proper domain names

### 2. Database Integration
- Deploy RDS PostgreSQL instance
- Update secrets with real database credentials
- Configure backend to use actual database

### 3. Monitoring and Alerting
- Set up CloudWatch alarms
- Configure SNS notifications
- Install Prometheus and Grafana for advanced monitoring

### 4. Backup and Disaster Recovery
- Configure EBS volume snapshots
- Set up cross-region replication
- Test backup and restore procedures

### 5. Security Hardening
- Enable GuardDuty for threat detection
- Configure AWS Config for compliance
- Set up VPC Flow Logs analysis
- Enable CloudTrail for audit logging

### 6. Performance Optimization
- Configure cluster autoscaler properly
- Set up vertical pod autoscaling
- Optimize resource requests and limits
- Use spot instances for cost optimization

## Troubleshooting

### Common Issues

1. **Pods stuck in Pending state**
   ```bash
   kubectl describe pod -n demo-app
   kubectl get events -n demo-app
   ```

2. **ALB not creating**
   ```bash
   kubectl logs -n kube-system deployment/aws-load-balancer-controller
   ```

3. **Secrets not mounting**
   ```bash
   kubectl describe secretproviderclass -n demo-app
   kubectl logs -n kube-system daemonset/secrets-store-csi-driver
   ```

4. **Application not accessible**
   ```bash
   kubectl get ingress -n demo-app
   kubectl describe ingress -n demo-app
   ```

### Useful Commands

```bash
# Check cluster status
kubectl get nodes
kubectl get pods -A

# Check application status
kubectl get all -n demo-app
kubectl top pods -n demo-app

# View logs
kubectl logs -n demo-app -l app=backend -f
kubectl logs -n demo-app -l app=frontend -f

# Check resources
kubectl describe deployment -n demo-app
kubectl describe hpa -n demo-app
kubectl describe pdb -n demo-app
```

## Cleanup

To destroy all resources:

```bash
# Delete applications
kubectl delete namespace demo-app

# Delete infrastructure
./scripts/destroy.sh
```

## Cost Optimization

The deployment includes several cost optimization features:

1. **Spot Instances**: Mixed instance types with spot instances
2. **Cluster Autoscaler**: Automatic scaling based on demand
3. **VPC Endpoints**: Reduce NAT Gateway costs
4. **Resource Limits**: Prevent resource waste
5. **Efficient Load Balancing**: Single ALB for multiple services

## Next Steps

After successful deployment, consider:

1. **CI/CD Integration**: Set up automated deployments
2. **Blue/Green Deployments**: Implement zero-downtime deployments
3. **Service Mesh**: Add Istio or AWS App Mesh
4. **Advanced Monitoring**: Implement distributed tracing
5. **Multi-Environment Setup**: Create dev/staging/prod environments
