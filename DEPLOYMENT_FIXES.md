# EKS Cluster Deployment Fixes

## Rate Limiting Issue Resolution - ONE BY ONE APPROACH

### Quick Fix: Deploy One Stack at a Time with Delays

If you're getting rate limiting errors, follow this **step-by-step approach with waiting periods**:

```bash
# Step 1: VPC only
npx cdk deploy EksVpcStack
echo "Waiting 60 seconds for AWS to stabilize..."
sleep 60

# Step 2: IAM roles only  
npx cdk deploy EksIamStack
echo "Waiting 60 seconds for IAM to propagate..."
sleep 60

# Step 3: EKS cluster control plane only (no nodes)
npx cdk deploy EksClusterStack
echo "Waiting 180 seconds for cluster to stabilize..."
sleep 180

# Step 4: Check cluster is ready
aws eks describe-cluster --name production-eks-cluster --query 'cluster.status'

# Step 5: Node groups only
npx cdk deploy EksNodeGroupsStack
echo "Waiting 120 seconds for nodes to be ready..."
sleep 120

# Step 6: Check nodes are ready
kubectl get nodes

# Step 7: Deploy add-ons one by one (see below)
```

### Even More Granular: Deploy Individual Add-ons

If you still get rate limiting in the AddonsStack, deploy add-ons **one by one**:

1. **Edit `src/stacks/addons-stack.ts`** and comment out all but ONE add-on:
   ```typescript
   // Install only ONE at a time
   this.installAWSLoadBalancerController(cluster);
   // this.installEBSCSIDriver(cluster);           // Comment out
   // this.installClusterAutoscaler(cluster);      // Comment out  
   // this.installMetricsServer(cluster);          // Comment out
   ```

2. **Deploy that single add-on**:
   ```bash
   npx cdk deploy EksAddonsStack
   ```

3. **Wait and verify**:
   ```bash
   kubectl get pods -n kube-system -l app.kubernetes.io/name=aws-load-balancer-controller
   ```

4. **Uncomment the next add-on** and repeat:
   ```typescript
   this.installAWSLoadBalancerController(cluster);
   this.installEBSCSIDriver(cluster);              // Uncomment this
   // this.installClusterAutoscaler(cluster);      // Still commented
   // this.installMetricsServer(cluster);          // Still commented
   ```

5. **Deploy again**:
   ```bash
   npx cdk deploy EksAddonsStack
   ```

6. **Repeat until all add-ons are deployed**

## Rate Limiting Issue Resolution - LATEST SOLUTION

### Problem
During EKS cluster deployment, you may encounter `TooManyRequestsException: Rate Exceeded` errors in multiple scenarios:
1. When the EKS cluster creates default Kubernetes resources (AwsAuth, ServiceAccounts, etc.)
2. When installing multiple Helm charts simultaneously in the AddonsStack
3. When creating multiple node groups simultaneously in the EksClusterStack

### SOLUTION IMPLEMENTED (Latest Update)
We've completely restructured the deployment to eliminate rate limiting:

**EksClusterStack Changes:**
- ✅ **No node groups** - cluster control plane only
- ✅ **No default capacity** (`defaultCapacity: 0`)
- ✅ **API authentication mode** to avoid AwsAuth ConfigMap creation
- ✅ **Disabled automatic resource pruning**

**New NodeGroupsStack:**
- ✅ **Separate stack** for node groups (deploy after cluster)
- ✅ **Single node group** initially
- ✅ **Uses existing IAM roles** to avoid circular dependencies

**AddonsStack (unchanged):**
- ✅ **Only 4 essential add-ons** (ALB Controller, EBS CSI Driver, Cluster Autoscaler, Metrics Server)

### Current Deployment Sequence
```bash
# 1. Deploy foundation
npx cdk deploy EksVpcStack EksIamStack

# 2. Deploy cluster control plane ONLY (no nodes, no default resources)
npx cdk deploy EksClusterStack

# 3. Deploy node groups separately
npx cdk deploy EksNodeGroupsStack

# 4. Deploy add-ons
npx cdk deploy EksAddonsStack
```

### Solution
The AddonsStack has been modified to install only essential add-ons to avoid rate limiting:

**Essential Add-ons (auto-installed):**
- AWS Load Balancer Controller
- EBS CSI Driver
- Cluster Autoscaler
- Metrics Server

**Optional Add-ons (commented out):**
- EFS CSI Driver
- Secrets Manager CSI Driver
- SSM Parameter Store CSI Driver
- Container Insights
- Kubernetes Dashboard

The EksClusterStack has also been modified to create only one node group initially:

**Initial Node Group:**
- Primary Node Group (General purpose, On-Demand instances)

**Additional Node Groups (commented out):**
- Spot Node Group (Cost-optimized instances)
- EBS CSI Node Group (Storage-optimized)

### Manual Installation of Optional Add-ons

If you need the optional add-ons, you can install them manually after the initial deployment:

**For Add-ons:**
1. **Uncomment one add-on at a time** in `src/stacks/addons-stack.ts`
2. **Deploy the change**:
   ```bash
   npx cdk deploy EksAddonsStack
   ```
3. **Wait for completion** before enabling the next add-on

**For Additional Node Groups:**
1. **Uncomment one node group at a time** in `src/stacks/eks-cluster-stack.ts`
2. **Deploy the change**:
   ```bash
   npx cdk deploy EksClusterStack
   ```
3. **Wait for completion** before enabling the next node group

### Alternative: Sequential Deployment Script

Create a deployment script that deploys add-ons one by one:

```bash
#!/bin/bash
# deploy-addons-sequential.sh

# Deploy core infrastructure first
npx cdk deploy EksVpcStack EksIamStack EksClusterStack

# Wait between deployments to avoid rate limiting
echo "Waiting 30 seconds before deploying add-ons..."
sleep 30

# Deploy essential add-ons
npx cdk deploy EksAddonsStack

echo "Deployment complete!"
```

### Rate Limiting Best Practices

1. **Deploy in batches**: Don't install more than 3-4 Helm charts simultaneously
2. **Add delays**: Wait 30-60 seconds between deployments
3. **Monitor CloudWatch**: Check AWS Lambda logs for rate limiting errors
4. **Use retries**: Most CDK operations have built-in retry logic

### If You Still Get Rate Limiting Errors

1. **Reduce concurrent installations**: Comment out more add-ons
2. **Increase timeouts**: Some Helm charts may need longer timeouts
3. **Deploy manually**: Use `kubectl` and `helm` directly for problem charts
4. **Contact AWS Support**: If rate limits persist, request quota increases

## OIDC Trust Policy Issues

The OIDC trust stack has been temporarily disabled due to token resolution issues. You can create service account roles manually:

```bash
# Example: Create ALB Controller service account role
eksctl create iamserviceaccount \
  --cluster=production-eks-cluster \
  --namespace=kube-system \
  --name=aws-load-balancer-controller \
  --attach-policy-arn=arn:aws:iam::aws:policy/ElasticLoadBalancingFullAccess \
  --override-existing-serviceaccounts \
  --approve
```
