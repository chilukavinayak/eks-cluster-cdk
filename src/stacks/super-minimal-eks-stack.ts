import * as cdk from 'aws-cdk-lib';
import * as eks from 'aws-cdk-lib/aws-eks';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface SuperMinimalEksStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  clusterRole: iam.Role;
}

export class SuperMinimalEksStack extends cdk.Stack {
  public readonly clusterName: string;
  public readonly clusterEndpoint: string;
  public readonly clusterArn: string;

  constructor(scope: Construct, id: string, props: SuperMinimalEksStackProps) {
    super(scope, id, props);

    this.clusterName = 'production-eks-cluster';

    // Just the security group
    const clusterSecurityGroup = new ec2.SecurityGroup(this, 'ClusterSG', {
      vpc: props.vpc,
      description: 'EKS cluster security group',
      allowAllOutbound: true
    });

    clusterSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'HTTPS API access'
    );

    // RAW CloudFormation EKS cluster - no CDK magic
    const rawCluster = new eks.CfnCluster(this, 'RawEksCluster', {
      name: this.clusterName,
      version: '1.28',
      roleArn: props.clusterRole.roleArn,
      resourcesVpcConfig: {
        subnetIds: props.vpc.selectSubnets({
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS
        }).subnetIds,
        securityGroupIds: [clusterSecurityGroup.securityGroupId]
      },
      // Minimal logging
      logging: {
        clusterLogging: {
          enabledTypes: [
            { type: 'api' },
            { type: 'audit' }
          ]
        }
      }
    });

    // Store the values
    this.clusterArn = rawCluster.attrArn;
    this.clusterEndpoint = rawCluster.attrEndpoint;

    // Simple outputs
    new cdk.CfnOutput(this, 'ClusterName', {
      value: this.clusterName,
      description: 'EKS cluster name'
    });

    new cdk.CfnOutput(this, 'ClusterEndpoint', {
      value: this.clusterEndpoint,
      description: 'EKS cluster endpoint'
    });

    new cdk.CfnOutput(this, 'ConfigCommand', {
      value: `aws eks update-kubeconfig --region ${this.region} --name ${this.clusterName}`,
      description: 'Command to configure kubectl'
    });
  }
}
