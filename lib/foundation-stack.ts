import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

export interface FoundationStackProps extends cdk.StackProps {
  clusterName: string;
  environment: string;
  projectName: string;
  createNewVpc: boolean;
  vpcId?: string;
  vpcCidr?: string;
  publicSubnets?: Array<{
    cidr: string;
    availabilityZone: string;
    name: string;
  }>;
  privateSubnets: Array<{
    cidr: string;
    availabilityZone: string;
    name: string;
  }>;
}

export class FoundationStack extends cdk.Stack {
  public readonly clusterRole: iam.Role;
  public readonly kmsKey: kms.Key;
  public readonly clusterSecurityGroup: ec2.SecurityGroup;
  public readonly nodeSecurityGroup: ec2.SecurityGroup;
  public readonly vpc: ec2.IVpc;
  public readonly privateSubnets: ec2.ISubnet[];
  public readonly publicSubnets?: ec2.ISubnet[];
  public readonly natGateway?: ec2.CfnNatGateway;

  constructor(scope: Construct, id: string, props: FoundationStackProps) {
    super(scope, id, props);

    if (props.createNewVpc) {
      // Create new VPC
      if (!props.vpcCidr) {
        throw new Error('vpcCidr is required when createNewVpc is true');
      }
      if (!props.publicSubnets) {
        throw new Error('publicSubnets configuration is required when createNewVpc is true');
      }

      // Create VPC
      const newVpc = new ec2.CfnVPC(this, 'SatsPortalsVpc', {
        cidrBlock: props.vpcCidr,
        enableDnsHostnames: true,
        enableDnsSupport: true,
        tags: [
          {
            key: 'Name',
            value: `${props.clusterName}-vpc`,
          },
        ],
      });

      // We'll reference the VPC directly using the VPC ID after subnets are created
      const vpcId = newVpc.ref;

      // Create Internet Gateway
      const igw = new ec2.CfnInternetGateway(this, 'InternetGateway', {
        tags: [
          {
            key: 'Name',
            value: `${props.clusterName}-igw`,
          },
        ],
      });

      new ec2.CfnVPCGatewayAttachment(this, 'VpcGatewayAttachment', {
        vpcId: newVpc.ref,
        internetGatewayId: igw.ref,
      });

      // Create public subnets
      this.publicSubnets = props.publicSubnets.map((subnetConfig, index) => {
        const subnet = new ec2.CfnSubnet(this, `PublicSubnet${index + 1}`, {
          vpcId: vpcId,
          cidrBlock: subnetConfig.cidr,
          availabilityZone: subnetConfig.availabilityZone,
          mapPublicIpOnLaunch: true,
          tags: [
            {
              key: 'Name',
              value: subnetConfig.name,
            },
            {
              key: 'kubernetes.io/role/elb',
              value: '1',
            },
          ],
        });

        // Create route table for public subnet
        const routeTable = new ec2.CfnRouteTable(this, `PublicRouteTable${index + 1}`, {
          vpcId: vpcId,
          tags: [
            {
              key: 'Name',
              value: `${subnetConfig.name}-rt`,
            },
          ],
        });

        // Associate route table with subnet
        new ec2.CfnSubnetRouteTableAssociation(this, `PublicSubnetRouteTableAssoc${index + 1}`, {
          subnetId: subnet.ref,
          routeTableId: routeTable.ref,
        });

        // Add route to Internet Gateway
        new ec2.CfnRoute(this, `PublicRoute${index + 1}`, {
          routeTableId: routeTable.ref,
          destinationCidrBlock: '0.0.0.0/0',
          gatewayId: igw.ref,
        });

        return ec2.Subnet.fromSubnetAttributes(this, `PublicSubnetRef${index + 1}`, {
          subnetId: subnet.ref,
          availabilityZone: subnetConfig.availabilityZone,
          routeTableId: routeTable.ref,
        });
      });

      // Create Elastic IP for NAT Gateway
      const eip = new ec2.CfnEIP(this, 'NatGatewayEIP', {
        domain: 'vpc',
        tags: [
          {
            key: 'Name',
            value: `${props.clusterName}-nat-eip`,
          },
        ],
      });

      // Create NAT Gateway in first public subnet
      this.natGateway = new ec2.CfnNatGateway(this, 'NatGateway', {
        allocationId: eip.attrAllocationId,
        subnetId: this.publicSubnets[0].subnetId,
        tags: [
          {
            key: 'Name',
            value: `${props.clusterName}-nat-gateway`,
          },
        ],
      });

      // Create private subnets
      this.privateSubnets = props.privateSubnets.map((subnetConfig, index) => {
        const subnet = new ec2.CfnSubnet(this, `PrivateSubnet${index + 1}`, {
          vpcId: vpcId,
          cidrBlock: subnetConfig.cidr,
          availabilityZone: subnetConfig.availabilityZone,
          tags: [
            {
              key: 'Name',
              value: subnetConfig.name,
            },
            {
              key: 'kubernetes.io/role/internal-elb',
              value: '1',
            },
          ],
        });

        // Create route table for private subnet
        const routeTable = new ec2.CfnRouteTable(this, `PrivateRouteTable${index + 1}`, {
          vpcId: vpcId,
          tags: [
            {
              key: 'Name',
              value: `${subnetConfig.name}-rt`,
            },
          ],
        });

        // Associate route table with subnet
        new ec2.CfnSubnetRouteTableAssociation(this, `PrivateSubnetRouteTableAssoc${index + 1}`, {
          subnetId: subnet.ref,
          routeTableId: routeTable.ref,
        });

        // Add route to NAT Gateway
        new ec2.CfnRoute(this, `PrivateRoute${index + 1}`, {
          routeTableId: routeTable.ref,
          destinationCidrBlock: '0.0.0.0/0',
          natGatewayId: this.natGateway!.ref,
        });

        return ec2.Subnet.fromSubnetAttributes(this, `PrivateSubnetRef${index + 1}`, {
          subnetId: subnet.ref,
          availabilityZone: subnetConfig.availabilityZone,
          routeTableId: routeTable.ref,
        });
      });

      // Create VPC reference after all subnets are created
      this.vpc = ec2.Vpc.fromVpcAttributes(this, 'VpcRef', {
        vpcId: vpcId,
        vpcCidrBlock: props.vpcCidr!,
        availabilityZones: [...new Set(props.publicSubnets.map(s => s.availabilityZone))],
        publicSubnetIds: this.publicSubnets.map(s => s.subnetId),
        privateSubnetIds: this.privateSubnets.map(s => s.subnetId),
      });
    } else {
      // Use existing VPC
      if (!props.vpcId) {
        throw new Error('vpcId is required when createNewVpc is false');
      }

      this.vpc = ec2.Vpc.fromLookup(this, 'ExistingVpc', {
        vpcId: props.vpcId,
      });

      // Create an Elastic IP for the NAT Gateway
      const eip = new ec2.CfnEIP(this, 'NatGatewayEIP', {
        domain: 'vpc',
        tags: [
          {
            key: 'Name',
            value: `${props.clusterName}-nat-eip`,
          },
        ],
      });

      // Get the first public subnet from the VPC for NAT Gateway
      const existingPublicSubnets = this.vpc.publicSubnets;
      if (existingPublicSubnets.length === 0) {
        throw new Error('No public subnets found in existing VPC for NAT Gateway');
      }

      // Create NAT Gateway in the first public subnet
      this.natGateway = new ec2.CfnNatGateway(this, 'NatGateway', {
        allocationId: eip.attrAllocationId,
        subnetId: existingPublicSubnets[0].subnetId,
        tags: [
          {
            key: 'Name',
            value: `${props.clusterName}-nat-gateway`,
          },
        ],
      });

      // Create private subnets in existing VPC
      this.privateSubnets = props.privateSubnets.map((subnetConfig, index) => {
        const subnet = new ec2.CfnSubnet(this, `PrivateSubnet${index + 1}`, {
          vpcId: this.vpc.vpcId,
          cidrBlock: subnetConfig.cidr,
          availabilityZone: subnetConfig.availabilityZone,
          tags: [
            {
              key: 'Name',
              value: subnetConfig.name,
            },
            {
              key: 'kubernetes.io/role/internal-elb',
              value: '1',
            },
          ],
        });

        // Create route table for the private subnet
        const routeTable = new ec2.CfnRouteTable(this, `PrivateRouteTable${index + 1}`, {
          vpcId: this.vpc.vpcId,
          tags: [
            {
              key: 'Name',
              value: `${subnetConfig.name}-rt`,
            },
          ],
        });

        // Associate the route table with the subnet
        new ec2.CfnSubnetRouteTableAssociation(this, `PrivateSubnetRouteTableAssoc${index + 1}`, {
          subnetId: subnet.ref,
          routeTableId: routeTable.ref,
        });

        // Add route to NAT Gateway for internet access
        new ec2.CfnRoute(this, `PrivateRoute${index + 1}`, {
          routeTableId: routeTable.ref,
          destinationCidrBlock: '0.0.0.0/0',
          natGatewayId: this.natGateway!.ref,
        });

        // Return the subnet as ISubnet
        return ec2.Subnet.fromSubnetAttributes(this, `PrivateSubnetRef${index + 1}`, {
          subnetId: subnet.ref,
          availabilityZone: subnetConfig.availabilityZone,
          routeTableId: routeTable.ref,
        });
      });
    }

    // KMS Key for EKS cluster encryption
    this.kmsKey = new kms.Key(this, 'EksKmsKey', {
      alias: `${props.clusterName}-eks-key`,
      description: `KMS key for ${props.clusterName} EKS cluster encryption`,
      enableKeyRotation: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN, // Production: Keep keys for data recovery
      keySpec: kms.KeySpec.SYMMETRIC_DEFAULT,
      keyUsage: kms.KeyUsage.ENCRYPT_DECRYPT,
    });

    // Grant administrators full access to the KMS key
    this.kmsKey.addToResourcePolicy(new iam.PolicyStatement({
      sid: 'AllowAdministrators',
      principals: [new iam.AccountRootPrincipal()],
      actions: ['kms:*'],
      resources: ['*'],
    }));

    // Grant EKS service access to the KMS key
    this.kmsKey.addToResourcePolicy(new iam.PolicyStatement({
      sid: 'AllowEKSAccess',
      principals: [new iam.ServicePrincipal('eks.amazonaws.com')],
      actions: [
        'kms:Decrypt',
        'kms:DescribeKey',
        'kms:GenerateDataKey',
        'kms:CreateGrant',
        'kms:DescribeKey',
      ],
      resources: ['*'],
    }));

    // Grant CloudWatch Logs service access to the KMS key
    this.kmsKey.addToResourcePolicy(new iam.PolicyStatement({
      sid: 'AllowCloudWatchLogsAccess',
      principals: [new iam.ServicePrincipal(`logs.${this.region}.amazonaws.com`)],
      actions: [
        'kms:Encrypt',
        'kms:Decrypt',
        'kms:ReEncrypt*',
        'kms:GenerateDataKey*',
        'kms:DescribeKey',
      ],
      resources: ['*'],
    }));

    // EKS Cluster Service Role
    this.clusterRole = new iam.Role(this, 'EksClusterRole', {
      roleName: `${props.clusterName}-cluster-role`,
      assumedBy: new iam.ServicePrincipal('eks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKSClusterPolicy'),
      ],
    });

    // EKS Node Group Role (removed to avoid circular dependency)
    // Will be created in cluster stack if needed

    // Node group role and Fargate role will be created in cluster stack to avoid circular dependency

    // Security Group for EKS Cluster Control Plane
    this.clusterSecurityGroup = new ec2.SecurityGroup(this, 'EksClusterSecurityGroup', {
      vpc: this.vpc,
      description: `Security group for ${props.clusterName} EKS cluster control plane`,
      allowAllOutbound: true,
    });

    // Security Group for EKS Node Groups
    this.nodeSecurityGroup = new ec2.SecurityGroup(this, 'EksNodeSecurityGroup', {
      vpc: this.vpc,
      description: `Security group for ${props.clusterName} EKS node groups`,
      allowAllOutbound: true,
    });

    // Allow HTTPS traffic from VPC CIDR to cluster
    this.clusterSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(this.vpc.vpcCidrBlock),
      ec2.Port.tcp(443),
      'Allow HTTPS from VPC to EKS API server'
    );

    // Allow cluster to communicate with nodes
    this.nodeSecurityGroup.addIngressRule(
      this.clusterSecurityGroup,
      ec2.Port.allTcp(),
      'Allow cluster control plane to communicate with nodes'
    );

    // Allow nodes to communicate with cluster
    this.clusterSecurityGroup.addIngressRule(
      this.nodeSecurityGroup,
      ec2.Port.tcp(443),
      'Allow nodes to communicate with cluster API server'
    );

    // Allow node-to-node communication
    this.nodeSecurityGroup.addIngressRule(
      this.nodeSecurityGroup,
      ec2.Port.allTcp(),
      'Allow node-to-node communication'
    );

    // Allow pods to communicate with each other
    this.nodeSecurityGroup.addIngressRule(
      this.nodeSecurityGroup,
      ec2.Port.tcpRange(1025, 65535),
      'Allow pod-to-pod communication'
    );

    // Outputs
    new cdk.CfnOutput(this, 'ClusterRoleArn', {
      value: this.clusterRole.roleArn,
      description: 'EKS Cluster Role ARN',
    });

    // Node group role output removed - will be in cluster stack

    new cdk.CfnOutput(this, 'KmsKeyId', {
      value: this.kmsKey.keyId,
      description: 'KMS Key ID for EKS encryption',
    });

    // Tags
    cdk.Tags.of(this).add('Environment', props.environment);
    cdk.Tags.of(this).add('Project', props.projectName);
    cdk.Tags.of(this).add('Stack', 'Foundation');
  }
}
