import * as cdk from 'aws-cdk-lib';
import * as eks from 'aws-cdk-lib/aws-eks';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface NodeGroupsStackProps extends cdk.StackProps {
  cluster: eks.Cluster;
  vpc: ec2.Vpc;
  nodeGroupRole: iam.Role;
  projectName: string;
  environmentName: string;
}

export class NodeGroupsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: NodeGroupsStackProps) {
    super(scope, id, props);

    const { cluster, vpc, nodeGroupRole, projectName, environmentName } = props;
    const clusterName = `${projectName}-${environmentName}-cluster`;

    // Production-Grade Node Groups Configuration
    
    // 1. System Node Group (Critical system workloads)
    const systemNodeGroup = cluster.addNodegroupCapacity('SystemNodeGroup', {
      nodegroupName: 'system-nodes',
      instanceTypes: [
        new ec2.InstanceType('m6i.large'),
        new ec2.InstanceType('m6i.xlarge'),
        new ec2.InstanceType('m5.large'),
        new ec2.InstanceType('m5.xlarge')
      ],
      minSize: 2,
      maxSize: 6,
      desiredSize: 3,
      diskSize: 100,
      amiType: eks.NodegroupAmiType.AL2_X86_64,
      capacityType: eks.CapacityType.ON_DEMAND,
      nodeRole: nodeGroupRole,
      subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      tags: {
        [`kubernetes.io/cluster/${clusterName}`]: 'owned',
        'k8s.io/cluster-autoscaler/enabled': 'true',
        [`k8s.io/cluster-autoscaler/${clusterName}`]: 'owned',
        'NodeGroupType': 'system',
        'Environment': environmentName
      },
      labels: {
        'node-type': 'system',
        'instance-category': 'system-critical',
        'workload-type': 'system'
      },
      taints: [
        {
          key: 'system-workload',
          value: 'true',
          effect: eks.TaintEffect.NO_SCHEDULE
        }
      ]
    });

    // 2. Application Node Group (General application workloads)
    const applicationNodeGroup = cluster.addNodegroupCapacity('ApplicationNodeGroup', {
      nodegroupName: 'application-nodes',
      instanceTypes: [
        new ec2.InstanceType('m6i.large'),
        new ec2.InstanceType('m6i.xlarge'),
        new ec2.InstanceType('m6i.2xlarge'),
        new ec2.InstanceType('c6i.large'),
        new ec2.InstanceType('c6i.xlarge')
      ],
      minSize: 3,
      maxSize: 20,
      desiredSize: 5,
      diskSize: 100,
      amiType: eks.NodegroupAmiType.AL2_X86_64,
      capacityType: eks.CapacityType.ON_DEMAND,
      nodeRole: nodeGroupRole,
      subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      tags: {
        [`kubernetes.io/cluster/${clusterName}`]: 'owned',
        'k8s.io/cluster-autoscaler/enabled': 'true',
        [`k8s.io/cluster-autoscaler/${clusterName}`]: 'owned',
        'NodeGroupType': 'application',
        'Environment': environmentName
      },
      labels: {
        'node-type': 'application',
        'instance-category': 'general-purpose',
        'workload-type': 'application'
      },
      taints: []
    });

    // 3. Spot Node Group (Cost-optimized workloads)
    const spotNodeGroup = cluster.addNodegroupCapacity('SpotNodeGroup', {
      nodegroupName: 'spot-nodes',
      instanceTypes: [
        new ec2.InstanceType('m6i.large'),
        new ec2.InstanceType('m6i.xlarge'),
        new ec2.InstanceType('m5.large'),
        new ec2.InstanceType('m5.xlarge'),
        new ec2.InstanceType('c6i.large'),
        new ec2.InstanceType('c6i.xlarge'),
        new ec2.InstanceType('c5.large'),
        new ec2.InstanceType('c5.xlarge')
      ],
      minSize: 0,
      maxSize: 50,
      desiredSize: 2,
      diskSize: 100,
      amiType: eks.NodegroupAmiType.AL2_X86_64,
      capacityType: eks.CapacityType.SPOT,
      nodeRole: nodeGroupRole,
      subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      tags: {
        [`kubernetes.io/cluster/${clusterName}`]: 'owned',
        'k8s.io/cluster-autoscaler/enabled': 'true',
        [`k8s.io/cluster-autoscaler/${clusterName}`]: 'owned',
        'NodeGroupType': 'spot',
        'Environment': environmentName
      },
      labels: {
        'node-type': 'spot',
        'instance-category': 'cost-optimized',
        'workload-type': 'batch-processing'
      },
      taints: [
        {
          key: 'spot-instance',
          value: 'true',
          effect: eks.TaintEffect.NO_SCHEDULE
        }
      ]
    });

    // 4. Memory-Optimized Node Group (For memory-intensive workloads)
    const memoryNodeGroup = cluster.addNodegroupCapacity('MemoryNodeGroup', {
      nodegroupName: 'memory-nodes',
      instanceTypes: [
        new ec2.InstanceType('r5.large'),      // Start with most available
        new ec2.InstanceType('r5.xlarge'),
        new ec2.InstanceType('r6i.large'),
        new ec2.InstanceType('r6i.xlarge'),
        new ec2.InstanceType('r6i.2xlarge')
      ],
      minSize: 0,
      maxSize: 10,
      desiredSize: 0,  // Start with 0 to avoid initial capacity issues
      diskSize: 100,
      amiType: eks.NodegroupAmiType.AL2_X86_64,
      capacityType: eks.CapacityType.ON_DEMAND,
      nodeRole: nodeGroupRole,
      subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      tags: {
        [`kubernetes.io/cluster/${clusterName}`]: 'owned',
        'k8s.io/cluster-autoscaler/enabled': 'true',
        [`k8s.io/cluster-autoscaler/${clusterName}`]: 'owned',
        'NodeGroupType': 'memory-optimized',
        'Environment': environmentName
      },
      labels: {
        'node-type': 'memory-optimized',
        'instance-category': 'memory-intensive',
        'workload-type': 'database'
      },
      taints: [
        {
          key: 'memory-optimized',
          value: 'true',
          effect: eks.TaintEffect.NO_SCHEDULE
        }
      ]
    });

    // Outputs
    new cdk.CfnOutput(this, 'SystemNodeGroupStatus', {
      value: `System node group created: ${systemNodeGroup.nodegroupName}`,
      description: 'System node group deployment status'
    });

    new cdk.CfnOutput(this, 'ApplicationNodeGroupStatus', {
      value: `Application node group created: ${applicationNodeGroup.nodegroupName}`,
      description: 'Application node group deployment status'
    });

    new cdk.CfnOutput(this, 'SpotNodeGroupStatus', {
      value: `Spot node group created: ${spotNodeGroup.nodegroupName}`,
      description: 'Spot node group deployment status'
    });

    new cdk.CfnOutput(this, 'MemoryNodeGroupStatus', {
      value: `Memory node group created: ${memoryNodeGroup.nodegroupName}`,
      description: 'Memory node group deployment status'
    });
  }
}
