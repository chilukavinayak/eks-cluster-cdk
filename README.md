# Production-Grade AWS EKS Cluster Infrastructure

This CDK project provides a comprehensive **EKS cluster infrastructure** for deploying production-ready Kubernetes clusters:

- ✅ **Foundation Stack** - IAM roles, security groups, KMS encryption
- ✅ **EKS Cluster Stack** - Control plane with private/public endpoints
- ✅ **Compute Stack** - Managed node groups and Fargate profiles
- ✅ **Addons Stack** - Essential cluster add-ons (CNI, CoreDNS, CSI drivers)
- ✅ **Enterprise-grade security** (KMS encryption, IRSA, security groups)
- ✅ **Production monitoring** (CloudWatch logs, metrics, alerts)
- ✅ **Cost-optimized** (GP3 storage, right-sized instances, spot instances)
- ✅ **Ready for applications** - Deploy your apps in separate CDK projects

## Table of Contents

1. [Production-Ready Improvements](#1-production-ready-improvements)
2. [Deployment Strategy](#2-deployment-strategy)
3. [CDK Project Structure](#3-cdk-project-structure)
4. [Deployment Commands](#4-deployment-commands)
5. [Configuration](#5-configuration)
6. [Security Best Practices](#6-security-best-practices)
7. [Production Checklist](#7-production-checklist)

---

## 1. Production-Ready Improvements

### 🔐 Security Enhancements

#### KMS Encryption
- **KMS Key Retention**: Changed from `DESTROY` to `RETAIN` for data recovery
- **Key Rotation**: Enabled automatic key rotation
- **Admin Access**: Added account root principal for key administration
- **Enhanced Permissions**: Added necessary EKS service permissions (GenerateDataKey, CreateGrant)

#### Network Security
- **Private Subnets**: Worker nodes deployed only in private subnets
- **Security Groups**: Properly configured with minimal required access
- **Endpoint Access**: Public and private endpoints for operational flexibility
- **VPC Isolation**: Complete network isolation with NAT Gateway for outbound access

#### IAM Security
- **Least Privilege**: Service accounts with minimal required permissions
- **IRSA**: IAM Roles for Service Accounts for pod-level permissions
- **Managed Policies**: Using AWS managed policies where appropriate

### 🏗️ Infrastructure Improvements

#### Compute Resources
- **Launch Templates**: Custom launch templates with security configurations
- **IMDSv2**: Enforced Instance Metadata Service v2 for enhanced security
- **GP3 Storage**: Optimized EBS GP3 volumes with custom IOPS (3000) and throughput (125 MBps)
- **Encryption**: All EBS volumes encrypted with customer-managed KMS keys
- **Detailed Monitoring**: Enabled for better observability

#### High Availability
- **Multi-AZ**: Resources distributed across 3 availability zones
- **Managed Node Groups**: Auto-scaling with proper health checks
- **Fargate**: Mixed compute model for system and application workloads

### 📊 Monitoring & Logging

#### CloudWatch Integration
- **Control Plane Logs**: All EKS log types enabled (API, Audit, Authenticator, etc.)
- **Log Retention**: Extended to 6 months for compliance
- **Log Encryption**: CloudWatch logs encrypted with KMS
- **Log Retention Policy**: Set to RETAIN for audit purposes

#### Observability
- **Detailed Monitoring**: Enabled on EC2 instances
- **VPC Flow Logs**: Can be enabled for network monitoring
- **Container Insights**: Ready for deployment

### 🚀 Operational Excellence

#### Add-ons Management
- **AWS Load Balancer Controller**: Helm chart deployment with IRSA
- **VPC CNI**: Latest managed add-on version
- **CoreDNS**: Managed add-on for DNS resolution
- **kube-proxy**: Managed add-on for networking

#### Resource Management
- **Resource Quotas**: Defined for application namespaces
- **Tagging Strategy**: Comprehensive tagging for cost management
- **Naming Conventions**: Consistent resource naming

### 🛡️ Compliance & Governance

#### Data Protection
- **Encryption at Rest**: KMS encryption for all data
- **Encryption in Transit**: TLS for all communications
- **Key Management**: Customer-managed KMS keys with proper access controls

#### Access Control
- **RBAC**: Kubernetes Role-Based Access Control ready
- **Pod Security**: Security contexts and policies ready for implementation
- **Network Policies**: Ready for fine-grained network controls

#### Audit & Compliance
- **Audit Logging**: Comprehensive EKS audit logs
- **Resource Tagging**: Compliance-ready tagging
- **Cost Allocation**: Proper resource allocation tags

---

## 2. Deployment Strategy

This CDK project deploys EKS cluster infrastructure in 4 sequential phases:

### 📋 Phase 1: Foundation (2-5 minutes)
**Stack: `sats-portals-dev-Foundation`**
- IAM roles and policies for EKS cluster
- KMS keys for encryption
- Security groups (cluster, nodes)
- VPC configuration

### 🏗️ Phase 2: EKS Cluster (10-15 minutes)
**Stack: `sats-portals-dev-EksCluster`**
- EKS control plane
- Cluster logging setup
- OIDC identity provider
- Node group and Fargate roles

### 💻 Phase 3: Compute Resources (8-12 minutes)
**Stack: `sats-portals-dev-Compute`**
- Managed node groups
- Fargate profiles
- Auto Scaling configurations
- Launch templates

### 🔧 Phase 4: Essential Add-ons (3-6 minutes)
**Stack: `sats-portals-dev-Addons`**
- AWS VPC CNI
- CoreDNS
- kube-proxy
- EBS CSI driver
- AWS Load Balancer Controller

### 🎯 Result: Ready for Applications
After these 4 stacks, your EKS cluster is ready for application deployments via separate CDK projects.

**Total Deployment Time:** ~25-40 minutes

---

## 3. Production-Grade EKS Cluster Setup

### A. Prerequisites

Before proceeding, ensure you have:

- **Existing VPC** with at least 2–3 private subnets across different AZs
- **IAM roles & policies** for EKS cluster, Fargate nodes, and worker node groups
- **CDK project structure** ready for multi-environment deployment (dev, stage, prod)
- **AWS CLI** configured with appropriate permissions
- **kubectl** installed for cluster management

### B. Core EKS Setup Steps

#### 1. Create EKS Cluster in Private Subnets

**Key Configuration:**
- Control plane endpoint: **private only**
- Disable public endpoint access
- Attach cluster security group allowing access from internal EC2s only
- Enable encryption with AWS KMS for secrets
- Enable comprehensive cluster logging

**Logging Components:**
- API Server logs
- Audit logs
- Authenticator logs
- Controller Manager logs
- Scheduler logs

#### 2. Worker Node Groups / Fargate Profiles

**Options:**
- **Managed Node Groups**: EC2 instances in private subnets with auto-scaling
- **Fargate Profiles**: Serverless workloads for specific namespaces
- **Cluster Autoscaler**: Automatic scaling based on pod requirements

#### 3. Networking Configuration

**VPC CNI Plugin:**
- Configure secondary CIDRs if IP exhaustion is a concern
- Enable private DNS resolution in the VPC
- Use internal-only load balancers

**Load Balancer Configuration:**
```yaml
# For internal-only access
service.beta.kubernetes.io/aws-load-balancer-internal: "true"
```

#### 4. Access & Security

**Security Features:**
- **IRSA (IAM Roles for Service Accounts)**: Pod-level permissions
- **RBAC**: Role-based access control with AWS Auth ConfigMap
- **Secrets Management**: AWS Secrets Manager or KMS-encrypted Secrets
- **Network Policies**: Pod-to-pod communication restrictions

#### 5. Monitoring & Logging

**Monitoring Options:**
- Prometheus + AWS Managed Grafana
- CloudWatch Container Insights
- Audit logs for compliance

#### 6. Access from EC2 (Current Setup)

**Requirements:**
- EC2 instances in the same VPC and private subnets
- Install kubectl on EC2 instances
- Update kubeconfig: `aws eks update-kubeconfig`
- Access internal services via internal load balancer DNS names

#### 7. Future Public Access (Roadmap)

**Components for Later:**
- AWS Load Balancer Controller for ingress
- Public ALB/NLB with WAF protection
- SSL/TLS termination
- External DNS for domain management

---

## 4. Application Onboarding to EKS using CDK TypeScript

### A. CDK Project Structure

```
eks-cluster-cdk/
├── lib/
│   ├── foundation-stack.ts        # IAM roles, security groups, KMS
│   ├── eks-cluster-stack.ts       # EKS control plane
│   ├── compute-stack.ts           # Node groups and Fargate
│   ├── addons-stack.ts            # Essential cluster add-ons
│   ├── application-stack.ts       # Application deployments
│   ├── monitoring-stack.ts        # Monitoring and logging setup
│   └── networking-stack.ts        # VPC and networking (if creating new)
├── bin/
│   └── cdk.ts                     # CDK app entry point
├── config/
│   ├── dev.json                   # Development environment config
│   ├── stage.json                 # Staging environment config
│   └── prod.json                  # Production environment config
└── manifests/
    ├── namespaces/
    ├── deployments/
    └── services/
```

### B. Application Deployment Steps

#### 1. Create Namespaces

**Via kubectl:**
```bash
kubectl create namespace <app-namespace>
```

**Via CDK:**
```typescript
cluster.addManifest('app-namespace', {
  apiVersion: 'v1',
  kind: 'Namespace',
  metadata: {
    name: 'app-namespace'
  }
});
```

#### 2. Create Service Accounts with IRSA

Map AWS IAM permissions to pods securely using IAM Roles for Service Accounts.

#### 3. Build and Push Docker Images

- Build application Docker images
- Push to Amazon ECR (private registry)
- Use ECR for secure, private image storage

#### 4. Create Kubernetes Manifests

**Components:**
- **Deployment**: Application pods configuration
- **Service**: ClusterIP or LoadBalancer (internal-only)
- **ConfigMaps & Secrets**: Environment configurations
- **Ingress**: Internal routing (future public access)

**CDK Integration Options:**
- Use `cluster.addManifest()` for direct YAML
- Integrate with Helm charts
- Use CDK8s for type-safe Kubernetes manifests

#### 5. Access from EC2

**Testing Steps:**
```bash
# SSH into EC2 inside the VPC
ssh -i key.pem ec2-user@<private-ip>

# Test cluster access
kubectl get pods -n <app-namespace>

# Test application access
curl http://<internal-lb-dns>
```

#### 6. Continuous Deployment (Optional)

**CI/CD Integration Options:**
- AWS CodePipeline
- ArgoCD for GitOps
- FluxCD for declarative deployments
- GitHub Actions with OIDC

---

## 5. CDK Project Structure

### Updated Stack Components (Based on Incremental Strategy)

#### Foundation Stack (`foundation-stack.ts`)
- IAM roles and policies
- Security groups
- KMS keys
- VPC endpoints

#### EKS Cluster Stack (`eks-cluster-stack.ts`)
- EKS control plane
- Cluster configuration
- OIDC identity provider
- Basic logging

#### Compute Stack (`compute-stack.ts`)
- Managed node groups
- Fargate profiles
- Auto Scaling groups
- Launch templates

#### Essential Add-ons Stack (`addons-stack.ts`)
- VPC CNI add-on
- CoreDNS add-on
- kube-proxy add-on
- EBS CSI driver
- AWS Load Balancer Controller

#### Application Stack (`application-stack.ts`)
- Kubernetes manifests
- Service accounts with IRSA
- Application-specific resources
- Internal load balancers

#### Monitoring Stack (`monitoring-stack.ts`)
- CloudWatch log groups
- Prometheus and Grafana setup
- Alerting configurations
- Dashboard provisioning

### Environment Configuration

Use context variables for different environments:

```json
{
  "dev": {
    "cluster-name": "dev-eks-cluster",
    "node-instance-type": "t3.medium",
    "min-nodes": 1,
    "max-nodes": 3
  },
  "prod": {
    "cluster-name": "prod-eks-cluster", 
    "node-instance-type": "m5.large",
    "min-nodes": 2,
    "max-nodes": 10
  }
}
```

---

## 6. Deployment Commands

### Initial Setup

```bash
# Install dependencies
npm install

# Bootstrap CDK (first time only)
cdk bootstrap

# Synthesize CloudFormation templates
cdk synth
```

### Incremental Deployment (Recommended)

```bash
# Phase 1: Foundation (2-5 minutes)
cdk deploy sats-portals-dev-Foundation

# Phase 2: Core EKS Cluster (10-15 minutes) 
cdk deploy sats-portals-dev-EksCluster

# Phase 3: Compute Resources (8-12 minutes)
cdk deploy sats-portals-dev-Compute

# Phase 4: Essential Add-ons (3-6 minutes)
cdk deploy sats-portals-dev-Addons

# Phase 5: Application Manifests (2-5 minutes) - NEW SEPARATE STACK
cdk deploy sats-portals-dev-ApplicationManifests

# Phase 6: Application Stack (2-10 minutes) - Optional for app-specific resources
# cdk deploy sats-portals-dev-Application

# Phase 7: Monitoring (5-10 minutes) - Optional
# cdk deploy sats-portals-dev-Monitoring
```

### Fast Parallel Deployment

```bash
# Deploy foundation and cluster first
cdk deploy FoundationStack --context env=prod
cdk deploy EksClusterStack --context env=prod
cdk deploy ComputeStack --context env=prod

# Deploy remaining stacks in parallel
cdk deploy EssentialAddonsStack ApplicationStack MonitoringStack --context env=prod
```

### Development Quick Start

```bash
# Minimal setup for development
cdk deploy FoundationStack EksClusterStack ComputeStack --context env=dev
```

### Cluster Management

```bash
# Update kubeconfig
aws eks update-kubeconfig --region us-east-1 --name prod-eks-cluster

# Verify cluster access
kubectl get nodes

# Check cluster info
kubectl cluster-info

# Monitor cluster resources
kubectl top nodes
kubectl top pods --all-namespaces
```

### Application Deployment

```bash
# Apply manifests
kubectl apply -f manifests/

# Check deployment status
kubectl get deployments -n <app-namespace>

# View application logs
kubectl logs -f deployment/<app-name> -n <app-namespace>

# Port forward for testing (from EC2)
kubectl port-forward service/<service-name> 8080:80 -n <app-namespace>
```

---

## 7. CDK TypeScript Code Examples

### Foundation Stack Example

```typescript
// lib/foundation-stack.ts
import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

export interface FoundationStackProps extends cdk.StackProps {
  clusterName: string;
  environment: string;
}

export class FoundationStack extends cdk.Stack {
  public readonly clusterRole: iam.Role;
  public readonly nodeGroupRole: iam.Role;
  public readonly fargateRole: iam.Role;
  public readonly kmsKey: kms.Key;
  public readonly clusterSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: FoundationStackProps) {
    super(scope, id, props);

    // KMS Key for EKS cluster encryption
    this.kmsKey = new kms.Key(this, 'EksKmsKey', {
      alias: `${props.clusterName}-eks-key`,
      description: `KMS key for ${props.clusterName} EKS cluster`,
      enableKeyRotation: true,
    });

    // EKS Cluster Service Role
    this.clusterRole = new iam.Role(this, 'EksClusterRole', {
      assumedBy: new iam.ServicePrincipal('eks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKSClusterPolicy'),
      ],
    });

    // EKS Node Group Role
    this.nodeGroupRole = new iam.Role(this, 'EksNodeGroupRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKSWorkerNodePolicy'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKS_CNI_Policy'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEC2ContainerRegistryReadOnly'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEBSCSIDriverPolicy'),
      ],
    });

    // Fargate Pod Execution Role
    this.fargateRole = new iam.Role(this, 'EksFargateRole', {
      assumedBy: new iam.ServicePrincipal('eks-fargate-pods.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKSFargatePodExecutionRolePolicy'),
      ],
    });

    // Security Group for EKS Cluster
    this.clusterSecurityGroup = new ec2.SecurityGroup(this, 'EksClusterSecurityGroup', {
      vpc: ec2.Vpc.fromLookup(this, 'ExistingVpc', {
        vpcId: this.node.tryGetContext('vpcId'),
      }),
      description: `Security group for ${props.clusterName} EKS cluster`,
      allowAllOutbound: false,
    });

    // Allow HTTPS traffic within VPC
    this.clusterSecurityGroup.addIngressRule(
      ec2.Peer.ipv4('10.0.0.0/8'),
      ec2.Port.tcp(443),
      'Allow HTTPS from VPC'
    );

    // Tags
    cdk.Tags.of(this).add('Environment', props.environment);
    cdk.Tags.of(this).add('Project', 'EKS-Cluster');
  }
}
```

### EKS Cluster Stack Example

```typescript
// lib/eks-cluster-stack.ts
import * as cdk from 'aws-cdk-lib';
import * as eks from 'aws-cdk-lib/aws-eks';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { FoundationStack } from './foundation-stack';

export interface EksClusterStackProps extends cdk.StackProps {
  foundationStack: FoundationStack;
  clusterName: string;
  environment: string;
}

export class EksClusterStack extends cdk.Stack {
  public readonly cluster: eks.Cluster;

  constructor(scope: Construct, id: string, props: EksClusterStackProps) {
    super(scope, id, props);

    // Get existing VPC
    const vpc = ec2.Vpc.fromLookup(this, 'ExistingVpc', {
      vpcId: this.node.tryGetContext('vpcId'),
    });

    // Private subnets only
    const privateSubnets = vpc.privateSubnets;

    // CloudWatch Log Group for cluster logs
    const logGroup = new logs.LogGroup(this, 'EksClusterLogGroup', {
      logGroupName: `/aws/eks/${props.clusterName}/cluster`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Create EKS Cluster
    this.cluster = new eks.Cluster(this, 'EksCluster', {
      clusterName: props.clusterName,
      version: eks.KubernetesVersion.V1_28,
      
      // Use existing VPC and private subnets only
      vpc: vpc,
      vpcSubnets: [{ subnets: privateSubnets }],
      
      // Private endpoint only
      endpointAccess: eks.EndpointAccess.PRIVATE,
      
      // Use foundation stack resources
      role: props.foundationStack.clusterRole,
      securityGroup: props.foundationStack.clusterSecurityGroup,
      
      // Encryption
      secretsEncryptionKey: props.foundationStack.kmsKey,
      
      // Logging
      clusterLogging: [
        eks.ClusterLoggingTypes.API,
        eks.ClusterLoggingTypes.AUDIT,
        eks.ClusterLoggingTypes.AUTHENTICATOR,
        eks.ClusterLoggingTypes.CONTROLLER_MANAGER,
        eks.ClusterLoggingTypes.SCHEDULER,
      ],
      
      // Don't create default node group
      defaultCapacity: 0,
      
      // Default namespace
      defaultCapacityInstance: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MEDIUM),
    });

    // Output cluster info
    new cdk.CfnOutput(this, 'ClusterName', {
      value: this.cluster.clusterName,
    });

    new cdk.CfnOutput(this, 'ClusterEndpoint', {
      value: this.cluster.clusterEndpoint,
    });

    // Tags
    cdk.Tags.of(this).add('Environment', props.environment);
    cdk.Tags.of(this).add('Project', 'EKS-Cluster');
  }
}
```

### Compute Stack Example

```typescript
// lib/compute-stack.ts
import * as cdk from 'aws-cdk-lib';
import * as eks from 'aws-cdk-lib/aws-eks';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import { EksClusterStack } from './eks-cluster-stack';
import { FoundationStack } from './foundation-stack';

export interface ComputeStackProps extends cdk.StackProps {
  eksClusterStack: EksClusterStack;
  foundationStack: FoundationStack;
  environment: string;
}

export class ComputeStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ComputeStackProps) {
    super(scope, id, props);

    const cluster = props.eksClusterStack.cluster;

    // Get environment-specific config
    const config = this.node.tryGetContext(props.environment) || {};
    
    // Managed Node Group
    const nodeGroup = cluster.addNodegroupCapacity('managed-node-group', {
      instanceTypes: [
        new ec2.InstanceType(config.nodeInstanceType || 'm5.large')
      ],
      minSize: config.minNodes || 1,
      maxSize: config.maxNodes || 10,
      desiredSize: config.desiredNodes || 2,
      
      // Use private subnets only
      subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      
      // Use foundation stack role
      nodeRole: props.foundationStack.nodeGroupRole,
      
      // AMI type
      amiType: eks.NodegroupAmiType.AL2_X86_64,
      capacityType: eks.CapacityType.ON_DEMAND,
      
      // Storage
      diskSize: 50,
      
      // Labels and taints
      labels: {
        'node-type': 'managed',
        'environment': props.environment,
      },
      
      // Auto Scaling
      tags: {
        'k8s.io/cluster-autoscaler/enabled': 'true',
        [`k8s.io/cluster-autoscaler/${cluster.clusterName}`]: 'owned',
      },
    });

    // Fargate Profile for system workloads
    cluster.addFargateProfile('system-fargate-profile', {
      selectors: [
        { namespace: 'kube-system' },
        { namespace: 'aws-load-balancer-controller' },
      ],
      fargateProfileName: 'system-workloads',
      podExecutionRole: props.foundationStack.fargateRole,
      subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
    });

    // Application Fargate Profile
    cluster.addFargateProfile('app-fargate-profile', {
      selectors: [
        { namespace: 'default' },
        { namespace: 'applications' },
      ],
      fargateProfileName: 'application-workloads',
      podExecutionRole: props.foundationStack.fargateRole,
      subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
    });

    // Tags
    cdk.Tags.of(this).add('Environment', props.environment);
    cdk.Tags.of(this).add('Project', 'EKS-Cluster');
  }
}
```

### CDK App Entry Point

```typescript
// bin/cdk.ts
#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { FoundationStack } from '../lib/foundation-stack';
import { EksClusterStack } from '../lib/eks-cluster-stack';
import { ComputeStack } from '../lib/compute-stack';

const app = new cdk.App();

// Get environment context
const environment = app.node.tryGetContext('env') || 'dev';
const config = app.node.tryGetContext(environment) || {};

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
};

// Foundation Stack
const foundationStack = new FoundationStack(app, 'FoundationStack', {
  env,
  clusterName: config.clusterName || `${environment}-eks-cluster`,
  environment,
});

// EKS Cluster Stack
const eksClusterStack = new EksClusterStack(app, 'EksClusterStack', {
  env,
  foundationStack,
  clusterName: config.clusterName || `${environment}-eks-cluster`,
  environment,
});
eksClusterStack.addDependency(foundationStack);

// Compute Stack
const computeStack = new ComputeStack(app, 'ComputeStack', {
  env,
  eksClusterStack,
  foundationStack,
  environment,
});
computeStack.addDependency(eksClusterStack);
```

### Environment Configuration

```json
// config/prod.json
{
  "clusterName": "prod-eks-cluster",
  "vpcId": "vpc-xxxxxxxxx",
  "nodeInstanceType": "m5.xlarge",
  "minNodes": 3,
  "maxNodes": 20,
  "desiredNodes": 5
}
```

```json
// config/dev.json
{
  "clusterName": "dev-eks-cluster", 
  "vpcId": "vpc-yyyyyyyyy",
  "nodeInstanceType": "t3.medium",
  "minNodes": 1,
  "maxNodes": 5,
  "desiredNodes": 2
}
```

---

## 8. Cost Optimization & Networking

### Cost Optimization Strategies

#### 1. Instance Selection
- **Development**: Use `t3.medium` or `t3.large` with spot instances
- **Production**: Use `m5.large` or `c5.large` for consistent performance
- **Mixed instance types**: Combine on-demand and spot instances

#### 2. Auto Scaling Configuration
```typescript
// Aggressive scaling for cost optimization
nodeGroup.addNodegroupCapacity('cost-optimized-nodes', {
  instanceTypes: [
    new ec2.InstanceType('t3.medium'),
    new ec2.InstanceType('t3.large'),
  ],
  capacityType: eks.CapacityType.SPOT, // 70% cost savings
  minSize: 0, // Scale to zero when not needed
  maxSize: 10,
  desiredSize: 1,
});
```

#### 3. Fargate vs EC2 Cost Analysis
- **Fargate**: Pay per pod, no idle capacity, good for variable workloads
- **EC2**: Lower cost per hour, better for consistent workloads
- **Hybrid**: Use Fargate for system pods, EC2 for application pods

### Networking Deep Dive

#### 1. VPC Endpoints (Required for Private Clusters)
```typescript
// Essential VPC endpoints for private EKS
const endpoints = [
  'com.amazonaws.region.eks',
  'com.amazonaws.region.ec2',
  'com.amazonaws.region.ecr.dkr',
  'com.amazonaws.region.ecr.api',
  'com.amazonaws.region.s3',
  'com.amazonaws.region.logs',
  'com.amazonaws.region.sts',
];

endpoints.forEach(service => {
  vpc.addInterfaceEndpoint(`${service}-endpoint`, {
    service: ec2.InterfaceVpcEndpointAwsService.fromName(service),
    subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
  });
});
```

#### 2. Subnet IP Planning
- **Minimum**: `/24` per subnet (254 IPs)
- **Recommended**: `/22` per subnet (1022 IPs) 
- **Pod density**: ~30 pods per `m5.large` node
- **IP allocation**: Each pod gets VPC IP (consider secondary CIDR)

#### 3. Security Group Rules
```typescript
// Minimal security group rules
clusterSG.addIngressRule(
  ec2.Peer.ipv4(vpc.vpcCidrBlock),
  ec2.Port.tcp(443),
  'EKS API access from VPC'
);

nodeSG.addIngressRule(
  clusterSG,
  ec2.Port.allTcp(),
  'Cluster to node communication'
);
```

#### 4. Load Balancer Strategy
- **Internal ALB**: For internal services (`internal: true`)
- **Network Load Balancer**: For high performance requirements
- **Service mesh**: Consider AWS App Mesh for advanced routing

### Resource Tagging Strategy

```typescript
// Consistent tagging across all resources
const commonTags = {
  'Environment': environment,
  'Project': 'EKS-Platform',
  'Owner': 'Platform-Team',
  'CostCenter': 'Engineering',
  'Backup': 'Required',
  'Monitoring': 'CloudWatch',
};

// Auto-tagging aspect
cdk.Aspects.of(app).add(new cdk.Tag('CreatedBy', 'CDK'));
```

---

## 9. Security Best Practices

### Network Security
- All subnets are private with no internet gateway access
- Security groups restrict access to necessary ports only
- Network ACLs provide additional layer of protection
- VPC Flow Logs enabled for network monitoring

### IAM Security
- Principle of least privilege for all IAM roles
- IRSA for pod-level permissions instead of node-level
- Regular rotation of access keys and certificates
- AWS Config rules for compliance monitoring

### Cluster Security
- Kubernetes RBAC enabled and configured
- Pod Security Standards enforced
- Secrets encrypted at rest with KMS
- API server audit logging enabled

### Future Considerations
- WAF integration when exposing publicly
- Certificate management with ACM
- External secrets operator for secret management
- Policy engines like OPA Gatekeeper

---

## 10. Production Checklist

### 📋 Pre-Deployment Checklist

#### Security & Compliance
- [ ] Verify VPC CIDR doesn't conflict with existing networks
- [ ] Configure public access CIDRs to restrict API server access to specific IPs
- [ ] Review IAM roles and permissions (principle of least privilege)
- [ ] Ensure KMS keys have proper admin access configured
- [ ] Validate security group rules are minimal and necessary
- [ ] Enable VPC Flow Logs for network monitoring
- [ ] Configure AWS Config rules for compliance monitoring

#### Infrastructure Planning
- [ ] Review and adjust node group instance types and sizes for workload requirements
- [ ] Plan storage requirements and IOPS for persistent volumes
- [ ] Validate subnet IP address allocation and availability
- [ ] Configure monitoring and alerting thresholds
- [ ] Plan backup and disaster recovery strategies
- [ ] Review cost optimization settings (spot instances, auto-scaling)

#### Monitoring & Observability
- [ ] Set up CloudWatch Container Insights
- [ ] Configure log aggregation and retention policies
- [ ] Set up alerting for critical cluster events
- [ ] Plan monitoring stack deployment (Prometheus, Grafana)
- [ ] Configure distributed tracing if needed

### 🚀 Post-Deployment Checklist

#### Essential Setup
- [ ] Install and configure cluster autoscaler
- [ ] Set up metrics server for HPA
- [ ] Configure DNS and SSL certificate management
- [ ] Implement pod security policies or Pod Security Standards
- [ ] Set up network policies for workload isolation
- [ ] Configure resource quotas and limits

#### Security Hardening
- [ ] Implement OPA Gatekeeper for policy enforcement
- [ ] Set up External Secrets Operator for secret management
- [ ] Configure pod security contexts and non-root containers
- [ ] Enable admission controllers and validation webhooks
- [ ] Implement service mesh (if required)
- [ ] Set up image scanning and vulnerability management

#### CI/CD Integration
- [ ] Set up CI/CD pipelines with proper RBAC
- [ ] Configure GitOps workflows (ArgoCD/FluxCD)
- [ ] Implement automated testing and deployment gates
- [ ] Set up container registry with image scanning
- [ ] Configure deployment approval workflows

#### Operational Excellence
- [ ] Document runbooks and incident response procedures
- [ ] Set up log aggregation and centralized monitoring
- [ ] Configure automated backups for persistent data
- [ ] Implement chaos engineering practices
- [ ] Set up cost monitoring and optimization alerts
- [ ] Plan regular security and compliance audits

### 🏷️ Resource Tagging Standards

Ensure all resources are tagged with:
```json
{
  "Environment": "production",
  "Project": "sats-portals",
  "ManagedBy": "CDK",
  "Repository": "eks-cluster-cdk",
  "CreatedDate": "YYYY-MM-DD",
  "CostCenter": "Engineering",
  "Owner": "Platform-Team",
  "Backup": "Required",
  "Monitoring": "CloudWatch"
}
```

### 🚨 Critical Monitoring Alerts

Set up alerts for:
- Cluster API server availability
- Node health and resource utilization
- Pod restart and failure rates
- Persistent volume capacity
- Network and security policy violations
- Cost anomalies and budget thresholds

### 📖 Documentation Requirements

Maintain documentation for:
- Architecture diagrams and component relationships
- Deployment procedures and rollback plans
- Security policies and compliance requirements
- Monitoring and alerting configurations
- Incident response and troubleshooting guides
- Cost optimization and capacity planning

---

## Troubleshooting

### Common Issues

1. **Node Group Creation Fails**
   - Check IAM permissions for EKS service role
   - Verify subnet configurations and availability zones
   - Ensure sufficient IP addresses in subnets

2. **Pods Cannot Pull Images**
   - Verify ECR permissions for node group IAM role
   - Check VPC endpoints for ECR if using private subnets
   - Ensure Docker daemon is running on nodes

3. **kubectl Connection Issues**
   - Verify EC2 instance can reach EKS API endpoint
   - Check security group rules for port 443
   - Ensure kubeconfig is properly configured

4. **Internal Load Balancer Not Working**
   - Verify service annotations for internal LB
   - Check subnet tags for load balancer discovery
   - Ensure AWS Load Balancer Controller is installed

### Monitoring and Alerting

- Set up CloudWatch alarms for cluster health
- Monitor node utilization and auto-scaling events
- Track application performance metrics
- Configure log aggregation for centralized monitoring

---

This blueprint provides a solid foundation for a production-grade, private EKS cluster that can scale with your organization's needs while maintaining security and operational best practices.
