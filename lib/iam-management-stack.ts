import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface IamManagementStackProps extends cdk.StackProps {
  environment: string;
  projectName: string;
  clusterName: string;
}

export class IamManagementStack extends cdk.Stack {
  public readonly eksAdminRole: iam.Role;
  public readonly eksDevRole: iam.Role;
  public readonly eksReadOnlyRole: iam.Role;
  public readonly eksAdminUser: iam.User;
  public readonly cicdRole: iam.Role;

  constructor(scope: Construct, id: string, props: IamManagementStackProps) {
    super(scope, id, props);

    // EKS Admin Role - Full cluster access
    this.eksAdminRole = new iam.Role(this, 'EksAdminRole', {
      roleName: `${props.clusterName}-admin-role`,
      description: 'Administrative access to EKS cluster',
      assumedBy: new iam.CompositePrincipal(
        new iam.AccountRootPrincipal(), // Can be assumed by account root
        new iam.ServicePrincipal('ec2.amazonaws.com') // For EC2 instances
      ),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKSClusterPolicy'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKSServicePolicy'),
      ],
      inlinePolicies: {
        EksAdminPolicy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'eks:*',
                'ec2:DescribeInstances',
                'ec2:DescribeSecurityGroups',
                'ec2:DescribeVpcs',
                'ec2:DescribeSubnets',
                'iam:ListRoles',
                'iam:PassRole',
              ],
              resources: ['*'],
            }),
          ],
        }),
      },
    });

    // EKS Developer Role - Limited cluster access
    this.eksDevRole = new iam.Role(this, 'EksDevRole', {
      roleName: `${props.clusterName}-dev-role`,
      description: 'Developer access to EKS cluster',
      assumedBy: new iam.AccountRootPrincipal(),
      inlinePolicies: {
        EksDevPolicy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'eks:DescribeCluster',
                'eks:ListClusters',
                'eks:DescribeNodegroup',
                'eks:ListNodegroups',
                'eks:DescribeFargateProfile',
                'eks:ListFargateProfiles',
                'eks:DescribeAddon',
                'eks:ListAddons',
              ],
              resources: ['*'],
            }),
          ],
        }),
      },
    });

    // EKS Read-Only Role - View-only access
    this.eksReadOnlyRole = new iam.Role(this, 'EksReadOnlyRole', {
      roleName: `${props.clusterName}-readonly-role`,
      description: 'Read-only access to EKS cluster',
      assumedBy: new iam.AccountRootPrincipal(),
      inlinePolicies: {
        EksReadOnlyPolicy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'eks:Describe*',
                'eks:List*',
                'ec2:DescribeInstances',
                'ec2:DescribeSecurityGroups',
              ],
              resources: ['*'],
            }),
          ],
        }),
      },
    });

    // CI/CD Role for automated deployments
    this.cicdRole = new iam.Role(this, 'CicdRole', {
      roleName: `${props.clusterName}-cicd-role`,
      description: 'CI/CD pipeline access to EKS cluster',
      assumedBy: new iam.CompositePrincipal(
        new iam.ServicePrincipal('codebuild.amazonaws.com'),
        new iam.ServicePrincipal('codepipeline.amazonaws.com'),
        new iam.AccountRootPrincipal() // Allow account root to assume (for now)
        // Note: GitHub Actions OIDC can be added later when OIDC provider is properly configured
      ),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKSClusterPolicy'),
      ],
      inlinePolicies: {
        CicdEksPolicy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'eks:*',
                'iam:PassRole',
                'ec2:DescribeInstances',
                'ec2:DescribeSecurityGroups',
                'ecr:GetAuthorizationToken',
                'ecr:BatchCheckLayerAvailability',
                'ecr:GetDownloadUrlForLayer',
                'ecr:BatchGetImage',
              ],
              resources: ['*'],
            }),
          ],
        }),
      },
    });

    // EKS Admin User - For human administrators
    this.eksAdminUser = new iam.User(this, 'EksAdminUser', {
      userName: `${props.clusterName}-admin`,
      path: '/eks-admins/',
      groups: [],
    });

    // Allow the admin user to assume the admin role
    this.eksAdminUser.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['sts:AssumeRole'],
        resources: [this.eksAdminRole.roleArn],
      })
    );

    // Admin user can also assume other roles for testing
    this.eksAdminUser.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['sts:AssumeRole'],
        resources: [
          this.eksDevRole.roleArn,
          this.eksReadOnlyRole.roleArn,
          this.cicdRole.roleArn,
        ],
      })
    );

    // Create access keys for the admin user (optional, prefer IAM roles when possible)
    const adminAccessKey = new iam.CfnAccessKey(this, 'EksAdminAccessKey', {
      userName: this.eksAdminUser.userName,
    });

    // Outputs
    new cdk.CfnOutput(this, 'EksAdminRoleArn', {
      value: this.eksAdminRole.roleArn,
      description: 'EKS Admin Role ARN',
      exportName: `${props.environment}-eks-admin-role-arn`,
    });

    new cdk.CfnOutput(this, 'EksDevRoleArn', {
      value: this.eksDevRole.roleArn,
      description: 'EKS Developer Role ARN',
      exportName: `${props.environment}-eks-dev-role-arn`,
    });

    new cdk.CfnOutput(this, 'EksReadOnlyRoleArn', {
      value: this.eksReadOnlyRole.roleArn,
      description: 'EKS Read-Only Role ARN',
      exportName: `${props.environment}-eks-readonly-role-arn`,
    });

    new cdk.CfnOutput(this, 'CicdRoleArn', {
      value: this.cicdRole.roleArn,
      description: 'CI/CD Role ARN for automated deployments',
      exportName: `${props.environment}-cicd-role-arn`,
    });

    new cdk.CfnOutput(this, 'EksAdminUserArn', {
      value: this.eksAdminUser.userArn,
      description: 'EKS Admin User ARN',
      exportName: `${props.environment}-eks-admin-user-arn`,
    });

    new cdk.CfnOutput(this, 'EksAdminAccessKeyId', {
      value: adminAccessKey.ref,
      description: 'EKS Admin User Access Key ID',
    });

    new cdk.CfnOutput(this, 'EksAdminSecretAccessKey', {
      value: adminAccessKey.attrSecretAccessKey,
      description: 'EKS Admin User Secret Access Key (Store securely!)',
    });

    new cdk.CfnOutput(this, 'AssumeRoleCommands', {
      value: [
        `# To assume admin role:`,
        `aws sts assume-role --role-arn ${this.eksAdminRole.roleArn} --role-session-name eks-admin-session`,
        ``,
        `# To assume dev role:`,
        `aws sts assume-role --role-arn ${this.eksDevRole.roleArn} --role-session-name eks-dev-session`,
        ``,
        `# To assume readonly role:`,
        `aws sts assume-role --role-arn ${this.eksReadOnlyRole.roleArn} --role-session-name eks-readonly-session`,
      ].join('\\n'),
      description: 'Commands to assume different EKS roles',
    });

    // Tags
    cdk.Tags.of(this).add('Environment', props.environment);
    cdk.Tags.of(this).add('Project', props.projectName);
    cdk.Tags.of(this).add('Stack', 'IAMManagement');
    cdk.Tags.of(this).add('Purpose', 'EKS-Access-Control');
  }
}
