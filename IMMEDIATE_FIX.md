# IMMEDIATE FIX for Rate Limiting

## You're getting rate limiting again and again - here's what to do NOW:

### Option 1: Wait and Retry (Simplest)
```bash
# Just wait 10-15 minutes and retry the same command
echo "Waiting 15 minutes for AWS rate limits to reset..."
sleep 900  # 15 minutes

# Then retry
npx cdk deploy EksClusterStack --require-approval never
```

### Option 2: Clean Up and Start Fresh
```bash
# Destroy the failed cluster
npx cdk destroy EksClusterStack --force

# Wait 5 minutes
echo "Waiting 5 minutes for cleanup..."
sleep 300

# Try minimal cluster approach
npx cdk deploy MinimalEksClusterStack --require-approval never
```

### Option 3: Use Raw CloudFormation (Most Reliable)
Instead of CDK's high-level constructs, use raw CloudFormation:

1. **Create a simple CloudFormation template** (`eks-cluster-raw.yaml`):
```yaml
AWSTemplateFormatVersion: '2010-09-09'
Description: 'Minimal EKS Cluster'

Parameters:
  ClusterName:
    Type: String
    Default: 'production-eks-cluster'
  
  VpcId:
    Type: String
    Description: 'VPC ID from VPC stack'
  
  SubnetIds:
    Type: CommaDelimitedList
    Description: 'Private subnet IDs'
  
  ClusterRoleArn:
    Type: String
    Description: 'EKS cluster role ARN'

Resources:
  EksCluster:
    Type: AWS::EKS::Cluster
    Properties:
      Name: !Ref ClusterName
      Version: '1.28'
      RoleArn: !Ref ClusterRoleArn
      ResourcesVpcConfig:
        SubnetIds: !Ref SubnetIds
        EndpointConfigPublic: true
        EndpointConfigPrivate: true
        PublicAccessCidrs: ['0.0.0.0/0']

Outputs:
  ClusterName:
    Value: !Ref EksCluster
    Export:
      Name: !Sub '${AWS::StackName}-ClusterName'
  
  ClusterEndpoint:
    Value: !GetAtt EksCluster.Endpoint
    Export:
      Name: !Sub '${AWS::StackName}-ClusterEndpoint'
```

2. **Deploy with CloudFormation directly**:
```bash
aws cloudformation deploy \
  --template-file eks-cluster-raw.yaml \
  --stack-name EksClusterRaw \
  --parameter-overrides \
    VpcId=vpc-xxxxxxxxx \
    SubnetIds=subnet-xxxxxxxx,subnet-yyyyyyyy \
    ClusterRoleArn=arn:aws:iam::123456789012:role/EksClusterRole \
  --capabilities CAPABILITY_IAM
```

### Option 4: Use Different AWS Region
Rate limits are per-region, so try a different region:

```bash
# Set different region
export AWS_DEFAULT_REGION=us-west-2

# Update cdk.json or use --region flag
npx cdk deploy EksClusterStack --require-approval never --region us-west-2
```

### Option 5: Contact AWS Support
If rate limiting persists, you may need to request quota increases:

```bash
# Check current limits
aws service-quotas get-service-quota \
  --service-code eks \
  --quota-code L-1194D53C

# Request increase through AWS Console:
# Service Quotas -> AWS Services -> Amazon Elastic Kubernetes Service
```

## What's Causing This?

The rate limiting is happening because:
1. **CDK's EKS construct creates too many resources simultaneously**
2. **AWS Lambda functions hit concurrent execution limits**
3. **Kubernetes API calls exceed rate limits**
4. **Multiple CloudFormation custom resources run at once**

## Next Steps After This Fix

Once you get a basic cluster running:

1. **Don't add node groups yet** - get cluster working first
2. **Add one node group manually** via AWS Console
3. **Test kubectl connection** before adding more
4. **Add add-ons one by one** manually

## Emergency Fallback

If nothing works, create cluster manually:
1. **AWS Console** -> EKS -> Create cluster
2. **Use existing VPC and IAM roles** from your CDK stacks
3. **Add node groups** manually after cluster is ready
4. **Skip CDK for cluster creation** entirely

The goal is to get SOMETHING working first, then expand gradually.
