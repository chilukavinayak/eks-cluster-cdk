import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

export class VpcStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc;

  constructor(scope: Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props);

    // Create VPC with public and private subnets across 3 AZs
    this.vpc = new ec2.Vpc(this, 'EksVpc', {
      maxAzs: 3,
      cidr: '10.0.0.0/16',
      enableDnsHostnames: true,
      enableDnsSupport: true,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
          mapPublicIpOnLaunch: true
        },
        {
          cidrMask: 24,
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS
        },
        {
          cidrMask: 28,
          name: 'Database',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED
        }
      ],
      natGateways: 3, // One NAT Gateway per AZ for high availability
      gatewayEndpoints: {
        S3: {
          service: ec2.GatewayVpcEndpointAwsService.S3
        },
        DynamoDB: {
          service: ec2.GatewayVpcEndpointAwsService.DYNAMODB
        }
      }
    });

    // VPC Endpoints for AWS services to reduce NAT Gateway costs
    new ec2.InterfaceVpcEndpoint(this, 'EcrApiEndpoint', {
      vpc: this.vpc,
      service: ec2.InterfaceVpcEndpointAwsService.ECR,
      subnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS
      }
    });

    new ec2.InterfaceVpcEndpoint(this, 'EcrDkrEndpoint', {
      vpc: this.vpc,
      service: ec2.InterfaceVpcEndpointAwsService.ECR_DOCKER,
      subnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS
      }
    });

    new ec2.InterfaceVpcEndpoint(this, 'CloudWatchLogsEndpoint', {
      vpc: this.vpc,
      service: ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
      subnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS
      }
    });

    new ec2.InterfaceVpcEndpoint(this, 'SsmEndpoint', {
      vpc: this.vpc,
      service: ec2.InterfaceVpcEndpointAwsService.SSM,
      subnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS
      }
    });

    new ec2.InterfaceVpcEndpoint(this, 'SecretsManagerEndpoint', {
      vpc: this.vpc,
      service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
      subnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS
      }
    });

    // Flow logs for VPC monitoring
    new ec2.FlowLog(this, 'VpcFlowLog', {
      resourceType: ec2.FlowLogResourceType.fromVpc(this.vpc),
      destination: ec2.FlowLogDestination.toCloudWatchLogs(),
      trafficType: ec2.FlowLogTrafficType.ALL
    });

    // Store VPC ID in SSM for reference
    new ssm.StringParameter(this, 'VpcIdParameter', {
      parameterName: '/eks/vpc-id',
      stringValue: this.vpc.vpcId,
      description: 'VPC ID for EKS cluster'
    });

    // Store subnet IDs in SSM
    new ssm.StringListParameter(this, 'PrivateSubnetIds', {
      parameterName: '/eks/private-subnet-ids',
      stringListValue: this.vpc.privateSubnets.map(subnet => subnet.subnetId),
      description: 'Private subnet IDs for EKS cluster'
    });

    new ssm.StringListParameter(this, 'PublicSubnetIds', {
      parameterName: '/eks/public-subnet-ids',
      stringListValue: this.vpc.publicSubnets.map(subnet => subnet.subnetId),
      description: 'Public subnet IDs for EKS cluster'
    });

    // Output VPC information
    new cdk.CfnOutput(this, 'VpcId', {
      value: this.vpc.vpcId,
      description: 'VPC ID'
    });

    new cdk.CfnOutput(this, 'PrivateSubnets', {
      value: this.vpc.privateSubnets.map(subnet => subnet.subnetId).join(','),
      description: 'Private subnet IDs'
    });

    new cdk.CfnOutput(this, 'PublicSubnets', {
      value: this.vpc.publicSubnets.map(subnet => subnet.subnetId).join(','),
      description: 'Public subnet IDs'
    });
  }
}
