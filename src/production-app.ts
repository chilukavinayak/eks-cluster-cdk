#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { ProductionEksStack } from './stacks/production-eks-stack';
import { ComprehensiveAddonsStack } from './stacks/comprehensive-addons-stack';
import { VpcStack } from './stacks/vpc-stack';
import { IamStack } from './stacks/iam-stack';

const app = new cdk.App();

// Get environment configuration
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || 'us-east-1'
};

// VPC Stack - Network Foundation
const vpcStack = new VpcStack(app, 'ProductionVpcStack', {
  env,
  description: 'Production VPC infrastructure for EKS cluster',
  stackName: 'production-eks-vpc',
});

// IAM Stack - Security Foundation
const iamStack = new IamStack(app, 'ProductionIamStack', {
  env,
  description: 'Production IAM roles and policies for EKS cluster',
  stackName: 'production-eks-iam',
});

// EKS Cluster Stack - Main Cluster with Node Groups
const eksStack = new ProductionEksStack(app, 'ProductionEksStack', {
  env,
  vpc: vpcStack.vpc,
  clusterRole: iamStack.clusterRole,
  description: 'Production EKS cluster with managed node groups',
  stackName: 'production-eks-cluster',
});

// Add-ons Stack - Controllers and Utilities
// Temporarily disabled due to circular dependency
// const addonsStack = new ComprehensiveAddonsStack(app, 'ProductionAddonsStack', {
//   env,
//   cluster: eksStack.cluster,
//   vpc: vpcStack.vpc,
//   description: 'Production EKS add-ons and controllers',
//   stackName: 'production-eks-addons',
// });

// Stack dependencies
eksStack.addDependency(vpcStack);
eksStack.addDependency(iamStack);
// addonsStack.addDependency(eksStack);

// Global tags
const tags = {
  Environment: 'production',
  Project: 'eks-cluster',
  ManagedBy: 'CDK',
  CostCenter: 'infrastructure',
  Owner: 'platform-team',
};

Object.entries(tags).forEach(([key, value]) => {
  cdk.Tags.of(app).add(key, value);
});

// Stack-specific tags
cdk.Tags.of(vpcStack).add('Component', 'networking');
cdk.Tags.of(iamStack).add('Component', 'security');
cdk.Tags.of(eksStack).add('Component', 'compute');
// cdk.Tags.of(addonsStack).add('Component', 'addons');

app.synth();
