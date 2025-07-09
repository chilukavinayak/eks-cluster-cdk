import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

export class IamStack extends cdk.Stack {
  public readonly clusterRole: iam.Role;
  public readonly albControllerRole: iam.Role;
  public readonly efsDriverRole: iam.Role;
  public readonly ebsDriverRole: iam.Role;
  public readonly clusterAutoScalerRole: iam.Role;

  constructor(scope: Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props);

    // EKS Cluster Service Role
    this.clusterRole = new iam.Role(this, 'EksClusterRole', {
      assumedBy: new iam.ServicePrincipal('eks.amazonaws.com'),
      roleName: 'EksClusterRole',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKSClusterPolicy')
      ]
    });



    // AWS Load Balancer Controller Role (will be updated with OIDC provider later)
    this.albControllerRole = new iam.Role(this, 'AlbControllerRole', {
    assumedBy: new iam.AccountRootPrincipal(), // Temporary - will be updated later
    roleName: 'AlbControllerRole'
    });

    // ALB Controller Policy
    const albControllerPolicy = new iam.Policy(this, 'AlbControllerPolicy', {
      policyName: 'AlbControllerPolicy',
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
            'elasticloadbalancing:DescribeTags'
          ],
          resources: ['*']
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
            'shield:DeleteProtection'
          ],
          resources: ['*']
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'ec2:AuthorizeSecurityGroupIngress',
            'ec2:RevokeSecurityGroupIngress',
            'ec2:CreateSecurityGroup',
            'ec2:CreateTags'
          ],
          resources: ['*']
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'elasticloadbalancing:CreateLoadBalancer',
            'elasticloadbalancing:CreateTargetGroup'
          ],
          resources: ['*'],
          conditions: {
            'Null': {
              'aws:RequestedRegion': 'false'
            }
          }
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'elasticloadbalancing:CreateListener',
            'elasticloadbalancing:DeleteListener',
            'elasticloadbalancing:CreateRule',
            'elasticloadbalancing:DeleteRule'
          ],
          resources: ['*']
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'elasticloadbalancing:AddTags',
            'elasticloadbalancing:RemoveTags'
          ],
          resources: [
            'arn:aws:elasticloadbalancing:*:*:targetgroup/*/*',
            'arn:aws:elasticloadbalancing:*:*:loadbalancer/net/*/*',
            'arn:aws:elasticloadbalancing:*:*:loadbalancer/app/*/*'
          ],
          conditions: {
            'Null': {
              'aws:RequestedRegion': 'false'
            }
          }
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
            'elasticloadbalancing:DeleteTargetGroup'
          ],
          resources: ['*']
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'elasticloadbalancing:RegisterTargets',
            'elasticloadbalancing:DeregisterTargets'
          ],
          resources: ['arn:aws:elasticloadbalancing:*:*:targetgroup/*/*']
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'elasticloadbalancing:SetWebAcl',
            'elasticloadbalancing:ModifyListener',
            'elasticloadbalancing:AddListenerCertificates',
            'elasticloadbalancing:RemoveListenerCertificates',
            'elasticloadbalancing:ModifyRule'
          ],
          resources: ['*']
        })
      ]
    });
    this.albControllerRole.attachInlinePolicy(albControllerPolicy);

    // EBS CSI Driver Role (will be updated with OIDC provider later)
    this.ebsDriverRole = new iam.Role(this, 'EbsDriverRole', {
      assumedBy: new iam.AccountRootPrincipal(), // Temporary - will be updated later
      roleName: 'EbsDriverRole',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonEBSCSIDriverPolicy')
      ]
    });

    // EFS CSI Driver Role (will be updated with OIDC provider later)
    this.efsDriverRole = new iam.Role(this, 'EfsDriverRole', {
      assumedBy: new iam.AccountRootPrincipal(), // Temporary - will be updated later
      roleName: 'EfsDriverRole',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonEFSCSIDriverPolicy')
      ]
    });

    // Cluster Autoscaler Role (will be updated with OIDC provider later)
    this.clusterAutoScalerRole = new iam.Role(this, 'ClusterAutoScalerRole', {
      assumedBy: new iam.AccountRootPrincipal(), // Temporary - will be updated later
      roleName: 'ClusterAutoScalerRole'
    });

    // Cluster Autoscaler Policy
    const clusterAutoScalerPolicy = new iam.Policy(this, 'ClusterAutoScalerPolicy', {
      policyName: 'ClusterAutoScalerPolicy',
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'autoscaling:DescribeAutoScalingGroups',
            'autoscaling:DescribeAutoScalingInstances',
            'autoscaling:DescribeLaunchConfigurations',
            'autoscaling:DescribeTags',
            'autoscaling:SetDesiredCapacity',
            'autoscaling:TerminateInstanceInAutoScalingGroup',
            'ec2:DescribeLaunchTemplateVersions'
          ],
          resources: ['*']
        })
      ]
    });
    this.clusterAutoScalerRole.attachInlinePolicy(clusterAutoScalerPolicy);

    // Store role ARNs in SSM for reference
    new ssm.StringParameter(this, 'ClusterRoleArn', {
      parameterName: '/eks/cluster-role-arn',
      stringValue: this.clusterRole.roleArn,
      description: 'EKS cluster role ARN'
    });



    new ssm.StringParameter(this, 'AlbControllerRoleArn', {
      parameterName: '/eks/alb-controller-role-arn',
      stringValue: this.albControllerRole.roleArn,
      description: 'ALB controller role ARN'
    });

    // Outputs
    new cdk.CfnOutput(this, 'ClusterRoleArnOutput', {
      value: this.clusterRole.roleArn,
      description: 'EKS cluster role ARN'
    });



    new cdk.CfnOutput(this, 'AlbControllerRoleArnOutput', {
      value: this.albControllerRole.roleArn,
      description: 'ALB controller role ARN'
    });
  }
}
