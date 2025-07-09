#!/bin/bash

# Deploy BARE MINIMUM EKS cluster - just get SOMETHING working first
# This creates only the control plane with minimal resources

set -e

echo "🎯 BARE MINIMUM EKS DEPLOYMENT"
echo "Goal: Get just the cluster control plane working"
echo "We'll add everything else manually after this works"
echo

# Step 1: Deploy foundation only
echo "📦 Step 1/3: Deploying VPC and IAM (foundation only)..."
npx cdk deploy EksVpcStack --require-approval never
echo "✅ VPC deployed"

echo "Waiting 30 seconds..."
sleep 30

npx cdk deploy EksIamStack --require-approval never
echo "✅ IAM deployed"

echo "Waiting 60 seconds for IAM to propagate..."
sleep 60

# Step 2: Get the values we need
echo "📋 Getting resource values..."
VPC_ID=$(aws ec2 describe-vpcs --filters "Name=tag:Name,Values=EksVpcStack*" --query 'Vpcs[0].VpcId' --output text)
SUBNET_IDS=$(aws ec2 describe-subnets --filters "Name=vpc-id,Values=$VPC_ID" "Name=tag:aws-cdk:subnet-type,Values=Private" --query 'Subnets[].SubnetId' --output text | tr '\t' ',')
CLUSTER_ROLE_ARN=$(aws iam get-role --role-name EksClusterRole --query 'Role.Arn' --output text)

echo "VPC ID: $VPC_ID"
echo "Subnet IDs: $SUBNET_IDS"
echo "Cluster Role ARN: $CLUSTER_ROLE_ARN"

# Step 3: Create raw CloudFormation template
echo "📝 Creating minimal CloudFormation template..."
cat > /tmp/minimal-eks.yaml << 'EOF'
AWSTemplateFormatVersion: '2010-09-09'
Description: 'Minimal EKS Cluster - Control Plane Only'

Parameters:
  VpcId:
    Type: String
  SubnetIds:
    Type: CommaDelimitedList
  ClusterRoleArn:
    Type: String

Resources:
  # Security Group for EKS cluster
  EksSecurityGroup:
    Type: AWS::EC2::SecurityGroup
    Properties:
      GroupDescription: Security group for EKS cluster
      VpcId: !Ref VpcId
      SecurityGroupIngress:
        - IpProtocol: tcp
          FromPort: 443
          ToPort: 443
          CidrIp: 0.0.0.0/0
          Description: HTTPS access to EKS API
      SecurityGroupEgress:
        - IpProtocol: '-1'
          CidrIp: 0.0.0.0/0
          Description: All outbound traffic
      Tags:
        - Key: Name
          Value: EksClusterSecurityGroup

  # Minimal EKS Cluster
  EksCluster:
    Type: AWS::EKS::Cluster
    Properties:
      Name: production-eks-cluster
      Version: '1.28'
      RoleArn: !Ref ClusterRoleArn
      ResourcesVpcConfig:
        SubnetIds: !Ref SubnetIds
        SecurityGroupIds:
          - !Ref EksSecurityGroup
        EndpointConfigPublic: true
        EndpointConfigPrivate: true
        PublicAccessCidrs: ['0.0.0.0/0']
      # Minimal logging
      Logging:
        ClusterLogging:
          EnabledTypes:
            - Type: api
            - Type: audit
      Tags:
        - Key: Environment
          Value: production
        - Key: Project
          Value: eks-cluster

Outputs:
  ClusterName:
    Description: EKS Cluster Name
    Value: !Ref EksCluster
    Export:
      Name: !Sub '${AWS::StackName}-ClusterName'
  
  ClusterEndpoint:
    Description: EKS Cluster Endpoint
    Value: !GetAtt EksCluster.Endpoint
    Export:
      Name: !Sub '${AWS::StackName}-ClusterEndpoint'
  
  ClusterArn:
    Description: EKS Cluster ARN
    Value: !GetAtt EksCluster.Arn
    Export:
      Name: !Sub '${AWS::StackName}-ClusterArn'
  
  ConfigCommand:
    Description: Command to configure kubectl
    Value: !Sub 'aws eks update-kubeconfig --region ${AWS::Region} --name ${EksCluster}'
EOF

# Step 4: Deploy with CloudFormation directly
echo "🚀 Deploying minimal EKS cluster with CloudFormation..."
echo "This bypasses all CDK automatic resource creation"

aws cloudformation deploy \
  --template-file /tmp/minimal-eks.yaml \
  --stack-name MinimalEksCluster \
  --parameter-overrides \
    VpcId=$VPC_ID \
    SubnetIds=$SUBNET_IDS \
    ClusterRoleArn=$CLUSTER_ROLE_ARN \
  --capabilities CAPABILITY_IAM \
  --region ${AWS_DEFAULT_REGION:-us-east-1}

echo "✅ Minimal EKS cluster deployed!"

# Step 5: Configure kubectl
echo "🔧 Configuring kubectl..."
aws eks update-kubeconfig --region ${AWS_DEFAULT_REGION:-us-east-1} --name production-eks-cluster

# Step 6: Test cluster
echo "🧪 Testing cluster connectivity..."
kubectl get svc
echo "✅ Cluster is accessible via kubectl!"

echo
echo "🎉 SUCCESS! You now have a working EKS cluster (control plane only)"
echo
echo "Next steps (do these MANUALLY and ONE AT A TIME):"
echo "1. Add a node group via AWS Console"
echo "2. Install AWS Load Balancer Controller manually"
echo "3. Add other add-ons one by one"
echo
echo "Cluster details:"
echo "- Name: production-eks-cluster"
echo "- Region: ${AWS_DEFAULT_REGION:-us-east-1}"
echo "- Status: Check with 'kubectl get svc'"
echo
echo "To add a node group manually:"
echo "1. Go to AWS Console -> EKS -> production-eks-cluster"
echo "2. Click 'Add node group'"
echo "3. Use role: EksNodeGroupRole"
echo "4. Use subnets: Private subnets from your VPC"
