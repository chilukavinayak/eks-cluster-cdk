import * as cdk from 'aws-cdk-lib';
import * as eks from 'aws-cdk-lib/aws-eks';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface NodeGroupsStackProps extends cdk.StackProps {
  cluster: eks.Cluster;
  vpc: ec2.Vpc;
  nodeGroupRole: iam.Role;
}

export class NodeGroupsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: NodeGroupsStackProps) {
    super(scope, id, props);

    const { cluster, vpc, nodeGroupRole } = props;

    // Primary Node Group (General purpose)
    const primaryNodeGroup = cluster.addNodegroupCapacity('PrimaryNodeGroup', {
      nodegroupName: 'primary-nodes',
      instanceTypes: [new ec2.InstanceType('m5.large')],
      minSize: 2,
      maxSize: 10,
      desiredSize: 3,
      diskSize: 50,
      amiType: eks.NodegroupAmiType.AL2_X86_64,
      capacityType: eks.CapacityType.ON_DEMAND,
      nodeRole: nodeGroupRole,
      subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      tags: {
        'kubernetes.io/cluster/production-eks-cluster': 'owned',
        'k8s.io/cluster-autoscaler/enabled': 'true',
        'k8s.io/cluster-autoscaler/production-eks-cluster': 'owned'
      },
      labels: {
        'node-type': 'primary',
        'instance-type': 'general-purpose'
      },
      taints: []
    });

    // Outputs
    new cdk.CfnOutput(this, 'NodeGroupStatus', {
      value: 'Primary node group created successfully',
      description: 'Node group deployment status'
    });
  }
}
