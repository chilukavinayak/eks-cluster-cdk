#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import * as fs from 'fs';
import * as path from 'path';
import { FoundationStack } from '../lib/foundation-stack';
import { EksClusterStack } from '../lib/eks-cluster-stack';
import { ComputeStack } from '../lib/compute-stack';
import { AddonsStack } from '../lib/addons-stack';

const app = new cdk.App();

// Load configuration from environment.json
const configPath = path.join(__dirname, '..', 'config', 'environment.json');
let config: any = {};

try {
  const configFile = fs.readFileSync(configPath, 'utf-8');
  config = JSON.parse(configFile);
} catch (error) {
  console.error('Error loading configuration file:', error);
  console.error('Please ensure config/environment.json exists and is valid JSON');
  process.exit(1);
}

// Validate required configuration based on createNewVpc flag
const baseRequiredFields = ['clusterName', 'projectName', 'nodeInstanceType', 'minNodes', 'maxNodes', 'desiredNodes', 'privateSubnets'];
let requiredFields = [...baseRequiredFields];

if (config.createNewVpc) {
  requiredFields.push('vpcCidr', 'publicSubnets');
} else {
  requiredFields.push('vpcId');
}

for (const field of requiredFields) {
  if (!config[field]) {
    console.error(`Missing required configuration field: ${field}`);
    process.exit(1);
  }
}

// Validate subnets configuration
if (!Array.isArray(config.privateSubnets) || config.privateSubnets.length === 0) {
  console.error('privateSubnets must be an array with at least one subnet configuration');
  process.exit(1);
}

if (config.createNewVpc && (!Array.isArray(config.publicSubnets) || config.publicSubnets.length === 0)) {
  console.error('publicSubnets must be an array with at least one subnet configuration when createNewVpc is true');
  process.exit(1);
}

// Environment settings
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: config.region || process.env.CDK_DEFAULT_REGION || 'us-east-1',
};

console.log('🚀 Deploying Sats Portals EKS Infrastructure');
console.log(`📋 Configuration:`);
console.log(`   - Cluster Name: ${config.clusterName}`);
console.log(`   - Project Name: ${config.projectName}`);
console.log(`   - Region: ${env.region}`);
console.log(`   - VPC ID: ${config.vpcId}`);
console.log(`   - Environment: ${config.environment}`);
console.log(`   - Node Instance Type: ${config.nodeInstanceType}`);
console.log(`   - Min Nodes: ${config.minNodes}`);
console.log(`   - Max Nodes: ${config.maxNodes}`);
console.log(`   - Desired Nodes: ${config.desiredNodes}`);

// Stack naming convention
const stackPrefix = `${config.projectName}-${config.environment}`;

// 1. Foundation Stack - IAM roles, security groups, KMS
const foundationStack = new FoundationStack(app, `${stackPrefix}-Foundation`, {
  env,
  clusterName: config.clusterName,
  environment: config.environment,
  projectName: config.projectName,
  createNewVpc: config.createNewVpc,
  vpcId: config.vpcId,
  vpcCidr: config.vpcCidr,
  publicSubnets: config.publicSubnets,
  privateSubnets: config.privateSubnets,
  description: `Foundation infrastructure for ${config.projectName} EKS cluster`,
  tags: {
    ...config.tags,
    Stack: 'Foundation',
  },
});

// 2. EKS Cluster Stack - Control plane
const eksClusterStack = new EksClusterStack(app, `${stackPrefix}-EksCluster`, {
  env,
  foundationStack,
  clusterName: config.clusterName,
  environment: config.environment,
  projectName: config.projectName,
  description: `EKS cluster control plane for ${config.projectName}`,
  tags: {
    ...config.tags,
    Stack: 'EksCluster',
  },
});
eksClusterStack.addDependency(foundationStack);

// 3. Compute Stack - Node groups and Fargate
const computeStack = new ComputeStack(app, `${stackPrefix}-Compute`, {
  env,
  eksClusterStack,
  foundationStack,
  environment: config.environment,
  projectName: config.projectName,
  nodeInstanceType: config.nodeInstanceType,
  minNodes: config.minNodes,
  maxNodes: config.maxNodes,
  desiredNodes: config.desiredNodes,
  description: `Compute resources for ${config.projectName} EKS cluster`,
  tags: {
    ...config.tags,
    Stack: 'Compute',
  },
});
computeStack.addDependency(eksClusterStack);

// 4. Add-ons Stack - Essential cluster add-ons
const addonsStack = new AddonsStack(app, `${stackPrefix}-Addons`, {
  env,
  eksClusterStack,
  environment: config.environment,
  projectName: config.projectName,
  description: `Essential add-ons for ${config.projectName} EKS cluster`,
  tags: {
    ...config.tags,
    Stack: 'Addons',
  },
});
addonsStack.addDependency(computeStack);

// Apply common tags to all stacks
const allStacks = [foundationStack, eksClusterStack, computeStack, addonsStack];
allStacks.forEach(stack => {
  cdk.Tags.of(stack).add('ManagedBy', 'CDK');
  cdk.Tags.of(stack).add('Repository', 'eks-cluster-cdk');
  cdk.Tags.of(stack).add('CreatedDate', new Date().toISOString().split('T')[0]);
});

console.log('✅ CDK App initialized successfully');
console.log('📦 Stacks created:');
console.log(`   - ${foundationStack.stackName}`);
console.log(`   - ${eksClusterStack.stackName}`);
console.log(`   - ${computeStack.stackName}`);
console.log(`   - ${addonsStack.stackName}`);
console.log('');
console.log('🔧 Next steps:');
console.log('   1. Update config/environment.json with your VPC ID');
console.log('   2. Run: cdk bootstrap');
console.log('   3. Run: cdk synth');
console.log('   4. Run: cdk deploy sats-portals-dev-Foundation');
console.log('   5. Run: cdk deploy sats-portals-dev-EksCluster');
console.log('   6. Run: cdk deploy sats-portals-dev-Compute');
console.log('   7. Run: cdk deploy sats-portals-dev-Addons');
console.log('   8. EKS cluster ready for applications!');
