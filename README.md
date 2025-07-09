# Production-Grade AWS EKS Cluster with CDK

This repository contains AWS CDK TypeScript code to deploy a production-grade EKS cluster with all required services including SSM Parameter Store, AWS Secrets Manager, Application Load Balancer, and comprehensive monitoring.

## Architecture Overview

The infrastructure is organized into multiple stacks:

- **VpcStack**: Creates a VPC with public/private subnets across 3 AZs
- **IamStack**: Configures IAM roles and policies for EKS components
- **EksClusterStack**: Deploys the EKS cluster with managed node groups
- **AddonsStack**: Installs essential add-ons and controllers

## Features

### Infrastructure
- ✅ Multi-AZ VPC with public/private subnets
- ✅ NAT Gateways for high availability
- ✅ VPC Endpoints to reduce NAT Gateway costs
- ✅ VPC Flow Logs for monitoring
- ✅ KMS encryption for cluster secrets

### EKS Cluster
- ✅ EKS 1.28 with managed node groups
- ✅ Mixed On-Demand and Spot instances
- ✅ Auto-scaling enabled
- ✅ Comprehensive logging (API, Audit, etc.)
- ✅ OIDC provider for service accounts

### Security
- ✅ IAM roles following least privilege principle
- ✅ Security groups with minimal required access
- ✅ Pod Security Policies
- ✅ Network Policies
- ✅ Secrets encryption at rest

### Add-ons & Controllers
- ✅ AWS Load Balancer Controller (ALB/NLB)
- ✅ EBS CSI Driver with GP3 default storage
- ✅ EFS CSI Driver for shared storage
- ✅ Cluster Autoscaler
- ✅ AWS Secrets Manager CSI Driver
- ✅ AWS SSM Parameter Store CSI Driver
- ✅ Container Insights for monitoring
- ✅ Fluent Bit for log forwarding
- ✅ Metrics Server
- ✅ Kubernetes Dashboard (optional)

## Prerequisites

- AWS CLI configured with appropriate permissions
- Node.js 16+ and npm
- AWS CDK CLI (`npm install -g aws-cdk`)
- kubectl for cluster management

## Deployment

### 1. Install Dependencies

```bash
npm install
```

### 2. Bootstrap CDK (first time only)

```bash
cdk bootstrap
```

### 3. Deploy the Infrastructure

**Option 1: Manual deployment (recommended for first-time users)**
```bash
# Deploy core infrastructure first (to avoid rate limiting)
npx cdk deploy EksVpcStack EksIamStack

# Deploy cluster control plane only (no nodes)
npx cdk deploy EksClusterStack

# Deploy node groups separately
npx cdk deploy EksNodeGroupsStack

# Deploy add-ons last
npx cdk deploy EksAddonsStack
```

**Option 2: Automated one-by-one deployment (if you get rate limiting)**
```bash
# Run the automated deployment script with delays
./scripts/deploy-one-by-one.sh
```

**Option 3: Deploy add-ons individually (if add-ons fail)**
```bash
# Interactive script to deploy add-ons one at a time
./scripts/deploy-addons-individually.sh
```

**Important**: Due to AWS rate limiting, the deployment uses a phased approach. See [DEPLOYMENT_STRATEGY.md](DEPLOYMENT_STRATEGY.md) for the complete deployment plan and [DEPLOYMENT_FIXES.md](DEPLOYMENT_FIXES.md) for troubleshooting.

### 4. Configure kubectl

```bash
aws eks update-kubeconfig --region <region> --name production-eks-cluster
```

## Usage Examples

### Using AWS Load Balancer Controller

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: example-ingress
  annotations:
    kubernetes.io/ingress.class: alb
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
spec:
  rules:
  - host: example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: example-service
            port:
              number: 80
```

### Using Secrets Manager

```yaml
apiVersion: secrets-store.csi.x-k8s.io/v1
kind: SecretProviderClass
metadata:
  name: example-secret-provider
spec:
  provider: aws
  parameters:
    objects: |
      - objectName: "eks-sample-secret"
        objectType: "secretsmanager"
        jmesPath:
          - path: "username"
            objectAlias: "db_username"
          - path: "password"
            objectAlias: "db_password"
```

### Using SSM Parameter Store

```yaml
apiVersion: secrets-store.csi.x-k8s.io/v1
kind: SecretProviderClass
metadata:
  name: example-ssm-provider
spec:
  provider: aws
  parameters:
    objects: |
      - objectName: "/eks/app/config/database-url"
        objectType: "ssmparameter"
        objectAlias: "database_url"
```

### Using EBS Storage

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: example-pvc
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: gp3
  resources:
    requests:
      storage: 10Gi
```

## Monitoring & Observability

### CloudWatch Container Insights
- Automatically enabled for cluster monitoring
- Provides cluster, node, and pod metrics
- Integrated with CloudWatch dashboards

### Logging
- EKS control plane logs forwarded to CloudWatch
- Application logs collected via Fluent Bit
- VPC Flow Logs for network monitoring

### Metrics Server
- Enables Horizontal Pod Autoscaler
- Provides resource usage metrics

## Security Best Practices

### IAM
- Separate roles for cluster and node groups
- Service accounts with IRSA (IAM Roles for Service Accounts)
- Least privilege access policies

### Network Security
- Private subnets for worker nodes
- Security groups with minimal required ports
- Network policies for pod-to-pod communication

### Secrets Management
- Secrets stored in AWS Secrets Manager
- Configuration in SSM Parameter Store
- Automatic secret rotation enabled

## Scaling

### Horizontal Pod Autoscaler
```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: example-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: example-deployment
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
```

### Cluster Autoscaler
- Automatically scales node groups based on pod demands
- Configured with appropriate scale-down policies
- Supports both On-Demand and Spot instances

## Maintenance

### Updating the Cluster
```bash
# Update Kubernetes version
cdk deploy EksClusterStack --parameters version=1.29

# Update add-ons
cdk deploy EksAddonsStack
```

### Backup and Disaster Recovery
- EBS volumes are encrypted and backed up
- Cluster configuration stored in git
- Secrets managed through AWS Secrets Manager

## Troubleshooting

### Common Issues

1. **Pods stuck in Pending state**
   - Check cluster autoscaler logs
   - Verify node group scaling limits
   - Check resource quotas

2. **ALB not created**
   - Verify ALB controller is running
   - Check service annotations
   - Ensure subnets are tagged correctly

3. **Secrets not mounting**
   - Verify IAM permissions
   - Check SecretProviderClass configuration
   - Ensure CSI driver is installed

### Useful Commands

```bash
# Check cluster status
kubectl get nodes
kubectl get pods -A

# Check add-on status
kubectl get pods -n kube-system

# View logs
kubectl logs -n kube-system deployment/aws-load-balancer-controller
kubectl logs -n kube-system deployment/cluster-autoscaler

# Check resources
kubectl top nodes
kubectl top pods
```

## Cleanup

```bash
# Destroy all resources
npm run destroy

# Or destroy individual stacks (in reverse order)
cdk destroy EksAddonsStack
cdk destroy EksClusterStack
cdk destroy EksIamStack
cdk destroy EksVpcStack
```

## Cost Optimization

- Uses Spot instances for non-critical workloads
- VPC Endpoints to reduce NAT Gateway costs
- Right-sized instance types
- Cluster autoscaler for efficient resource usage

## Support

For issues and questions:
1. Check the troubleshooting section
2. Review AWS EKS documentation
3. Check CloudWatch logs for errors
4. Verify IAM permissions
