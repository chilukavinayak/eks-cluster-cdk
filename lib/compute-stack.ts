import * as cdk from 'aws-cdk-lib';
import * as eks from 'aws-cdk-lib/aws-eks';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as autoscaling from 'aws-cdk-lib/aws-autoscaling';
import { Construct } from 'constructs';
import { EksClusterStack } from './eks-cluster-stack';
import { FoundationStack } from './foundation-stack';

export interface ComputeStackProps extends cdk.StackProps {
  eksClusterStack: EksClusterStack;
  foundationStack: FoundationStack;
  environment: string;
  projectName: string;
  nodeInstanceType: string;
  minNodes: number;
  maxNodes: number;
  desiredNodes: number;
}

export class ComputeStack extends cdk.Stack {
  public readonly managedNodeGroup: eks.Nodegroup;
  public readonly systemFargateProfile: eks.FargateProfile;
  public readonly appFargateProfile: eks.FargateProfile;

  constructor(scope: Construct, id: string, props: ComputeStackProps) {
    super(scope, id, props);

    const cluster = props.eksClusterStack.cluster;
    const nodeGroupRole = props.eksClusterStack.nodeGroupRole;
    const fargateRole = props.eksClusterStack.fargateRole;

    // Create Launch Template for managed node group with optimized settings
    const launchTemplate = new ec2.LaunchTemplate(this, 'NodeGroupLaunchTemplate', {
      launchTemplateName: `${cluster.clusterName}-node-template`,
      instanceType: new ec2.InstanceType(props.nodeInstanceType),
      machineImage: new ec2.AmazonLinuxImage({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
        cpuType: ec2.AmazonLinuxCpuType.X86_64,
      }),
      securityGroup: props.foundationStack.nodeSecurityGroup,
      
      // Enable IMDSv2 for enhanced security
      requireImdsv2: true,
      
      // User data for node customization
      userData: ec2.UserData.forLinux(),
      
      // Enable detailed monitoring
      detailedMonitoring: true,
      
      // Block device mappings for storage
      blockDevices: [
        {
          deviceName: '/dev/xvda',
          volume: ec2.BlockDeviceVolume.ebs(50, {
            volumeType: ec2.EbsDeviceVolumeType.GP3,
            encrypted: true,
            deleteOnTermination: true,
            kmsKey: props.foundationStack.kmsKey, // Use our KMS key for encryption
            iops: 3000, // Baseline IOPS for GP3
            throughput: 125, // Baseline throughput for GP3
          }),
        },
      ],
    });

    // Primary Managed Node Group for general workloads
    this.managedNodeGroup = cluster.addNodegroupCapacity('primary-managed-nodegroup', {
      nodegroupName: `${cluster.clusterName}-primary-nodes`,
      
      // Instance configuration
      instanceTypes: [new ec2.InstanceType(props.nodeInstanceType)],
      
      // Scaling configuration
      minSize: props.minNodes,
      maxSize: props.maxNodes,
      desiredSize: props.desiredNodes,
      
      // Use private subnets only
      subnets: { subnets: props.foundationStack.privateSubnets },
      
      // Launch template removed to avoid circular dependency
      // Storage, security, and monitoring settings are handled by node group defaults
      
      // Use foundation stack role
      nodeRole: nodeGroupRole,
      
      // AMI and capacity settings
      amiType: eks.NodegroupAmiType.AL2_X86_64,
      capacityType: eks.CapacityType.ON_DEMAND,
      
      // Storage configuration
      diskSize: 50,
      
      // Update configuration for rolling updates (removed as not supported in current CDK version)
      
      // Labels for workload scheduling
      labels: {
        'node-type': 'managed',
        'workload-type': 'general',
        'environment': props.environment,
      },
      
      // Taints for specialized workloads (none for general purpose)
      taints: [],
      
      // Tags for cluster autoscaler (simplified to avoid token resolution issues)
      tags: {
        'k8s.io/cluster-autoscaler/enabled': 'true',
        'k8s.io/cluster-autoscaler/node-template/label/node-type': 'managed',
        'k8s.io/cluster-autoscaler/node-template/label/workload-type': 'general',
      },
    });

    // Optional: Spot Instance Node Group for cost optimization
    const spotNodeGroup = cluster.addNodegroupCapacity('spot-managed-nodegroup', {
      nodegroupName: `${cluster.clusterName}-spot-nodes`,
      
      // Instance configuration - mix of instance types for spot diversity
      instanceTypes: [
        new ec2.InstanceType('m5.large'),
        new ec2.InstanceType('m5.xlarge'),
        new ec2.InstanceType('m4.large'),
        new ec2.InstanceType('m4.xlarge'),
      ],
      
      // Scaling configuration (more aggressive for spot)
      minSize: 0,
      maxSize: props.maxNodes * 2,
      desiredSize: Math.floor(props.desiredNodes / 2),
      
      // Use private subnets only
      subnets: { subnets: props.foundationStack.privateSubnets },
      
      // Use foundation stack role
      nodeRole: nodeGroupRole,
      
      // Spot instances for cost savings
      amiType: eks.NodegroupAmiType.AL2_X86_64,
      capacityType: eks.CapacityType.SPOT,
      
      // Storage configuration
      diskSize: 50,
      
      // Update configuration (removed as not supported in current CDK version)
      
      // Labels and taints for spot workloads
      labels: {
        'node-type': 'managed',
        'workload-type': 'spot',
        'instance-lifecycle': 'spot',
        'environment': props.environment,
      },
      
      // Taint spot nodes so only tolerant workloads run on them
      taints: [
        {
          key: 'spot-instance',
          value: 'true',
          effect: eks.TaintEffect.NO_SCHEDULE,
        },
      ],
      
      // Tags for cluster autoscaler (simplified to avoid token resolution issues)
      tags: {
        'k8s.io/cluster-autoscaler/enabled': 'true',
        'k8s.io/cluster-autoscaler/node-template/label/node-type': 'managed',
        'k8s.io/cluster-autoscaler/node-template/label/workload-type': 'spot',
        'k8s.io/cluster-autoscaler/node-template/taint/spot-instance': 'true:NoSchedule',
      },
    });

    // Fargate Profile for system workloads (kube-system, aws-load-balancer-controller, etc.)
    this.systemFargateProfile = cluster.addFargateProfile('system-fargate-profile', {
      fargateProfileName: `${cluster.clusterName}-system-fargate`,
      selectors: [
        { 
          namespace: 'kube-system',
          labels: {
            'compute-type': 'fargate',
          },
        },
        { 
          namespace: 'aws-load-balancer-controller',
        },
        {
          namespace: 'system',
        },
      ],
      podExecutionRole: fargateRole,
    });

    // Fargate Profile for application workloads
    this.appFargateProfile = cluster.addFargateProfile('app-fargate-profile', {
      fargateProfileName: `${cluster.clusterName}-app-fargate`,
      selectors: [
        { 
          namespace: 'default',
          labels: {
            'compute-type': 'fargate',
          },
        },
        // { 
        //   namespace: 'applications',
        //   labels: {
        //     'compute-type': 'fargate',
        //   },
        // },
      ],
      podExecutionRole: fargateRole,
    });

    // Outputs
    new cdk.CfnOutput(this, 'PrimaryNodeGroupName', {
      value: this.managedNodeGroup.nodegroupName,
      description: 'Primary Managed Node Group Name',
    });

    new cdk.CfnOutput(this, 'SpotNodeGroupName', {
      value: spotNodeGroup.nodegroupName,
      description: 'Spot Managed Node Group Name',
    });

    new cdk.CfnOutput(this, 'SystemFargateProfileName', {
      value: this.systemFargateProfile.fargateProfileName,
      description: 'System Fargate Profile Name',
    });

    new cdk.CfnOutput(this, 'AppFargateProfileName', {
      value: this.appFargateProfile.fargateProfileName,
      description: 'Application Fargate Profile Name',
    });

    // Tags
    cdk.Tags.of(this).add('Environment', props.environment);
    cdk.Tags.of(this).add('Project', props.projectName);
    cdk.Tags.of(this).add('Stack', 'Compute');
  }
}
