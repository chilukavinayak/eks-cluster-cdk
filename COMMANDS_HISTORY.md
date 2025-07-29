# Commands History - Sats Portals EKS Cluster

## Project Setup
```bash
# Initialize npm project
npm init -y

# Install CDK dependencies
npm install aws-cdk-lib constructs source-map-support

# Install development dependencies
npm install --save-dev typescript @types/node ts-node aws-cdk
```

## Completed Commands
```bash
# Initialize TypeScript configuration
npx tsc --init ✅

# Compile TypeScript
npm run build ✅

# Test CDK synthesis
npm run synth ✅ (with validation errors fixed)

# Find available VPCs
aws ec2 describe-vpcs --region us-east-1 --query "Vpcs[*].[VpcId,IsDefault,CidrBlock]" --output table ✅

# Configuration updated with VPC: vpc-092aba922d044380f (default VPC)
# Instance type updated to m5.large ✅
# Fixed circular dependencies and token resolution issues ✅
# Modified for default VPC (public subnets) compatibility ✅
# Created private subnet configuration in environment.json ✅
# Modified foundation stack to create private subnets with NAT Gateway ✅
# Updated to use 10.0.0.0/16 CIDR range ✅
# Added createNewVpc flag to choose between new VPC or existing VPC ✅
# Foundation stack now creates complete VPC with public/private subnets ✅
```

## Next Commands to Run
```bash
# Update VPC ID in config/environment.json first!
# Replace vpc-XXXXXXXXX with your actual VPC ID

# Bootstrap CDK (run once per AWS account/region)
npm run bootstrap

# Synthesize CloudFormation templates
npm run synth

# Deploy stacks incrementally
npm run deploy-foundation
npm run deploy-cluster
npm run deploy-compute
npm run deploy-addons
npm run deploy-app
npm run deploy-monitoring

# Or deploy all at once (faster)
npm run deploy-all
```

## Project Details
- **Project Name**: sats portals
- **Region**: us-east-1
- **Environment**: Single environment (to be copied for different environments)
