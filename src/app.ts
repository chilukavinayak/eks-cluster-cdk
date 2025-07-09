#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { EksClusterStack } from './stacks/eks-cluster-stack';
import { SuperMinimalEksStack } from './stacks/super-minimal-eks-stack';
import { VpcStack } from './stacks/vpc-stack';
import { IamStack } from './stacks/iam-stack';
import { AddonsStack } from './stacks/addons-stack';
import { NodeGroupsStack } from './stacks/nodegroups-stack';
import { OidcTrustStack } from './stacks/oidc-trust-stack';

const app = new cdk.App();

// Get environment configuration
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || 'us-east-1'
};

// VPC Stack - Foundation
const vpcStack = new VpcStack(app, 'EksVpcStack', {
  env,
  description: 'VPC infrastructure for EKS cluster'
});

// IAM Stack - Roles and Policies
const iamStack = new IamStack(app, 'EksIamStack', {
  env,
  description: 'IAM roles and policies for EKS cluster'
});

// EKS Cluster Stack - Use SuperMinimal for first deployment
const eksStack = new SuperMinimalEksStack(app, 'SuperMinimalEksStack', {
  env,
  vpc: vpcStack.vpc,
  clusterRole: iamStack.clusterRole,
  description: 'Super minimal EKS cluster - control plane only'
});

// Original complex stack - comment out for now
/*
const eksStack = new EksClusterStack(app, 'EksClusterStack', {
  env,
  vpc: vpcStack.vpc,
  clusterRole: iamStack.clusterRole,
  description: 'Production-grade EKS cluster'
});
*/

// Note: OIDC Trust Stack temporarily disabled due to token resolution issues
/*const oidcTrustStack = new OidcTrustStack(app, 'EksOidcTrustStack', {
  env,
  cluster: eksStack.cluster,
  description: 'OIDC trust relationships for service accounts'
});*/

// Node Groups Stack - Comment out for minimal deployment
/*
const nodeGroupsStack = new NodeGroupsStack(app, 'EksNodeGroupsStack', {
  env,
  cluster: eksStack.cluster,
  vpc: vpcStack.vpc,
  nodeGroupRole: iamStack.nodeGroupRole,
  description: 'EKS cluster managed node groups'
});

// Add-ons Stack - ALB Controller, CSI drivers, etc.
const addonsStack = new AddonsStack(app, 'EksAddonsStack', {
  env,
  cluster: eksStack.cluster,
  description: 'EKS cluster add-ons and controllers'
});
*/

// Stack dependencies - only for minimal deployment
eksStack.addDependency(vpcStack);
eksStack.addDependency(iamStack);

// Comment out other dependencies for minimal deployment
/*
nodeGroupsStack.addDependency(eksStack);
nodeGroupsStack.addDependency(iamStack);
addonsStack.addDependency(nodeGroupsStack);
*/

// Tags
const tags = {
  Environment: 'production',
  Project: 'eks-cluster',
  ManagedBy: 'CDK'
};

Object.entries(tags).forEach(([key, value]) => {
  cdk.Tags.of(app).add(key, value);
});
