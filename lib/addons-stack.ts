import * as cdk from 'aws-cdk-lib';
import * as eks from 'aws-cdk-lib/aws-eks';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { EksClusterStack } from './eks-cluster-stack';

export interface AddonsStackProps extends cdk.StackProps {
  eksClusterStack: EksClusterStack;
  environment: string;
  projectName: string;
}

export class AddonsStack extends cdk.Stack {
  public readonly vpcCniAddon: eks.CfnAddon;
  public readonly coreDnsAddon: eks.CfnAddon;
  public readonly kubeProxyAddon: eks.CfnAddon;
  public readonly ebsCsiAddon: eks.CfnAddon;
  public readonly loadBalancerControllerServiceAccount: eks.ServiceAccount;

  constructor(scope: Construct, id: string, props: AddonsStackProps) {
    super(scope, id, props);

    const cluster = props.eksClusterStack.cluster;

    // Simplified EBS CSI Driver Role (without complex IRSA to avoid token issues)
    const ebsCsiRole = new iam.Role(this, 'EbsCsiDriverRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonEBSCSIDriverPolicy'),
      ],
    });

    // AWS Load Balancer Controller Service Account and Role
    this.loadBalancerControllerServiceAccount = cluster.addServiceAccount('aws-load-balancer-controller', {
      name: 'aws-load-balancer-controller',
      namespace: 'kube-system',
    });

    // AWS Load Balancer Controller IAM Policy
    const albControllerPolicy = new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'iam:CreateServiceLinkedRole',
            'ec2:DescribeAccountAttributes',
            'ec2:DescribeAddresses',
            'ec2:DescribeAvailabilityZones',
            'ec2:DescribeInternetGateways',
            'ec2:DescribeVpcs',
            'ec2:DescribeSubnets',
            'ec2:DescribeSecurityGroups',
            'ec2:DescribeInstances',
            'ec2:DescribeNetworkInterfaces',
            'ec2:DescribeTags',
            'ec2:GetCoipPoolUsage',
            'ec2:DescribeCoipPools',
            'elasticloadbalancing:DescribeLoadBalancers',
            'elasticloadbalancing:DescribeLoadBalancerAttributes',
            'elasticloadbalancing:DescribeListeners',
            'elasticloadbalancing:DescribeListenerCertificates',
            'elasticloadbalancing:DescribeSSLPolicies',
            'elasticloadbalancing:DescribeRules',
            'elasticloadbalancing:DescribeTargetGroups',
            'elasticloadbalancing:DescribeTargetGroupAttributes',
            'elasticloadbalancing:DescribeTargetHealth',
            'elasticloadbalancing:DescribeTags',
          ],
          resources: ['*'],
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'cognito-idp:DescribeUserPoolClient',
            'acm:ListCertificates',
            'acm:DescribeCertificate',
            'iam:ListServerCertificates',
            'iam:GetServerCertificate',
            'waf-regional:GetWebACL',
            'waf-regional:GetWebACLForResource',
            'waf-regional:AssociateWebACL',
            'waf-regional:DisassociateWebACL',
            'wafv2:GetWebACL',
            'wafv2:GetWebACLForResource',
            'wafv2:AssociateWebACL',
            'wafv2:DisassociateWebACL',
            'shield:DescribeProtection',
            'shield:GetSubscriptionState',
            'shield:DescribeSubscription',
            'shield:CreateProtection',
            'shield:DeleteProtection',
          ],
          resources: ['*'],
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'ec2:AuthorizeSecurityGroupIngress',
            'ec2:RevokeSecurityGroupIngress',
          ],
          resources: ['*'],
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'ec2:CreateSecurityGroup',
          ],
          resources: ['*'],
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'ec2:CreateTags',
          ],
          resources: ['arn:aws:ec2:*:*:security-group/*'],
          conditions: {
            StringEquals: {
              'ec2:CreateAction': 'CreateSecurityGroup',
            },
            Null: {
              'aws:RequestedRegion': 'false',
            },
          },
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'elasticloadbalancing:CreateLoadBalancer',
            'elasticloadbalancing:CreateTargetGroup',
          ],
          resources: ['*'],
          conditions: {
            Null: {
              'aws:RequestedRegion': 'false',
            },
          },
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'elasticloadbalancing:CreateListener',
            'elasticloadbalancing:DeleteListener',
            'elasticloadbalancing:CreateRule',
            'elasticloadbalancing:DeleteRule',
          ],
          resources: ['*'],
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'elasticloadbalancing:AddTags',
            'elasticloadbalancing:RemoveTags',
          ],
          resources: [
            'arn:aws:elasticloadbalancing:*:*:targetgroup/*/*',
            'arn:aws:elasticloadbalancing:*:*:loadbalancer/net/*/*',
            'arn:aws:elasticloadbalancing:*:*:loadbalancer/app/*/*',
          ],
          conditions: {
            Null: {
              'aws:RequestedRegion': 'false',
              'aws:ResourceTag/elbv2.k8s.aws/cluster': 'false',
            },
          },
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'elasticloadbalancing:ModifyLoadBalancerAttributes',
            'elasticloadbalancing:SetIpAddressType',
            'elasticloadbalancing:SetSecurityGroups',
            'elasticloadbalancing:SetSubnets',
            'elasticloadbalancing:DeleteLoadBalancer',
            'elasticloadbalancing:ModifyTargetGroup',
            'elasticloadbalancing:ModifyTargetGroupAttributes',
            'elasticloadbalancing:DeleteTargetGroup',
          ],
          resources: ['*'],
          conditions: {
            Null: {
              'aws:ResourceTag/elbv2.k8s.aws/cluster': 'false',
            },
          },
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'elasticloadbalancing:RegisterTargets',
            'elasticloadbalancing:DeregisterTargets',
          ],
          resources: ['arn:aws:elasticloadbalancing:*:*:targetgroup/*/*'],
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'elasticloadbalancing:SetWebAcl',
            'elasticloadbalancing:ModifyListener',
            'elasticloadbalancing:AddListenerCertificates',
            'elasticloadbalancing:RemoveListenerCertificates',
            'elasticloadbalancing:ModifyRule',
          ],
          resources: ['*'],
        }),
      ],
    });

    this.loadBalancerControllerServiceAccount.role.attachInlinePolicy(
      new iam.Policy(this, 'AwsLoadBalancerControllerPolicy', {
        document: albControllerPolicy,
      })
    );

    // 1. VPC CNI Add-on (for pod networking)
    this.vpcCniAddon = new eks.CfnAddon(this, 'VpcCniAddon', {
      clusterName: cluster.clusterName,
      addonName: 'vpc-cni',
      addonVersion: 'v1.18.1-eksbuild.1', // Use latest stable version
      resolveConflicts: 'OVERWRITE',
      tags: [
        {
          key: 'Environment',
          value: props.environment,
        },
        {
          key: 'Project',
          value: props.projectName,
        },
      ],
    });

    // 2. CoreDNS Add-on (for DNS resolution)
    this.coreDnsAddon = new eks.CfnAddon(this, 'CoreDnsAddon', {
      clusterName: cluster.clusterName,
      addonName: 'coredns',
      addonVersion: 'v1.11.1-eksbuild.9', // Use latest stable version
      resolveConflicts: 'OVERWRITE',
      tags: [
        {
          key: 'Environment',
          value: props.environment,
        },
        {
          key: 'Project',
          value: props.projectName,
        },
      ],
    });

    // 3. kube-proxy Add-on (for service proxy)
    this.kubeProxyAddon = new eks.CfnAddon(this, 'KubeProxyAddon', {
      clusterName: cluster.clusterName,
      addonName: 'kube-proxy',
      addonVersion: 'v1.30.0-eksbuild.3', // Use latest stable version matching cluster version
      resolveConflicts: 'OVERWRITE',
      tags: [
        {
          key: 'Environment',
          value: props.environment,
        },
        {
          key: 'Project',
          value: props.projectName,
        },
      ],
    });

    // 4. EBS CSI Driver Add-on (for persistent volumes)
    this.ebsCsiAddon = new eks.CfnAddon(this, 'EbsCsiAddon', {
      clusterName: cluster.clusterName,
      addonName: 'aws-ebs-csi-driver',
      addonVersion: 'v1.30.0-eksbuild.1', // Use latest stable version
      resolveConflicts: 'OVERWRITE',
      tags: [
        {
          key: 'Environment',
          value: props.environment,
        },
        {
          key: 'Project',
          value: props.projectName,
        },
      ],
    });

    // Install AWS Load Balancer Controller using Helm
    const awsLoadBalancerController = cluster.addHelmChart('AWSLoadBalancerController', {
      chart: 'aws-load-balancer-controller',
      repository: 'https://aws.github.io/eks-charts',
      namespace: 'kube-system',
      values: {
        clusterName: cluster.clusterName,
        serviceAccount: {
          create: false,
          name: this.loadBalancerControllerServiceAccount.serviceAccountName,
        },
        region: this.region,
        vpcId: cluster.vpc.vpcId,
        // Enable internal load balancers by default for private clusters
        defaultSSLPolicy: 'ELBSecurityPolicy-TLS-1-2-2017-01',
        ingressClass: 'alb',
        enableServiceMutatorWebhook: false,
      },
    });

    // Ensure the service account is created before the Helm chart
    awsLoadBalancerController.node.addDependency(this.loadBalancerControllerServiceAccount);

    // Simplified dependency order to avoid circular dependencies
    this.coreDnsAddon.addDependency(this.vpcCniAddon);
    this.kubeProxyAddon.addDependency(this.vpcCniAddon);
    this.ebsCsiAddon.addDependency(this.coreDnsAddon);
    // Load Balancer Controller will be installed independently

    // Outputs
    new cdk.CfnOutput(this, 'VpcCniAddonVersion', {
      value: this.vpcCniAddon.addonVersion || 'unknown',
      description: 'VPC CNI Add-on Version',
    });

    new cdk.CfnOutput(this, 'CoreDnsAddonVersion', {
      value: this.coreDnsAddon.addonVersion || 'unknown',
      description: 'CoreDNS Add-on Version',
    });

    new cdk.CfnOutput(this, 'KubeProxyAddonVersion', {
      value: this.kubeProxyAddon.addonVersion || 'unknown',
      description: 'kube-proxy Add-on Version',
    });

    new cdk.CfnOutput(this, 'EbsCsiAddonVersion', {
      value: this.ebsCsiAddon.addonVersion || 'unknown',
      description: 'EBS CSI Driver Add-on Version',
    });

    new cdk.CfnOutput(this, 'LoadBalancerControllerServiceAccountArn', {
      value: this.loadBalancerControllerServiceAccount.role.roleArn,
      description: 'AWS Load Balancer Controller Service Account Role ARN',
    });

    // Tags
    cdk.Tags.of(this).add('Environment', props.environment);
    cdk.Tags.of(this).add('Project', props.projectName);
    cdk.Tags.of(this).add('Stack', 'Addons');
  }
}
