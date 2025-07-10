# Agent Configuration

This file contains configuration and commands for the production-grade EKS cluster deployment project.

## Quick Start Commands

### Unified Deployment Commands
```bash
# Deploy core infrastructure only
./scripts/deploy.sh dev core

# Deploy all addons (requires core)
./scripts/deploy.sh dev addons all

# Deploy everything (core + addons)
./scripts/deploy.sh dev full

# Deploy to different environments
./scripts/deploy.sh staging full
./scripts/deploy.sh prod core

# Deploy specific addon types
./scripts/deploy.sh dev addons essential
./scripts/deploy.sh dev addons monitoring
```

### Unified Destroy Commands
```bash
# Destroy only addons (keep core)
./scripts/destroy.sh dev addons

# Destroy only core infrastructure
./scripts/destroy.sh dev core

# Destroy everything
./scripts/destroy.sh dev full

# Destroy production (requires confirmation)
./scripts/destroy.sh prod full
```

## Development Commands

### TypeScript Build
```bash
npm run build
```

### CDK Commands
```bash
npm run cdk synth
npm run cdk deploy
npm run cdk destroy
```

### Kubernetes Commands
```bash
kubectl get all -n demo-app
kubectl logs -n demo-app -l app=backend -f
kubectl logs -n demo-app -l app=frontend -f
kubectl get ingress -n demo-app
kubectl describe hpa -n demo-app
kubectl top pods -n demo-app
```

### Docker Commands
```bash
# Build backend
cd applications/backend
docker build -t backend-api .

# Build frontend
cd applications/frontend
docker build -t frontend-app .
```

## Project Structure

```
eks-cluster-cdk/
├── src/                     # CDK TypeScript source
│   ├── stacks/             # CDK stacks
│   │   ├── eks-cluster-stack.ts      # Production EKS cluster
│   │   ├── nodegroups-stack.ts       # 4 production node groups
│   │   ├── addons-stack.ts          # ALB, CSI, monitoring
│   │   ├── vpc-stack.ts             # VPC with private subnets
│   │   └── iam-stack.ts             # IAM roles and policies
│   └── config/
│       └── environments.ts          # Multi-environment config
├── applications/           # Application source code
│   ├── backend/           # Node.js Express API
│   └── frontend/          # React frontend
├── k8s/                   # Kubernetes manifests
├── scripts/               # Environment deployment scripts
│   ├── deploy-env.sh      # Deploy to any environment
│   └── destroy-env.sh     # Destroy any environment
└── examples/              # Usage examples
```

## Production-Grade Node Groups

The NodeGroupsStack creates 4 specialized node groups for production workloads:

1. **System Node Group** (`system-nodes`)
   - Instance Types: m6i.large, m6i.xlarge, m5.large, m5.xlarge
   - Capacity: 2-6 nodes (desired: 3)
   - Disk: 100GB
   - Taint: `system-workload=true:NoSchedule`
   - Purpose: Critical system workloads

2. **Application Node Group** (`application-nodes`)
   - Instance Types: m6i.large-2xlarge, c6i.large-xlarge
   - Capacity: 3-20 nodes (desired: 5)
   - Disk: 100GB
   - No taints (general workloads)
   - Purpose: Main application workloads

3. **Spot Node Group** (`spot-nodes`)
   - Instance Types: Mixed m6i, m5, c6i, c5 instances
   - Capacity: 0-50 nodes (desired: 2)
   - Spot instances for cost optimization
   - Taint: `spot-instance=true:NoSchedule`
   - Purpose: Batch processing, non-critical workloads

4. **Memory Node Group** (`memory-nodes`)
   - Instance Types: r6i.large-2xlarge, r5.large-xlarge
   - Capacity: 0-10 nodes (desired: 1)
   - Memory-optimized instances
   - Taint: `memory-optimized=true:NoSchedule`
   - Purpose: Memory-intensive workloads, databases
```

## Environment Variables

Set these environment variables for configuration:

```bash
export AWS_REGION=us-east-1
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
```

## Testing Commands

### Load Testing
```bash
# Install Apache Bench
sudo apt-get install apache2-utils  # Ubuntu/Debian
brew install apache2-utils          # macOS

# Generate load
ab -n 1000 -c 10 http://ALB_DNS/api/status
```

### Application Testing
```bash
# Test backend API
curl http://ALB_DNS/api/status
curl http://ALB_DNS/api/users
curl -X POST http://ALB_DNS/api/users -H "Content-Type: application/json" -d '{"name":"Test","email":"test@example.com"}'

# Test frontend
curl http://ALB_DNS/
```

## Troubleshooting Commands

### Check Cluster Status
```bash
kubectl get nodes
kubectl get pods -A
kubectl cluster-info
```

### Check Application Status
```bash
kubectl get all -n demo-app
kubectl describe deployment -n demo-app
kubectl get events -n demo-app
```

### Check Ingress and Load Balancer
```bash
kubectl get ingress -n demo-app
kubectl describe ingress -n demo-app
aws elbv2 describe-load-balancers --region us-east-1
```

### Check Logs
```bash
kubectl logs -n demo-app -l app=backend --tail=50
kubectl logs -n demo-app -l app=frontend --tail=50
kubectl logs -n kube-system -l app.kubernetes.io/name=aws-load-balancer-controller
```

### Check Secrets and Config
```bash
kubectl get secretproviderclass -n demo-app
kubectl describe secretproviderclass -n demo-app
aws ssm get-parameters-by-path --path "/eks/app" --region us-east-1
aws secretsmanager list-secrets --region us-east-1
```

## Cleanup Commands

### Delete Applications
```bash
kubectl delete namespace demo-app
```

### Delete Infrastructure
```bash
./scripts/destroy.sh
```

### Clean Docker Images
```bash
docker system prune -a
```

## Common Issues and Solutions

### 1. Pods Stuck in Pending
```bash
kubectl describe pod -n demo-app
kubectl get events -n demo-app
# Check if cluster autoscaler is working
kubectl logs -n kube-system -l app=cluster-autoscaler
```

### 2. ALB Not Creating
```bash
kubectl logs -n kube-system -l app.kubernetes.io/name=aws-load-balancer-controller
kubectl describe ingress -n demo-app
```

### 3. Secrets Not Mounting
```bash
kubectl describe secretproviderclass -n demo-app
kubectl logs -n kube-system -l app=secrets-store-csi-driver
```

### 4. Application Not Accessible
```bash
kubectl get ingress -n demo-app
kubectl describe service -n demo-app
# Check security groups
aws ec2 describe-security-groups --region us-east-1
```

## Performance Monitoring

### Resource Usage
```bash
kubectl top nodes
kubectl top pods -n demo-app
kubectl get hpa -n demo-app
```

### Cluster Autoscaler
```bash
kubectl logs -n kube-system -l app=cluster-autoscaler
kubectl get nodes
```

## Security Best Practices

1. **RBAC**: Roles and permissions are configured
2. **Network Policies**: Pod-to-pod communication is restricted
3. **Secrets Management**: Using AWS Secrets Manager and SSM
4. **IRSA**: IAM roles for service accounts configured
5. **Private Subnets**: Worker nodes in private subnets
6. **Security Groups**: Minimal required ports

## Code Style Preferences

- Use TypeScript for CDK stacks
- Follow AWS CDK best practices
- Use explicit imports
- Add proper error handling
- Include comprehensive logging
- Use security best practices
- Follow Kubernetes naming conventions

## Naming Conventions

- **Stacks**: PascalCase with "Stack" suffix
- **Resources**: PascalCase
- **Kubernetes**: kebab-case
- **Environment Variables**: UPPER_CASE
- **Files**: kebab-case

## Additional Resources

- [AWS EKS Documentation](https://docs.aws.amazon.com/eks/)
- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/)
- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [AWS Load Balancer Controller](https://kubernetes-sigs.github.io/aws-load-balancer-controller/)
