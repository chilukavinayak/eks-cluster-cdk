import * as cdk from 'aws-cdk-lib';
import * as eks from 'aws-cdk-lib/aws-eks';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { FoundationStack } from './foundation-stack';
import { KubectlV30Layer } from '@aws-cdk/lambda-layer-kubectl-v30';

export interface EksClusterStackProps extends cdk.StackProps {
  foundationStack: FoundationStack;
  clusterName: string;
  environment: string;
  projectName: string;
}

export class EksClusterStack extends cdk.Stack {
  public readonly cluster: eks.Cluster;
  public readonly nodeGroupRole: iam.Role;
  public readonly fargateRole: iam.Role;

  constructor(scope: Construct, id: string, props: EksClusterStackProps) {
    super(scope, id, props);

    // Create Node Group Role here to avoid circular dependency
    this.nodeGroupRole = new iam.Role(this, 'EksNodeGroupRole', {
      roleName: `${props.clusterName}-nodegroup-role`,
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKSWorkerNodePolicy'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKS_CNI_Policy'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEC2ContainerRegistryReadOnly'),
      ],
    });

    // Additional permissions for node group
    this.nodeGroupRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'ssm:GetParameter',
        'ssm:GetParameters',
        'ssm:GetParametersByPath',
        'secretsmanager:GetSecretValue',
      ],
      resources: ['*'],
    }));

    // Fargate Pod Execution Role
    this.fargateRole = new iam.Role(this, 'EksFargateRole', {
      roleName: `${props.clusterName}-fargate-role`,
      assumedBy: new iam.ServicePrincipal('eks-fargate-pods.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKSFargatePodExecutionRolePolicy'),
      ],
    });

    // Use the private subnets created in the foundation stack
    const privateSubnets = props.foundationStack.privateSubnets;
    
    if (privateSubnets.length === 0) {
      throw new Error('No private subnets found. Foundation stack should create private subnets.');
    }

    // CloudWatch Log Group for cluster logs
    const logGroup = new logs.LogGroup(this, 'EksClusterLogGroup', {
      logGroupName: `/aws/eks/${props.clusterName}/cluster`,
      retention: logs.RetentionDays.SIX_MONTHS, // Production: Longer retention for compliance
      removalPolicy: cdk.RemovalPolicy.RETAIN, // Production: Retain logs for auditing
      encryptionKey: props.foundationStack.kmsKey, // Encrypt logs
    });

    // Create EKS Cluster
    this.cluster = new eks.Cluster(this, 'EksCluster', {
      clusterName: props.clusterName,
      version: eks.KubernetesVersion.V1_30,
      
      // Use existing VPC and private subnets only
      vpc: props.foundationStack.vpc,
      vpcSubnets: [{ subnets: privateSubnets }],
      
      // Private endpoint with limited public access for easier management
      endpointAccess: eks.EndpointAccess.PUBLIC_AND_PRIVATE, // TODO: Restrict to office/VPN IPs
      
      // Use foundation stack resources
      role: props.foundationStack.clusterRole,
      securityGroup: props.foundationStack.clusterSecurityGroup,
      
      // Encryption at rest using KMS
      secretsEncryptionKey: props.foundationStack.kmsKey,
      
      // kubectl layer
      kubectlLayer: new KubectlV30Layer(this, 'KubectlLayer'),
      
      // Comprehensive logging for production
      clusterLogging: [
        eks.ClusterLoggingTypes.API,
        eks.ClusterLoggingTypes.AUDIT,
        eks.ClusterLoggingTypes.AUTHENTICATOR,
        eks.ClusterLoggingTypes.CONTROLLER_MANAGER,
        eks.ClusterLoggingTypes.SCHEDULER,
      ],
      
      // Don't create default node group - we'll create managed ones separately
      defaultCapacity: 0,
      
      // CoreDNS and other add-ons will be managed separately
      defaultCapacityInstance: ec2.InstanceType.of(ec2.InstanceClass.M5, ec2.InstanceSize.LARGE),
      
      // Service IP range (should not overlap with VPC CIDR)
      serviceIpv4Cidr: '172.20.0.0/16',
    });

    // Add cluster authentication - allows specified AWS users/roles to access the cluster
    // Replace with actual IAM user/role ARNs as needed
    // this.cluster.awsAuth.addUserMapping(iam.User.fromUserName(this, 'AdminUser', 'admin'), {
    //   groups: ['system:masters'],
    // });

    // Add OIDC Identity Provider for IRSA (IAM Roles for Service Accounts)
    const oidcProvider = this.cluster.openIdConnectProvider;
    
    // Namespaces will be created later after cluster is ready
    // this.cluster.addManifest('system-namespace', {
    //   apiVersion: 'v1',
    //   kind: 'Namespace',
    //   metadata: {
    //     name: 'system',
    //     labels: {
    //       'name': 'system',
    //       'managed-by': 'cdk',
    //     },
    //   },
    // });

    // this.cluster.addManifest('applications-namespace', {
    //   apiVersion: 'v1',
    //   kind: 'Namespace',
    //   metadata: {
    //     name: 'applications',
    //     labels: {
    //       'name': 'applications',
    //       'managed-by': 'cdk',
    //     },
    //   },
    // });

    // Outputs
    new cdk.CfnOutput(this, 'ClusterName', {
      value: this.cluster.clusterName,
      description: 'EKS Cluster Name',
    });

    new cdk.CfnOutput(this, 'ClusterEndpoint', {
      value: this.cluster.clusterEndpoint,
      description: 'EKS Cluster API Endpoint',
    });

    new cdk.CfnOutput(this, 'ClusterArn', {
      value: this.cluster.clusterArn,
      description: 'EKS Cluster ARN',
    });

    new cdk.CfnOutput(this, 'ClusterCertificateAuthorityData', {
      value: this.cluster.clusterCertificateAuthorityData,
      description: 'EKS Cluster Certificate Authority Data',
    });

    new cdk.CfnOutput(this, 'ClusterSecurityGroupId', {
      value: this.cluster.clusterSecurityGroupId,
      description: 'EKS Cluster Security Group ID',
    });

    new cdk.CfnOutput(this, 'OidcIssuerUrl', {
      value: this.cluster.clusterOpenIdConnectIssuerUrl,
      description: 'OIDC Issuer URL for IRSA',
    });

    new cdk.CfnOutput(this, 'KubectlCommand', {
      value: `aws eks update-kubeconfig --region ${this.region} --name ${this.cluster.clusterName}`,
      description: 'Command to update kubeconfig',
    });

    // Tags
    cdk.Tags.of(this).add('Environment', props.environment);
    cdk.Tags.of(this).add('Project', props.projectName);
    cdk.Tags.of(this).add('Stack', 'EksCluster');
  }
}
