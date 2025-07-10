#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { EksClusterStack } from './stacks/eks-cluster-stack';
import { VpcStack } from './stacks/vpc-stack';
import { IamStack } from './stacks/iam-stack';
import { AddonsStack } from './stacks/addons-stack';
import { NodeGroupsStack } from './stacks/nodegroups-stack';
import { OidcTrustStack } from './stacks/oidc-trust-stack';
import { getEnvironmentConfig } from './config/environments';

const app = new cdk.App();

// Get environment configuration
const environmentName = app.node.tryGetContext('environment') || process.env.ENVIRONMENT || 'dev';
const envConfig = getEnvironmentConfig(environmentName);

const env = {
    account: envConfig.account,
    region: envConfig.region
};

// VPC Stack - Foundation
const vpcStack = new VpcStack(app, `${envConfig.stackNamePrefix}-vpc-stack`, {
    env,
    description: `VPC infrastructure for ${envConfig.projectName} - ${envConfig.name}`
});

// IAM Stack - Roles and Policies
const iamStack = new IamStack(app, `${envConfig.stackNamePrefix}-iam-stack`, {
    env,
    description: `IAM roles and policies for ${envConfig.projectName} - ${envConfig.name}`
});

// EKS Cluster Stack - Choose based on environment configuration
let eksStack: any;
if (envConfig.features?.clusterType === 'minimal') {
    eksStack = new EksClusterStack(app, `${envConfig.stackNamePrefix}-minimal-eks-stack`, {
        env,
        vpc: vpcStack.vpc,
        clusterRole: iamStack.clusterRole,
        projectName: envConfig.projectName,
        environmentName: envConfig.name,
        description: `Minimal EKS cluster for ${envConfig.projectName} - ${envConfig.name}`
    });
} else {
    eksStack = new EksClusterStack(app, `${envConfig.stackNamePrefix}-eks-stack`, {
        env,
        vpc: vpcStack.vpc,
        clusterRole: iamStack.clusterRole,
        projectName: envConfig.projectName,
        environmentName: envConfig.name,
        description: `Production EKS cluster for ${envConfig.projectName} - ${envConfig.name}`
    });
}

// Original complex stack - comment out for now
/*
const eksStack = new EksClusterStack(app, 'EksClusterStack', {
  env,
  vpc: vpcStack.vpc,
  clusterRole: iamStack.clusterRole,
  description: 'Production-grade EKS cluster'
});
*/

// Production-grade stacks for all environments
let nodeGroupsStack: any;
let addonsStack: any;
let oidcTrustStack: any;

// Node Groups Stack - Always deploy for production-grade setup
if (envConfig.features?.enableNodeGroups) {
    nodeGroupsStack = new NodeGroupsStack(app, `${envConfig.stackNamePrefix}-node-groups-stack`, {
        env,
        cluster: eksStack.cluster,
        vpc: vpcStack.vpc,
        nodeGroupRole: iamStack.nodeGroupRole,
        projectName: envConfig.projectName,
        environmentName: envConfig.name,
        description: `Production EKS node groups for ${envConfig.projectName} - ${envConfig.name}`
    });
}

// Addons Stacks - Deploy as separate stacks for better modularity
// Only create addon stacks if explicitly requested via context or environment variable
const enableAddonsDeployment = app.node.tryGetContext('enableAddons') || process.env.ENABLE_ADDONS === 'true';
if (envConfig.features?.enableAddons && nodeGroupsStack && enableAddonsDeployment) {
    // Core Addons Stack (fast deployment ~3-5 minutes)
    const coreAddonsStack = new AddonsStack(app, `${envConfig.stackNamePrefix}-addons-core-stack`, {
        env,
        cluster: eksStack.cluster,
        stackType: 'core',
        description: `Core EKS add-ons for ${envConfig.projectName} - ${envConfig.name}`
    });
    
    // Storage Addons Stack (fast deployment ~2-3 minutes)
    const storageAddonsStack = new AddonsStack(app, `${envConfig.stackNamePrefix}-addons-storage-stack`, {
        env,
        cluster: eksStack.cluster,
        stackType: 'storage',
        description: `Storage add-ons for ${envConfig.projectName} - ${envConfig.name}`
    });
    
    // Networking Addons Stack (moderate deployment ~5-8 minutes)
    const networkingAddonsStack = new AddonsStack(app, `${envConfig.stackNamePrefix}-addons-networking-stack`, {
        env,
        cluster: eksStack.cluster,
        stackType: 'networking',
        description: `Networking add-ons for ${envConfig.projectName} - ${envConfig.name}`
    });
    
    // Monitoring Addons Stack (slower deployment ~10-15 minutes)
    const monitoringAddonsStack = new AddonsStack(app, `${envConfig.stackNamePrefix}-addons-monitoring-stack`, {
        env,
        cluster: eksStack.cluster,
        stackType: 'monitoring',
        description: `Monitoring add-ons for ${envConfig.projectName} - ${envConfig.name}`
    });
    
    // Security Addons Stack (moderate deployment ~8-12 minutes)
    const securityAddonsStack = new AddonsStack(app, `${envConfig.stackNamePrefix}-addons-security-stack`, {
        env,
        cluster: eksStack.cluster,
        stackType: 'security',
        description: `Security add-ons for ${envConfig.projectName} - ${envConfig.name}`
    });
    
    // Set up dependencies
    coreAddonsStack.addDependency(nodeGroupsStack);
    storageAddonsStack.addDependency(nodeGroupsStack);
    networkingAddonsStack.addDependency(coreAddonsStack);
    monitoringAddonsStack.addDependency(coreAddonsStack);
    securityAddonsStack.addDependency(coreAddonsStack);
    
    // Set addonsStack for backward compatibility
    addonsStack = coreAddonsStack;
}

if (envConfig.features?.enableOidcTrust) {
    oidcTrustStack = new OidcTrustStack(app, `${envConfig.stackNamePrefix}-oidc-trust-stack`, {
        env,
        cluster: eksStack.cluster,
        description: `OIDC trust relationships for ${envConfig.projectName} - ${envConfig.name}`
    });
}

// Stack dependencies
eksStack.addDependency(vpcStack);
eksStack.addDependency(iamStack);

if (nodeGroupsStack) {
    nodeGroupsStack.addDependency(eksStack);
    nodeGroupsStack.addDependency(iamStack);
}

if (addonsStack && nodeGroupsStack) {
    addonsStack.addDependency(nodeGroupsStack);
}

if (oidcTrustStack) {
    oidcTrustStack.addDependency(eksStack);
}

// Tags from environment configuration
const tags = envConfig.tags;

Object.entries(tags).forEach(([key, value]) => {
    cdk.Tags.of(app).add(key, value);
});
