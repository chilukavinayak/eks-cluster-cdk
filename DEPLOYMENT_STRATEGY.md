# EKS Cluster Deployment Strategy

## Current Issue: Rate Limiting

The deployment is failing due to AWS Lambda rate limiting when creating multiple Kubernetes resources simultaneously. This is a common issue with EKS deployments that create multiple node groups, Helm charts, or manifests at once.

## Modified Deployment Approach

### Phase 1: Minimal Cluster Deployment

The cluster has been configured to deploy with minimal resources initially:

**EksClusterStack Changes:**
- ✅ Only 1 node group (Primary) instead of 3
- ✅ `defaultCapacity: 0` to prevent automatic resource creation
- ✅ Commented out Spot and EBS CSI node groups

**AddonsStack Changes:**
- ✅ Only 4 essential add-ons instead of 8+
- ✅ Commented out optional add-ons

### Phase 2: Incremental Expansion

After successful initial deployment, gradually add resources:

1. **Add Additional Node Groups** (one at a time):
   ```bash
   # Uncomment SpotNodeGroup in eks-cluster-stack.ts
   npx cdk deploy EksClusterStack
   
   # Wait, then uncomment EbsCsiNodeGroup
   npx cdk deploy EksClusterStack
   ```

2. **Add Optional Add-ons** (one at a time):
   ```bash
   # Uncomment EFS CSI Driver in addons-stack.ts
   npx cdk deploy EksAddonsStack
   
   # Wait, then add next add-on
   ```

## Recommended Deployment Commands

### Step 1: Deploy Core Infrastructure
```bash
# Deploy foundation (no Kubernetes resources yet)
npx cdk deploy EksVpcStack EksIamStack

# Wait 2-3 minutes for resources to stabilize
```

### Step 2: Deploy Minimal Cluster (Control Plane Only)
```bash
# Deploy cluster without any node groups
npx cdk deploy EksClusterStack

# This may take 10-15 minutes for cluster creation
```

### Step 3: Deploy Node Groups
```bash
# Wait for cluster to be fully ready
aws eks describe-cluster --name production-eks-cluster --query 'cluster.status'

# Deploy node groups separately
npx cdk deploy EksNodeGroupsStack

# This may take 5-10 minutes
```

### Step 4: Deploy Essential Add-ons
```bash
# Wait for nodes to be ready
kubectl get nodes

# Deploy add-ons (4 essential ones only)
npx cdk deploy EksAddonsStack
```

### Step 4: Verify Deployment
```bash
# Configure kubectl
aws eks update-kubeconfig --region us-east-1 --name production-eks-cluster

# Check nodes
kubectl get nodes

# Check add-ons
kubectl get pods -n kube-system
```

## Retry Strategy for Failed Deployments

If you encounter rate limiting during any phase:

### Option 1: Retry Deployment
```bash
# Simply retry the failed stack
npx cdk deploy <FailedStackName>

# CDK will automatically retry failed resources
```

### Option 2: Manual Rollback and Restart
```bash
# If deployment is stuck, you may need to clean up
npx cdk destroy EksAddonsStack
npx cdk destroy EksClusterStack

# Wait a few minutes, then redeploy
npx cdk deploy EksClusterStack
npx cdk deploy EksAddonsStack
```

### Option 3: Further Reduce Concurrency
Edit the stacks to remove even more resources if needed:

1. Comment out more add-ons in `AddonsStack`
2. Start with just the ALB Controller
3. Add other add-ons one by one manually

## Monitoring Rate Limits

### CloudWatch Logs
Check Lambda function logs for rate limiting:
```bash
aws logs describe-log-groups --log-group-name-prefix="/aws/lambda/EksCluster"
```

### Cluster Status
Monitor cluster creation:
```bash
aws eks describe-cluster --name production-eks-cluster
```

### Node Group Status
Check node group creation:
```bash
aws eks describe-nodegroup --cluster-name production-eks-cluster --nodegroup-name primary-nodes
```

## Success Indicators

### Cluster Ready
- Cluster status: `ACTIVE`
- Node group status: `ACTIVE`
- Nodes appear in `kubectl get nodes`

### Add-ons Ready
- All pods in `kube-system` are running
- ALB Controller pod is running
- Metrics server is responding

## Timeline Expectations

- **VPC + IAM**: 3-5 minutes
- **EKS Cluster**: 10-15 minutes
- **Add-ons**: 5-10 minutes
- **Total**: ~20-30 minutes for minimal setup

## Post-Deployment Expansion

Once the minimal cluster is working:

1. **Add node groups** incrementally
2. **Install optional add-ons** one by one
3. **Test each addition** before proceeding
4. **Scale up** node group sizes as needed

This phased approach should resolve the rate limiting issues while still achieving the full production-grade EKS cluster.
