import * as cdk from 'aws-cdk-lib';
import * as eks from 'aws-cdk-lib/aws-eks';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { KubectlV28Layer } from '@aws-cdk/lambda-layer-kubectl-v28';

export interface EksClusterStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  clusterRole: iam.Role;
}

export class EksClusterStack extends cdk.Stack {
  public readonly cluster: eks.Cluster;

  constructor(scope: Construct, id: string, props: EksClusterStackProps) {
    super(scope, id, props);

    // KMS key for EKS cluster encryption
    const clusterKmsKey = new kms.Key(this, 'EksClusterKmsKey', {
      description: 'KMS key for EKS cluster encryption',
      enableKeyRotation: true,
      policy: new iam.PolicyDocument({
        statements: [
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            principals: [new iam.AccountRootPrincipal()],
            actions: ['kms:*'],
            resources: ['*']
          }),
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            principals: [new iam.ServicePrincipal('eks.amazonaws.com')],
            actions: [
              'kms:Decrypt',
              'kms:DescribeKey'
            ],
            resources: ['*']
          })
        ]
      })
    });

    // CloudWatch Log Group for EKS cluster logs
    const clusterLogGroup = new logs.LogGroup(this, 'EksClusterLogGroup', {
      logGroupName: '/aws/eks/cluster/logs',
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    // Security group for EKS cluster
    const clusterSecurityGroup = new ec2.SecurityGroup(this, 'EksClusterSecurityGroup', {
      vpc: props.vpc,
      description: 'Security group for EKS cluster',
      allowAllOutbound: true
    });

    // Allow HTTPS from anywhere for API server
    clusterSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'Allow HTTPS from anywhere'
    );

    // Ultra-minimal EKS Cluster - disable ALL automatic resource creation
    this.cluster = new eks.Cluster(this, 'EksCluster', {
      clusterName: 'production-eks-cluster',
      version: eks.KubernetesVersion.V1_28,
      vpc: props.vpc,
      vpcSubnets: [{ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }],
      role: props.clusterRole,
      securityGroup: clusterSecurityGroup,
      endpointAccess: eks.EndpointAccess.PUBLIC_AND_PRIVATE.onlyFrom(
        '0.0.0.0/0'  // Restrict this to your IP ranges in production
      ),
      // Disable ALL logging to avoid automatic resource creation
      // clusterLogging: [],
      secretsEncryptionKey: clusterKmsKey,
      kubectlLayer: new KubectlV28Layer(this, 'KubectlLayer'),
      outputClusterName: false,  // Disable to avoid kubectl resources
      outputConfigCommand: false,  // Disable to avoid kubectl resources
      outputMastersRoleArn: false,  // Disable to avoid kubectl resources
      defaultCapacity: 0,  // Disable default capacity
      defaultCapacityType: eks.DefaultCapacityType.NODEGROUP,
      prune: false,  // Disable automatic resource pruning
      authenticationMode: eks.AuthenticationMode.API,  // Use API mode to avoid AwsAuth ConfigMap
      coreDnsComputeType: eks.CoreDnsComputeType.FARGATE,  // Use Fargate to avoid node dependencies
      tags: {
        Environment: 'production',
        Project: 'eks-cluster'
      }
    });

    // Create managed node groups
    const nodeGroupSecurityGroup = new ec2.SecurityGroup(this, 'NodeGroupSecurityGroup', {
      vpc: props.vpc,
      description: 'Security group for EKS node group',
      allowAllOutbound: true
    });

    // Allow communication between nodes
    nodeGroupSecurityGroup.addIngressRule(
      nodeGroupSecurityGroup,
      ec2.Port.allTraffic(),
      'Allow all traffic from same security group'
    );

    // Allow cluster to communicate with nodes
    nodeGroupSecurityGroup.addIngressRule(
      clusterSecurityGroup,
      ec2.Port.allTraffic(),
      'Allow cluster to communicate with nodes'
    );

    // Note: Node groups commented out to avoid rate limiting during initial cluster creation
    // Uncomment and deploy after cluster is successfully created
    /*
    // Primary Node Group (General purpose) - Start with just one node group
    const primaryNodeGroup = this.cluster.addNodegroupCapacity('PrimaryNodeGroup', {
      nodegroupName: 'primary-nodes',
      instanceTypes: [new ec2.InstanceType('m5.large')],
      minSize: 2,
      maxSize: 10,
      desiredSize: 3,
      diskSize: 50,
      amiType: eks.NodegroupAmiType.AL2_X86_64,
      capacityType: eks.CapacityType.ON_DEMAND,

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
    */

    // Additional node groups commented out to avoid rate limiting during initial deployment
    // Uncomment and redeploy after initial cluster creation is complete
    
    /*
    // Spot Node Group (Cost-optimized)
    const spotNodeGroup = this.cluster.addNodegroupCapacity('SpotNodeGroup', {
      nodegroupName: 'spot-nodes',
      instanceTypes: [
        new ec2.InstanceType('m5.large'),
        new ec2.InstanceType('m5.xlarge'),
        new ec2.InstanceType('m4.large'),
        new ec2.InstanceType('m4.xlarge')
      ],
      minSize: 1,
      maxSize: 20,
      desiredSize: 3,
      diskSize: 50,
      amiType: eks.NodegroupAmiType.AL2_X86_64,
      capacityType: eks.CapacityType.SPOT,

      subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      tags: {
        'kubernetes.io/cluster/production-eks-cluster': 'owned',
        'k8s.io/cluster-autoscaler/enabled': 'true',
        'k8s.io/cluster-autoscaler/production-eks-cluster': 'owned'
      },
      labels: {
        'node-type': 'spot',
        'instance-type': 'cost-optimized'
      },
      taints: [
        {
          key: 'spot-instance',
          value: 'true',
          effect: eks.TaintEffect.NO_SCHEDULE
        }
      ]
    });

    // Add EBS CSI Driver
    this.cluster.addNodegroupCapacity('EbsCsiNodeGroup', {
      nodegroupName: 'ebs-csi-nodes',
      instanceTypes: [new ec2.InstanceType('m5.large')],
      minSize: 1,
      maxSize: 3,
      desiredSize: 1,
      diskSize: 50,
      amiType: eks.NodegroupAmiType.AL2_X86_64,
      capacityType: eks.CapacityType.ON_DEMAND,

      subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      labels: {
        'node-type': 'ebs-csi',
        'instance-type': 'storage'
      }
    });
    */

    // Create OIDC Provider for service account integration
    const oidcProvider = this.cluster.openIdConnectProvider;
    
    // Note: OIDC trust policies moved to separate stack to avoid token resolution issues

    // Store cluster information in SSM
    new ssm.StringParameter(this, 'ClusterName', {
      parameterName: '/eks/cluster-name',
      stringValue: this.cluster.clusterName,
      description: 'EKS cluster name'
    });

    new ssm.StringParameter(this, 'ClusterEndpoint', {
      parameterName: '/eks/cluster-endpoint',
      stringValue: this.cluster.clusterEndpoint,
      description: 'EKS cluster endpoint'
    });

    new ssm.StringParameter(this, 'OidcIssuerUrl', {
      parameterName: '/eks/oidc-issuer-url',
      stringValue: this.cluster.clusterOpenIdConnectIssuerUrl,
      description: 'EKS cluster OIDC issuer URL'
    });

    new ssm.StringParameter(this, 'ClusterSecurityGroupId', {
      parameterName: '/eks/cluster-security-group-id',
      stringValue: this.cluster.clusterSecurityGroupId,
      description: 'EKS cluster security group ID'
    });

    // Outputs
    new cdk.CfnOutput(this, 'ClusterNameOutput', {
      value: this.cluster.clusterName,
      description: 'EKS cluster name'
    });

    new cdk.CfnOutput(this, 'ClusterEndpointOutput', {
      value: this.cluster.clusterEndpoint,
      description: 'EKS cluster endpoint'
    });

    new cdk.CfnOutput(this, 'ClusterArn', {
      value: this.cluster.clusterArn,
      description: 'EKS cluster ARN'
    });

    new cdk.CfnOutput(this, 'OidcIssuerUrlOutput', {
      value: this.cluster.clusterOpenIdConnectIssuerUrl,
      description: 'EKS cluster OIDC issuer URL'
    });

    new cdk.CfnOutput(this, 'ConfigCommand', {
      value: `aws eks update-kubeconfig --region ${this.region} --name ${this.cluster.clusterName}`,
      description: 'Command to configure kubectl'
    });
  }

  // Commented out due to token resolution issues - moved to separate stack
  /*private updateServiceAccountRoles(oidcProvider: iam.IOpenIdConnectProvider) {
    // Import existing roles and update their trust policies
    const albControllerRole = iam.Role.fromRoleName(this, 'ImportedAlbControllerRole', 'AlbControllerRole');
    const ebsDriverRole = iam.Role.fromRoleName(this, 'ImportedEbsDriverRole', 'EbsDriverRole');
    const efsDriverRole = iam.Role.fromRoleName(this, 'ImportedEfsDriverRole', 'EfsDriverRole');
    const clusterAutoScalerRole = iam.Role.fromRoleName(this, 'ImportedClusterAutoScalerRole', 'ClusterAutoScalerRole');

    // Update ALB Controller Role trust policy
    (albControllerRole as iam.Role).assumeRolePolicy?.addStatements(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        principals: [new iam.FederatedPrincipal(oidcProvider.openIdConnectProviderArn, {
          StringEquals: {
            [`${oidcProvider.openIdConnectProviderIssuer}:sub`]: 'system:serviceaccount:kube-system:aws-load-balancer-controller',
            [`${oidcProvider.openIdConnectProviderIssuer}:aud`]: 'sts.amazonaws.com'
          }
        }, 'sts:AssumeRoleWithWebIdentity')],
        actions: ['sts:AssumeRoleWithWebIdentity']
      })
    );

    // Update EBS CSI Driver Role trust policy
    (ebsDriverRole as iam.Role).assumeRolePolicy?.addStatements(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        principals: [new iam.FederatedPrincipal(oidcProvider.openIdConnectProviderArn, {
          StringEquals: {
            [`${oidcProvider.openIdConnectProviderIssuer}:sub`]: 'system:serviceaccount:kube-system:ebs-csi-controller-sa',
            [`${oidcProvider.openIdConnectProviderIssuer}:aud`]: 'sts.amazonaws.com'
          }
        }, 'sts:AssumeRoleWithWebIdentity')],
        actions: ['sts:AssumeRoleWithWebIdentity']
      })
    );

    // Update EFS CSI Driver Role trust policy
    (efsDriverRole as iam.Role).assumeRolePolicy?.addStatements(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        principals: [new iam.FederatedPrincipal(oidcProvider.openIdConnectProviderArn, {
          StringEquals: {
            [`${oidcProvider.openIdConnectProviderIssuer}:sub`]: 'system:serviceaccount:kube-system:efs-csi-controller-sa',
            [`${oidcProvider.openIdConnectProviderIssuer}:aud`]: 'sts.amazonaws.com'
          }
        }, 'sts:AssumeRoleWithWebIdentity')],
        actions: ['sts:AssumeRoleWithWebIdentity']
      })
    );

    // Update Cluster Autoscaler Role trust policy
    (clusterAutoScalerRole as iam.Role).assumeRolePolicy?.addStatements(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        principals: [new iam.FederatedPrincipal(oidcProvider.openIdConnectProviderArn, {
          StringEquals: {
            [`${oidcProvider.openIdConnectProviderIssuer}:sub`]: 'system:serviceaccount:kube-system:cluster-autoscaler',
            [`${oidcProvider.openIdConnectProviderIssuer}:aud`]: 'sts.amazonaws.com'
          }
        }, 'sts:AssumeRoleWithWebIdentity')],
        actions: ['sts:AssumeRoleWithWebIdentity']
      })
    );
  }*/
}
