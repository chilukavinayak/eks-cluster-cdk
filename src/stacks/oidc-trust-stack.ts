import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as eks from 'aws-cdk-lib/aws-eks';
import { Construct } from 'constructs';

export interface OidcTrustStackProps extends cdk.StackProps {
  cluster: eks.Cluster;
}

export class OidcTrustStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: OidcTrustStackProps) {
    super(scope, id, props);

    const { cluster } = props;
    const oidcProvider = cluster.openIdConnectProvider;

    // Create proper service account roles with OIDC trust
    this.createServiceAccountRoles(oidcProvider);
  }

  private createServiceAccountRoles(oidcProvider: iam.IOpenIdConnectProvider) {
    // AWS Load Balancer Controller Role
    const albControllerRole = new iam.Role(this, 'AlbControllerRole', {
      assumedBy: new iam.WebIdentityPrincipal(
        oidcProvider.openIdConnectProviderArn,
        {
          StringEquals: {
            [`${oidcProvider.openIdConnectProviderIssuer}:sub`]: 'system:serviceaccount:kube-system:aws-load-balancer-controller',
            [`${oidcProvider.openIdConnectProviderIssuer}:aud`]: 'sts.amazonaws.com'
          }
        }
      ),
      roleName: 'EksAlbControllerRole',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('ElasticLoadBalancingFullAccess')
      ]
    });

    // ALB Controller inline policy
    const albControllerPolicy = new iam.Policy(this, 'AlbControllerPolicy', {
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
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
            'ec2:CreateTags',
            'ec2:AuthorizeSecurityGroupIngress',
            'ec2:RevokeSecurityGroupIngress',
            'ec2:CreateSecurityGroup',
            'elasticloadbalancing:*',
            'acm:ListCertificates',
            'acm:DescribeCertificate',
            'iam:CreateServiceLinkedRole',
            'cognito-idp:DescribeUserPoolClient',
            'waf-regional:*',
            'wafv2:*',
            'shield:*'
          ],
          resources: ['*']
        })
      ]
    });
    albControllerRole.attachInlinePolicy(albControllerPolicy);

    // EBS CSI Driver Role
    const ebsDriverRole = new iam.Role(this, 'EbsDriverRole', {
      assumedBy: new iam.WebIdentityPrincipal(
        oidcProvider.openIdConnectProviderArn,
        {
          StringEquals: {
            [`${oidcProvider.openIdConnectProviderIssuer}:sub`]: 'system:serviceaccount:kube-system:ebs-csi-controller-sa',
            [`${oidcProvider.openIdConnectProviderIssuer}:aud`]: 'sts.amazonaws.com'
          }
        }
      ),
      roleName: 'EksEbsDriverRole',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonEBSCSIDriverPolicy')
      ]
    });

    // EFS CSI Driver Role
    const efsDriverRole = new iam.Role(this, 'EfsDriverRole', {
      assumedBy: new iam.WebIdentityPrincipal(
        oidcProvider.openIdConnectProviderArn,
        {
          StringEquals: {
            [`${oidcProvider.openIdConnectProviderIssuer}:sub`]: 'system:serviceaccount:kube-system:efs-csi-controller-sa',
            [`${oidcProvider.openIdConnectProviderIssuer}:aud`]: 'sts.amazonaws.com'
          }
        }
      ),
      roleName: 'EksEfsDriverRole',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonEFSCSIDriverPolicy')
      ]
    });

    // Cluster Autoscaler Role
    const clusterAutoScalerRole = new iam.Role(this, 'ClusterAutoScalerRole', {
      assumedBy: new iam.WebIdentityPrincipal(
        oidcProvider.openIdConnectProviderArn,
        {
          StringEquals: {
            [`${oidcProvider.openIdConnectProviderIssuer}:sub`]: 'system:serviceaccount:kube-system:cluster-autoscaler',
            [`${oidcProvider.openIdConnectProviderIssuer}:aud`]: 'sts.amazonaws.com'
          }
        }
      ),
      roleName: 'EksClusterAutoScalerRole'
    });

    // Cluster Autoscaler Policy
    const clusterAutoScalerPolicy = new iam.Policy(this, 'ClusterAutoScalerPolicy', {
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
    clusterAutoScalerRole.attachInlinePolicy(clusterAutoScalerPolicy);

    // Backend Application Service Role
    const backendServiceRole = new iam.Role(this, 'BackendServiceRole', {
      assumedBy: new iam.WebIdentityPrincipal(
        oidcProvider.openIdConnectProviderArn,
        {
          StringEquals: {
            [`${oidcProvider.openIdConnectProviderIssuer}:sub`]: 'system:serviceaccount:demo-app:backend-service-account',
            [`${oidcProvider.openIdConnectProviderIssuer}:aud`]: 'sts.amazonaws.com'
          }
        }
      ),
      roleName: 'EksBackendServiceRole'
    });

    // Backend service policy
    const backendServicePolicy = new iam.Policy(this, 'BackendServicePolicy', {
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'ssm:GetParameter',
            'ssm:GetParameters',
            'ssm:GetParametersByPath',
            'secretsmanager:GetSecretValue',
            'secretsmanager:DescribeSecret'
          ],
          resources: [
            `arn:aws:ssm:${this.region}:${this.account}:parameter/eks/*`,
            `arn:aws:secretsmanager:${this.region}:${this.account}:secret:eks-*`
          ]
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['kms:Decrypt'],
          resources: [`arn:aws:kms:${this.region}:${this.account}:key/*`],
          conditions: {
            StringEquals: {
              'kms:ViaService': [
                `secretsmanager.${this.region}.amazonaws.com`,
                `ssm.${this.region}.amazonaws.com`
              ]
            }
          }
        })
      ]
    });
    backendServiceRole.attachInlinePolicy(backendServicePolicy);

    // Frontend Application Service Role
    const frontendServiceRole = new iam.Role(this, 'FrontendServiceRole', {
      assumedBy: new iam.WebIdentityPrincipal(
        oidcProvider.openIdConnectProviderArn,
        {
          StringEquals: {
            [`${oidcProvider.openIdConnectProviderIssuer}:sub`]: 'system:serviceaccount:demo-app:frontend-service-account',
            [`${oidcProvider.openIdConnectProviderIssuer}:aud`]: 'sts.amazonaws.com'
          }
        }
      ),
      roleName: 'EksFrontendServiceRole'
    });

    // Store role ARNs in SSM for Kubernetes manifests
    new cdk.CfnParameter(this, 'AlbControllerRoleArn', {
      type: 'String',
      default: albControllerRole.roleArn
    });

    new cdk.CfnParameter(this, 'EbsDriverRoleArn', {
      type: 'String',
      default: ebsDriverRole.roleArn
    });

    new cdk.CfnParameter(this, 'EfsDriverRoleArn', {
      type: 'String',
      default: efsDriverRole.roleArn
    });

    new cdk.CfnParameter(this, 'ClusterAutoScalerRoleArn', {
      type: 'String',
      default: clusterAutoScalerRole.roleArn
    });

    new cdk.CfnParameter(this, 'BackendServiceRoleArn', {
      type: 'String',
      default: backendServiceRole.roleArn
    });

    new cdk.CfnParameter(this, 'FrontendServiceRoleArn', {
      type: 'String',
      default: frontendServiceRole.roleArn
    });

    // Outputs
    new cdk.CfnOutput(this, 'AlbControllerRoleArnOutput', {
      value: albControllerRole.roleArn,
      description: 'ALB Controller Role ARN'
    });

    new cdk.CfnOutput(this, 'BackendServiceRoleArnOutput', {
      value: backendServiceRole.roleArn,
      description: 'Backend Service Role ARN'
    });

    new cdk.CfnOutput(this, 'FrontendServiceRoleArnOutput', {
      value: frontendServiceRole.roleArn,
      description: 'Frontend Service Role ARN'
    });
  }
}
