import * as cdk from 'aws-cdk-lib';
import * as eks from 'aws-cdk-lib/aws-eks';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as autoscaling from 'aws-cdk-lib/aws-autoscaling';
import { Construct } from 'constructs';
import { KubectlV28Layer } from '@aws-cdk/lambda-layer-kubectl-v28';

export interface ProductionEksStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  clusterRole: iam.Role;
}

export class ProductionEksStack extends cdk.Stack {
  public readonly cluster: eks.Cluster;
  public readonly clusterName: string;
  public readonly clusterSecurityGroup: ec2.SecurityGroup;
  public readonly nodeSecurityGroup: ec2.SecurityGroup;
  public readonly oidcProvider: iam.OpenIdConnectProvider;
  public readonly nodeGroupRole: iam.Role;

  constructor(scope: Construct, id: string, props: ProductionEksStackProps) {
    super(scope, id, props);

    this.clusterName = 'production-eks-cluster';

    // Create node group role within this stack to avoid circular dependencies
    this.nodeGroupRole = new iam.Role(this, 'EksNodeGroupRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      roleName: 'EksNodeGroupRole',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKSWorkerNodePolicy'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKS_CNI_Policy'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEC2ContainerRegistryReadOnly'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
      ],
    });

    // Additional policy for node group to access SSM and Secrets Manager
    const nodeGroupAdditionalPolicy = new iam.Policy(this, 'NodeGroupAdditionalPolicy', {
      policyName: 'EksNodeGroupAdditionalPolicy',
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'ssm:GetParameter',
            'ssm:GetParameters',
            'ssm:GetParametersByPath',
            'secretsmanager:GetSecretValue',
            'secretsmanager:DescribeSecret',
          ],
          resources: ['*'],
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['kms:Decrypt'],
          resources: ['*'],
          conditions: {
            StringEquals: {
              'kms:ViaService': `secretsmanager.${this.region}.amazonaws.com`,
            },
          },
        }),
      ],
    });
    this.nodeGroupRole.attachInlinePolicy(nodeGroupAdditionalPolicy);

    // KMS Key for EKS encryption
    const eksKmsKey = new kms.Key(this, 'EksKmsKey', {
      description: 'KMS key for EKS cluster encryption',
      enableKeyRotation: true,
      policy: new iam.PolicyDocument({
        statements: [
          new iam.PolicyStatement({
            sid: 'Enable IAM User Permissions',
            effect: iam.Effect.ALLOW,
            principals: [new iam.AccountRootPrincipal()],
            actions: ['kms:*'],
            resources: ['*'],
          }),
          new iam.PolicyStatement({
            sid: 'Allow EKS Service',
            effect: iam.Effect.ALLOW,
            principals: [new iam.ServicePrincipal('eks.amazonaws.com')],
            actions: [
              'kms:Decrypt',
              'kms:DescribeKey',
              'kms:Encrypt',
              'kms:GenerateDataKey*',
              'kms:ReEncrypt*',
            ],
            resources: ['*'],
          }),
        ],
      }),
    });

    // CloudWatch Log Group for EKS
    const clusterLogGroup = new logs.LogGroup(this, 'EksClusterLogGroup', {
      logGroupName: `/aws/eks/${this.clusterName}/cluster`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Security Groups
    this.clusterSecurityGroup = new ec2.SecurityGroup(this, 'EksClusterSecurityGroup', {
      vpc: props.vpc,
      description: 'Security group for EKS cluster control plane',
      allowAllOutbound: true,
    });

    this.nodeSecurityGroup = new ec2.SecurityGroup(this, 'EksNodeSecurityGroup', {
      vpc: props.vpc,
      description: 'Security group for EKS worker nodes',
      allowAllOutbound: true,
    });

    // Security Group Rules
    this.setupSecurityGroupRules();

    // EKS Cluster with comprehensive configuration
    this.cluster = new eks.Cluster(this, 'EksCluster', {
      clusterName: this.clusterName,
      version: eks.KubernetesVersion.V1_28,
      vpc: props.vpc,
      vpcSubnets: [
        {
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
      ],
      role: props.clusterRole,
      securityGroup: this.clusterSecurityGroup,
      
      // Endpoint configuration
      endpointAccess: eks.EndpointAccess.PUBLIC_AND_PRIVATE.onlyFrom(
        '0.0.0.0/0' // Configure this for your specific IP ranges
      ),
      
      // Logging configuration
      clusterLogging: [
        eks.ClusterLoggingTypes.API,
        eks.ClusterLoggingTypes.AUDIT,
        eks.ClusterLoggingTypes.AUTHENTICATOR,
        eks.ClusterLoggingTypes.CONTROLLER_MANAGER,
        eks.ClusterLoggingTypes.SCHEDULER,
      ],
      
      // Encryption
      secretsEncryptionKey: eksKmsKey,
      
      // Advanced configuration to avoid rate limiting
      defaultCapacity: 0, // We'll add capacity separately
      outputClusterName: true,
      outputConfigCommand: true,
      outputMastersRoleArn: true,
      
      // Authentication
      authenticationMode: eks.AuthenticationMode.API_AND_CONFIG_MAP,
      
      // Disable automatic resource creation that causes rate limiting
      prune: false,
      
      // Add kubectl layer
      kubectlLayer: new KubectlV28Layer(this, 'KubectlLayer'),
      
      tags: {
        Environment: 'production',
        Project: 'eks-cluster',
        ManagedBy: 'CDK',
      },
    });

    // Get OIDC Provider
    this.oidcProvider = this.cluster.openIdConnectProvider as iam.OpenIdConnectProvider;

    // Add managed node groups with different configurations
    this.addNodeGroups(props);

    // Setup cluster add-ons
    this.setupClusterAddons();

    // Setup RBAC
    this.setupRBAC();

    // Setup monitoring and logging
    this.setupMonitoring();

    // Store cluster information in SSM
    this.storeClusterInfo();

    // Setup outputs
    this.setupOutputs();
  }

  private setupSecurityGroupRules(): void {
    // Cluster Security Group Rules
    this.clusterSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'Allow HTTPS access to EKS API server'
    );

    // Node Security Group Rules
    this.nodeSecurityGroup.addIngressRule(
      this.nodeSecurityGroup,
      ec2.Port.allTraffic(),
      'Allow all traffic between worker nodes'
    );

    this.nodeSecurityGroup.addIngressRule(
      this.clusterSecurityGroup,
      ec2.Port.allTraffic(),
      'Allow cluster control plane to communicate with worker nodes'
    );

    // Allow nodes to communicate with cluster
    this.clusterSecurityGroup.addIngressRule(
      this.nodeSecurityGroup,
      ec2.Port.tcp(443),
      'Allow worker nodes to communicate with cluster API server'
    );

    // Allow ALB to communicate with nodes
    this.nodeSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcpRange(30000, 32767),
      'Allow ALB to communicate with NodePort services'
    );
  }

  private addNodeGroups(props: ProductionEksStackProps): void {
    // Primary Node Group - General Purpose
    const primaryNodeGroup = this.cluster.addNodegroupCapacity('PrimaryNodeGroup', {
      nodegroupName: 'primary-nodes',
      instanceTypes: [
        new ec2.InstanceType('m5.large'),
        new ec2.InstanceType('m5.xlarge'),
      ],
      minSize: 2,
      maxSize: 20,
      desiredSize: 3,
      diskSize: 100,
      amiType: eks.NodegroupAmiType.AL2_X86_64,
      capacityType: eks.CapacityType.ON_DEMAND,
      nodeRole: this.nodeGroupRole,
      subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      // remoteAccess: {
      //   ec2KeyPair: 'eks-node-key', // Replace with your key pair name
      //   sourceSecurityGroups: [this.nodeSecurityGroup],
      // },
      // userData: ec2.UserData.forLinux(),
      tags: {
        'kubernetes.io/cluster/production-eks-cluster': 'owned',
        'k8s.io/cluster-autoscaler/enabled': 'true',
        'k8s.io/cluster-autoscaler/production-eks-cluster': 'owned',
        'NodeType': 'primary',
      },
      labels: {
        'node-type': 'primary',
        'instance-category': 'general-purpose',
      },
    });

    // Spot Node Group - Cost Optimized
    const spotNodeGroup = this.cluster.addNodegroupCapacity('SpotNodeGroup', {
      nodegroupName: 'spot-nodes',
      instanceTypes: [
        new ec2.InstanceType('m5.large'),
        new ec2.InstanceType('m5.xlarge'),
        new ec2.InstanceType('m4.large'),
        new ec2.InstanceType('m4.xlarge'),
        new ec2.InstanceType('c5.large'),
        new ec2.InstanceType('c5.xlarge'),
      ],
      minSize: 0,
      maxSize: 50,
      desiredSize: 2,
      diskSize: 100,
      amiType: eks.NodegroupAmiType.AL2_X86_64,
      capacityType: eks.CapacityType.SPOT,
      nodeRole: this.nodeGroupRole,
      subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      tags: {
        'kubernetes.io/cluster/production-eks-cluster': 'owned',
        'k8s.io/cluster-autoscaler/enabled': 'true',
        'k8s.io/cluster-autoscaler/production-eks-cluster': 'owned',
        'NodeType': 'spot',
      },
      labels: {
        'node-type': 'spot',
        'instance-category': 'cost-optimized',
      },
      taints: [
        {
          key: 'spot-instance',
          value: 'true',
          effect: eks.TaintEffect.NO_SCHEDULE,
        },
      ],
    });

    // High Memory Node Group - For memory-intensive workloads
    const highMemoryNodeGroup = this.cluster.addNodegroupCapacity('HighMemoryNodeGroup', {
      nodegroupName: 'high-memory-nodes',
      instanceTypes: [
        new ec2.InstanceType('r5.large'),
        new ec2.InstanceType('r5.xlarge'),
        new ec2.InstanceType('r5.2xlarge'),
      ],
      minSize: 0,
      maxSize: 10,
      desiredSize: 1,
      diskSize: 100,
      amiType: eks.NodegroupAmiType.AL2_X86_64,
      capacityType: eks.CapacityType.ON_DEMAND,
      nodeRole: this.nodeGroupRole,
      subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      tags: {
        'kubernetes.io/cluster/production-eks-cluster': 'owned',
        'k8s.io/cluster-autoscaler/enabled': 'true',
        'k8s.io/cluster-autoscaler/production-eks-cluster': 'owned',
        'NodeType': 'high-memory',
      },
      labels: {
        'node-type': 'high-memory',
        'instance-category': 'memory-optimized',
      },
      taints: [
        {
          key: 'high-memory',
          value: 'true',
          effect: eks.TaintEffect.NO_SCHEDULE,
        },
      ],
    });
  }

  private setupClusterAddons(): void {
    // EBS CSI Driver
    const ebsAddon = new eks.CfnAddon(this, 'EbsCsiDriverAddon', {
      clusterName: this.cluster.clusterName,
      addonName: 'aws-ebs-csi-driver',
      addonVersion: 'v1.25.0-eksbuild.1',
      resolveConflicts: 'OVERWRITE',
      serviceAccountRoleArn: this.createEbsCsiServiceAccountRole(),
      tags: [{
        key: 'ManagedBy',
        value: 'CDK',
      }],
    });

    // EFS CSI Driver
    const efsAddon = new eks.CfnAddon(this, 'EfsCsiDriverAddon', {
      clusterName: this.cluster.clusterName,
      addonName: 'aws-efs-csi-driver',
      addonVersion: 'v1.7.1-eksbuild.1',
      resolveConflicts: 'OVERWRITE',
      serviceAccountRoleArn: this.createEfsCsiServiceAccountRole(),
      tags: [{
        key: 'ManagedBy',
        value: 'CDK',
      }],
    });

    // VPC CNI
    const vpcCniAddon = new eks.CfnAddon(this, 'VpcCniAddon', {
      clusterName: this.cluster.clusterName,
      addonName: 'vpc-cni',
      addonVersion: 'v1.15.4-eksbuild.1',
      resolveConflicts: 'OVERWRITE',
      configurationValues: JSON.stringify({
        'env': {
          'ENABLE_PREFIX_DELEGATION': 'true',
          'ENABLE_POD_ENI': 'true',
          'POD_SECURITY_GROUP_ENFORCING_MODE': 'standard',
        },
      }),
      tags: [{
        key: 'ManagedBy',
        value: 'CDK',
      }],
    });

    // CoreDNS
    const coreDnsAddon = new eks.CfnAddon(this, 'CoreDnsAddon', {
      clusterName: this.cluster.clusterName,
      addonName: 'coredns',
      addonVersion: 'v1.10.1-eksbuild.4',
      resolveConflicts: 'OVERWRITE',
      tags: [{
        key: 'ManagedBy',
        value: 'CDK',
      }],
    });

    // Kube Proxy
    const kubeProxyAddon = new eks.CfnAddon(this, 'KubeProxyAddon', {
      clusterName: this.cluster.clusterName,
      addonName: 'kube-proxy',
      addonVersion: 'v1.28.2-eksbuild.2',
      resolveConflicts: 'OVERWRITE',
      tags: [{
        key: 'ManagedBy',
        value: 'CDK',
      }],
    });

    // Add dependencies
    ebsAddon.node.addDependency(this.cluster);
    efsAddon.node.addDependency(this.cluster);
    vpcCniAddon.node.addDependency(this.cluster);
    coreDnsAddon.node.addDependency(this.cluster);
    kubeProxyAddon.node.addDependency(this.cluster);
  }

  private createEbsCsiServiceAccountRole(): string {
    const ebsCsiRole = new iam.Role(this, 'EbsCsiServiceAccountRole', {
      assumedBy: new iam.AccountRootPrincipal(), // Temporary - will be updated by the cluster
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonEBSCSIDriverPolicy'),
      ],
    });

    return ebsCsiRole.roleArn;
  }

  private createEfsCsiServiceAccountRole(): string {
    const efsCsiRole = new iam.Role(this, 'EfsCsiServiceAccountRole', {
      assumedBy: new iam.AccountRootPrincipal(), // Temporary - will be updated by the cluster
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonEFSCSIDriverPolicy'),
      ],
    });

    return efsCsiRole.roleArn;
  }

  private setupRBAC(): void {
    // Create namespace for applications
    const demoNamespace = this.cluster.addManifest('DemoNamespace', {
      apiVersion: 'v1',
      kind: 'Namespace',
      metadata: {
        name: 'demo-app',
        labels: {
          'name': 'demo-app',
        },
      },
    });

    // Create service account for applications
    const appServiceAccount = this.cluster.addManifest('AppServiceAccount', {
      apiVersion: 'v1',
      kind: 'ServiceAccount',
      metadata: {
        name: 'app-service-account',
        namespace: 'demo-app',
      },
    });

    // Create ClusterRole for applications
    const appClusterRole = this.cluster.addManifest('AppClusterRole', {
      apiVersion: 'rbac.authorization.k8s.io/v1',
      kind: 'ClusterRole',
      metadata: {
        name: 'app-cluster-role',
      },
      rules: [
        {
          apiGroups: [''],
          resources: ['pods', 'services', 'endpoints'],
          verbs: ['get', 'list', 'watch'],
        },
        {
          apiGroups: ['apps'],
          resources: ['deployments', 'replicasets'],
          verbs: ['get', 'list', 'watch'],
        },
      ],
    });

    // Create ClusterRoleBinding
    const appClusterRoleBinding = this.cluster.addManifest('AppClusterRoleBinding', {
      apiVersion: 'rbac.authorization.k8s.io/v1',
      kind: 'ClusterRoleBinding',
      metadata: {
        name: 'app-cluster-role-binding',
      },
      roleRef: {
        apiGroup: 'rbac.authorization.k8s.io',
        kind: 'ClusterRole',
        name: 'app-cluster-role',
      },
      subjects: [
        {
          kind: 'ServiceAccount',
          name: 'app-service-account',
          namespace: 'demo-app',
        },
      ],
    });

    // Add dependencies
    appServiceAccount.node.addDependency(demoNamespace);
    appClusterRoleBinding.node.addDependency(appServiceAccount);
    appClusterRoleBinding.node.addDependency(appClusterRole);
  }

  private setupMonitoring(): void {
    // Container Insights
    const containerInsights = this.cluster.addManifest('ContainerInsights', {
      apiVersion: 'v1',
      kind: 'Namespace',
      metadata: {
        name: 'amazon-cloudwatch',
        labels: {
          'name': 'amazon-cloudwatch',
        },
      },
    });

    // CloudWatch Agent ConfigMap
    const cwAgentConfig = this.cluster.addManifest('CloudWatchAgentConfig', {
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: {
        name: 'cwagentconfig',
        namespace: 'amazon-cloudwatch',
      },
      data: {
        'cwagentconfig.json': JSON.stringify({
          metrics: {
            namespace: 'ContainerInsights',
            metrics_collected: {
              cpu: {
                measurement: [
                  'cpu_usage_idle',
                  'cpu_usage_iowait',
                  'cpu_usage_user',
                  'cpu_usage_system',
                ],
                metrics_collection_interval: 60,
                resources: ['*'],
                totalcpu: false,
              },
              disk: {
                measurement: [
                  'used_percent',
                ],
                metrics_collection_interval: 60,
                resources: ['*'],
              },
              diskio: {
                measurement: [
                  'io_time',
                ],
                metrics_collection_interval: 60,
                resources: ['*'],
              },
              mem: {
                measurement: [
                  'mem_used_percent',
                ],
                metrics_collection_interval: 60,
              },
              netstat: {
                measurement: [
                  'tcp_established',
                  'tcp_time_wait',
                ],
                metrics_collection_interval: 60,
              },
            },
          },
        }),
      },
    });

    cwAgentConfig.node.addDependency(containerInsights);
  }

  private storeClusterInfo(): void {
    // Store cluster configuration in SSM Parameter Store
    new ssm.StringParameter(this, 'ClusterNameParameter', {
      parameterName: '/eks/cluster/name',
      stringValue: this.cluster.clusterName,
      description: 'EKS Cluster Name',
    });

    new ssm.StringParameter(this, 'ClusterEndpointParameter', {
      parameterName: '/eks/cluster/endpoint',
      stringValue: this.cluster.clusterEndpoint,
      description: 'EKS Cluster Endpoint',
    });

    new ssm.StringParameter(this, 'ClusterArnParameter', {
      parameterName: '/eks/cluster/arn',
      stringValue: this.cluster.clusterArn,
      description: 'EKS Cluster ARN',
    });

    new ssm.StringParameter(this, 'OidcIssuerParameter', {
      parameterName: '/eks/cluster/oidc-issuer',
      stringValue: this.cluster.clusterOpenIdConnectIssuerUrl,
      description: 'EKS Cluster OIDC Issuer URL',
    });

    new ssm.StringParameter(this, 'ClusterSecurityGroupParameter', {
      parameterName: '/eks/cluster/security-group-id',
      stringValue: this.cluster.clusterSecurityGroupId,
      description: 'EKS Cluster Security Group ID',
    });

    new ssm.StringParameter(this, 'NodeSecurityGroupParameter', {
      parameterName: '/eks/node/security-group-id',
      stringValue: this.nodeSecurityGroup.securityGroupId,
      description: 'EKS Node Security Group ID',
    });
  }

  private setupOutputs(): void {
    new cdk.CfnOutput(this, 'ClusterName', {
      value: this.cluster.clusterName,
      description: 'EKS Cluster Name',
      exportName: 'EksClusterName',
    });

    new cdk.CfnOutput(this, 'ClusterEndpoint', {
      value: this.cluster.clusterEndpoint,
      description: 'EKS Cluster Endpoint',
      exportName: 'EksClusterEndpoint',
    });

    new cdk.CfnOutput(this, 'ClusterArn', {
      value: this.cluster.clusterArn,
      description: 'EKS Cluster ARN',
      exportName: 'EksClusterArn',
    });

    new cdk.CfnOutput(this, 'OidcIssuerUrl', {
      value: this.cluster.clusterOpenIdConnectIssuerUrl,
      description: 'EKS Cluster OIDC Issuer URL',
      exportName: 'EksOidcIssuerUrl',
    });

    new cdk.CfnOutput(this, 'ClusterSecurityGroupId', {
      value: this.cluster.clusterSecurityGroupId,
      description: 'EKS Cluster Security Group ID',
      exportName: 'EksClusterSecurityGroupId',
    });

    new cdk.CfnOutput(this, 'NodeSecurityGroupId', {
      value: this.nodeSecurityGroup.securityGroupId,
      description: 'EKS Node Security Group ID',
      exportName: 'EksNodeSecurityGroupId',
    });

    new cdk.CfnOutput(this, 'KubectlCommand', {
      value: `aws eks update-kubeconfig --region ${this.region} --name ${this.cluster.clusterName}`,
      description: 'Command to configure kubectl for this cluster',
    });
  }
}
