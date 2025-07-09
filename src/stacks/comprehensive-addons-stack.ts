import * as cdk from 'aws-cdk-lib';
import * as eks from 'aws-cdk-lib/aws-eks';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

export interface ComprehensiveAddonsStackProps extends cdk.StackProps {
  cluster: eks.Cluster;
  vpc: ec2.Vpc;
}

export class ComprehensiveAddonsStack extends cdk.Stack {
  public readonly albControllerRole: iam.Role;
  public readonly clusterAutoscalerRole: iam.Role;
  public readonly externalDnsRole: iam.Role;
  public readonly fluentBitRole: iam.Role;

  constructor(scope: Construct, id: string, props: ComprehensiveAddonsStackProps) {
    super(scope, id, props);

    // Create service account roles
    this.albControllerRole = this.createAlbControllerRole(props.cluster);
    this.clusterAutoscalerRole = this.createClusterAutoscalerRole(props.cluster);
    this.externalDnsRole = this.createExternalDnsRole(props.cluster);
    this.fluentBitRole = this.createFluentBitRole(props.cluster);

    // Install AWS Load Balancer Controller
    this.installAwsLoadBalancerController(props.cluster);

    // Install Cluster Autoscaler
    this.installClusterAutoscaler(props.cluster);

    // Install External DNS
    this.installExternalDns(props.cluster);

    // Install Fluent Bit for logging
    this.installFluentBit(props.cluster);

    // Install Metrics Server
    this.installMetricsServer(props.cluster);

    // Install Kubernetes Dashboard
    this.installKubernetesDashboard(props.cluster);

    // Setup Horizontal Pod Autoscaler
    this.setupHorizontalPodAutoscaler(props.cluster);

    // Setup Network Policies
    this.setupNetworkPolicies(props.cluster);

    // Setup Secrets Management
    this.setupSecretsManagement(props.cluster);

    // Setup Ingress Resources
    this.setupIngressResources(props.cluster);

    // Setup outputs
    this.setupOutputs();
  }

  private createAlbControllerRole(cluster: eks.Cluster): iam.Role {
    const albRole = new iam.Role(this, 'AlbControllerRole', {
      assumedBy: new iam.FederatedPrincipal(
        cluster.openIdConnectProvider.openIdConnectProviderArn,
        {
          StringEquals: {
            [`${cluster.openIdConnectProvider.openIdConnectProviderIssuer}:sub`]: 'system:serviceaccount:kube-system:aws-load-balancer-controller',
            [`${cluster.openIdConnectProvider.openIdConnectProviderIssuer}:aud`]: 'sts.amazonaws.com',
          },
        },
        'sts:AssumeRoleWithWebIdentity'
      ),
      inlinePolicies: {
        AlbControllerPolicy: new iam.PolicyDocument({
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
                'ec2:DescribeVpcPeeringConnections',
                'ec2:DescribeSubnets',
                'ec2:DescribeSecurityGroups',
                'ec2:DescribeInstances',
                'ec2:DescribeNetworkInterfaces',
                'ec2:DescribeTags',
                'ec2:GetCoipPoolUsage',
                'ec2:GetManagedPrefixListEntries',
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
                'shield:CreateProtection',
                'shield:DescribeSubscription',
                'shield:ListProtections',
              ],
              resources: ['*'],
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'ec2:AuthorizeSecurityGroupIngress',
                'ec2:RevokeSecurityGroupIngress',
                'ec2:CreateSecurityGroup',
                'elasticloadbalancing:CreateListener',
                'elasticloadbalancing:DeleteListener',
                'elasticloadbalancing:CreateRule',
                'elasticloadbalancing:DeleteRule',
                'elasticloadbalancing:SetWebAcl',
                'elasticloadbalancing:ModifyListener',
                'elasticloadbalancing:AddListenerCertificates',
                'elasticloadbalancing:RemoveListenerCertificates',
                'elasticloadbalancing:ModifyRule',
              ],
              resources: ['*'],
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'elasticloadbalancing:CreateLoadBalancer',
                'elasticloadbalancing:CreateTargetGroup',
              ],
              resources: ['*'],
              conditions: {
                StringEquals: {
                  'elasticloadbalancing:CreateAction': [
                    'CreateTargetGroup',
                    'CreateLoadBalancer',
                  ],
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
                StringEquals: {
                  'elasticloadbalancing:CreateAction': [
                    'CreateTargetGroup',
                    'CreateLoadBalancer',
                  ],
                },
              },
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'elasticloadbalancing:DeleteLoadBalancer',
                'elasticloadbalancing:DeleteTargetGroup',
                'elasticloadbalancing:ModifyLoadBalancerAttributes',
                'elasticloadbalancing:ModifyTargetGroup',
                'elasticloadbalancing:ModifyTargetGroupAttributes',
                'elasticloadbalancing:RegisterTargets',
                'elasticloadbalancing:DeregisterTargets',
                'elasticloadbalancing:SetSecurityGroups',
                'elasticloadbalancing:SetSubnets',
                'elasticloadbalancing:SetIpAddressType',
                'elasticloadbalancing:AddTags',
                'elasticloadbalancing:RemoveTags',
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
                StringLike: {
                  'aws:RequestedRegion': '*',
                },
              },
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'ec2:CreateTags',
                'ec2:DeleteTags',
              ],
              resources: ['arn:aws:ec2:*:*:security-group/*'],
              conditions: {
                StringLike: {
                  'aws:RequestedRegion': '*',
                },
              },
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
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'elasticloadbalancing:AddTags',
                'elasticloadbalancing:RemoveTags',
              ],
              resources: [
                'arn:aws:elasticloadbalancing:*:*:listener/net/*/*/*',
                'arn:aws:elasticloadbalancing:*:*:listener/app/*/*/*',
                'arn:aws:elasticloadbalancing:*:*:listener-rule/net/*/*/*',
                'arn:aws:elasticloadbalancing:*:*:listener-rule/app/*/*/*',
              ],
            }),
          ],
        }),
      },
    });

    return albRole;
  }

  private createClusterAutoscalerRole(cluster: eks.Cluster): iam.Role {
    const autoscalerRole = new iam.Role(this, 'ClusterAutoscalerRole', {
      assumedBy: new iam.FederatedPrincipal(
        cluster.openIdConnectProvider.openIdConnectProviderArn,
        {
          StringEquals: {
            [`${cluster.openIdConnectProvider.openIdConnectProviderIssuer}:sub`]: 'system:serviceaccount:kube-system:cluster-autoscaler',
            [`${cluster.openIdConnectProvider.openIdConnectProviderIssuer}:aud`]: 'sts.amazonaws.com',
          },
        },
        'sts:AssumeRoleWithWebIdentity'
      ),
      inlinePolicies: {
        ClusterAutoscalerPolicy: new iam.PolicyDocument({
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
                'ec2:DescribeLaunchTemplateVersions',
                'ec2:DescribeInstanceTypes',
              ],
              resources: ['*'],
            }),
          ],
        }),
      },
    });

    return autoscalerRole;
  }

  private createExternalDnsRole(cluster: eks.Cluster): iam.Role {
    const externalDnsRole = new iam.Role(this, 'ExternalDnsRole', {
      assumedBy: new iam.FederatedPrincipal(
        cluster.openIdConnectProvider.openIdConnectProviderArn,
        {
          StringEquals: {
            [`${cluster.openIdConnectProvider.openIdConnectProviderIssuer}:sub`]: 'system:serviceaccount:kube-system:external-dns',
            [`${cluster.openIdConnectProvider.openIdConnectProviderIssuer}:aud`]: 'sts.amazonaws.com',
          },
        },
        'sts:AssumeRoleWithWebIdentity'
      ),
      inlinePolicies: {
        ExternalDnsPolicy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'route53:ChangeResourceRecordSets',
              ],
              resources: ['arn:aws:route53:::hostedzone/*'],
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'route53:ListHostedZones',
                'route53:ListResourceRecordSets',
              ],
              resources: ['*'],
            }),
          ],
        }),
      },
    });

    return externalDnsRole;
  }

  private createFluentBitRole(cluster: eks.Cluster): iam.Role {
    const fluentBitRole = new iam.Role(this, 'FluentBitRole', {
      assumedBy: new iam.FederatedPrincipal(
        cluster.openIdConnectProvider.openIdConnectProviderArn,
        {
          StringEquals: {
            [`${cluster.openIdConnectProvider.openIdConnectProviderIssuer}:sub`]: 'system:serviceaccount:amazon-cloudwatch:fluent-bit',
            [`${cluster.openIdConnectProvider.openIdConnectProviderIssuer}:aud`]: 'sts.amazonaws.com',
          },
        },
        'sts:AssumeRoleWithWebIdentity'
      ),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchAgentServerPolicy'),
      ],
    });

    return fluentBitRole;
  }

  private installAwsLoadBalancerController(cluster: eks.Cluster): void {
    // Create service account
    const albServiceAccount = cluster.addServiceAccount('AlbControllerServiceAccount', {
      name: 'aws-load-balancer-controller',
      namespace: 'kube-system',
      annotations: {
        'eks.amazonaws.com/role-arn': this.albControllerRole.roleArn,
      },
    });

    // Install AWS Load Balancer Controller using Helm
    const albController = cluster.addHelmChart('AwsLoadBalancerController', {
      chart: 'aws-load-balancer-controller',
      repository: 'https://aws.github.io/eks-charts',
      namespace: 'kube-system',
      values: {
        clusterName: cluster.clusterName,
        serviceAccount: {
          create: false,
          name: 'aws-load-balancer-controller',
        },
        region: this.region,
        vpcId: cluster.vpc.vpcId,
        image: {
          repository: '602401143452.dkr.ecr.us-east-1.amazonaws.com/amazon/aws-load-balancer-controller',
        },
        resources: {
          limits: {
            cpu: '200m',
            memory: '500Mi',
          },
          requests: {
            cpu: '100m',
            memory: '200Mi',
          },
        },
        podDisruptionBudget: {
          maxUnavailable: 1,
        },
        nodeSelector: {
          'node-type': 'primary',
        },
        tolerations: [],
      },
    });

    albController.node.addDependency(albServiceAccount);
  }

  private installClusterAutoscaler(cluster: eks.Cluster): void {
    // Create service account
    const autoscalerServiceAccount = cluster.addServiceAccount('ClusterAutoscalerServiceAccount', {
      name: 'cluster-autoscaler',
      namespace: 'kube-system',
      annotations: {
        'eks.amazonaws.com/role-arn': this.clusterAutoscalerRole.roleArn,
      },
    });

    // Install Cluster Autoscaler
    const autoscaler = cluster.addHelmChart('ClusterAutoscaler', {
      chart: 'cluster-autoscaler',
      repository: 'https://kubernetes.github.io/autoscaler',
      namespace: 'kube-system',
      values: {
        autoDiscovery: {
          clusterName: cluster.clusterName,
        },
        awsRegion: this.region,
        serviceAccount: {
          create: false,
          name: 'cluster-autoscaler',
        },
        rbac: {
          serviceAccount: {
            create: false,
            name: 'cluster-autoscaler',
          },
        },
        resources: {
          limits: {
            cpu: '100m',
            memory: '300Mi',
          },
          requests: {
            cpu: '100m',
            memory: '300Mi',
          },
        },
        extraArgs: {
          'v': '4',
          'stderrthreshold': 'info',
          'cloud-provider': 'aws',
          'skip-nodes-with-local-storage': 'false',
          'expander': 'least-waste',
          'node-group-auto-discovery': `asg:tag=k8s.io/cluster-autoscaler/enabled,k8s.io/cluster-autoscaler/${cluster.clusterName}`,
          'balance-similar-node-groups': 'false',
          'scale-down-enabled': 'true',
          'scale-down-delay-after-add': '10m',
          'scale-down-unneeded-time': '10m',
          'scale-down-delay-after-delete': '10s',
          'scale-down-delay-after-failure': '3m',
          'scale-down-utilization-threshold': '0.5',
          'skip-nodes-with-system-pods': 'false',
        },
        nodeSelector: {
          'node-type': 'primary',
        },
        tolerations: [],
      },
    });

    autoscaler.node.addDependency(autoscalerServiceAccount);
  }

  private installExternalDns(cluster: eks.Cluster): void {
    // Create service account
    const externalDnsServiceAccount = cluster.addServiceAccount('ExternalDnsServiceAccount', {
      name: 'external-dns',
      namespace: 'kube-system',
      annotations: {
        'eks.amazonaws.com/role-arn': this.externalDnsRole.roleArn,
      },
    });

    // Install External DNS
    const externalDns = cluster.addHelmChart('ExternalDns', {
      chart: 'external-dns',
      repository: 'https://kubernetes-sigs.github.io/external-dns/',
      namespace: 'kube-system',
      values: {
        serviceAccount: {
          create: false,
          name: 'external-dns',
        },
        provider: 'aws',
        aws: {
          region: this.region,
        },
        txtOwnerId: cluster.clusterName,
        domainFilters: [], // Add your domain filters here
        sources: [
          'service',
          'ingress',
        ],
        policy: 'upsert-only',
        resources: {
          limits: {
            cpu: '50m',
            memory: '50Mi',
          },
          requests: {
            cpu: '10m',
            memory: '50Mi',
          },
        },
        nodeSelector: {
          'node-type': 'primary',
        },
        tolerations: [],
      },
    });

    externalDns.node.addDependency(externalDnsServiceAccount);
  }

  private installFluentBit(cluster: eks.Cluster): void {
    // Create namespace
    const cloudwatchNamespace = cluster.addManifest('CloudWatchNamespace', {
      apiVersion: 'v1',
      kind: 'Namespace',
      metadata: {
        name: 'amazon-cloudwatch',
        labels: {
          name: 'amazon-cloudwatch',
        },
      },
    });

    // Create service account
    const fluentBitServiceAccount = cluster.addServiceAccount('FluentBitServiceAccount', {
      name: 'fluent-bit',
      namespace: 'amazon-cloudwatch',
      annotations: {
        'eks.amazonaws.com/role-arn': this.fluentBitRole.roleArn,
      },
    });

    fluentBitServiceAccount.node.addDependency(cloudwatchNamespace);

    // Install Fluent Bit
    const fluentBit = cluster.addHelmChart('FluentBit', {
      chart: 'fluent-bit',
      repository: 'https://fluent.github.io/helm-charts',
      namespace: 'amazon-cloudwatch',
      values: {
        serviceAccount: {
          create: false,
          name: 'fluent-bit',
        },
        config: {
          service: `
            [SERVICE]
                Flush         1
                Log_Level     info
                Daemon        off
                Parsers_File  parsers.conf
                HTTP_Server   On
                HTTP_Listen   0.0.0.0
                HTTP_Port     2020
          `,
          inputs: `
            [INPUT]
                Name              tail
                Tag               application.*
                Exclude_Path      /var/log/containers/cloudwatch-agent*, /var/log/containers/fluent-bit*, /var/log/containers/aws-node*, /var/log/containers/kube-proxy*
                Path              /var/log/containers/*.log
                Parser            docker
                DB                /var/fluent-bit/state/flb_container.db
                Mem_Buf_Limit     50MB
                Skip_Long_Lines   On
                Refresh_Interval  10
                Rotate_Wait       30
                storage.type      filesystem
                Read_from_Head    Off
          `,
          outputs: `
            [OUTPUT]
                Name                cloudwatch_logs
                Match               application.*
                region              ${this.region}
                log_group_name      /aws/containerinsights/${cluster.clusterName}/application
                log_stream_name     \${hostname}-application
                auto_create_group   On
                extra_user_agent    container-insights
          `,
        },
        resources: {
          limits: {
            cpu: '200m',
            memory: '200Mi',
          },
          requests: {
            cpu: '100m',
            memory: '200Mi',
          },
        },
        nodeSelector: {
          'node-type': 'primary',
        },
        tolerations: [
          {
            key: 'node-role.kubernetes.io/master',
            operator: 'Exists',
            effect: 'NoSchedule',
          },
        ],
      },
    });

    fluentBit.node.addDependency(fluentBitServiceAccount);
  }

  private installMetricsServer(cluster: eks.Cluster): void {
    const metricsServer = cluster.addHelmChart('MetricsServer', {
      chart: 'metrics-server',
      repository: 'https://kubernetes-sigs.github.io/metrics-server/',
      namespace: 'kube-system',
      values: {
        args: [
          '--cert-dir=/tmp',
          '--secure-port=4443',
          '--kubelet-preferred-address-types=InternalIP,ExternalIP,Hostname',
          '--kubelet-use-node-status-port',
          '--metric-resolution=15s',
        ],
        resources: {
          limits: {
            cpu: '100m',
            memory: '300Mi',
          },
          requests: {
            cpu: '100m',
            memory: '200Mi',
          },
        },
        nodeSelector: {
          'node-type': 'primary',
        },
        tolerations: [],
      },
    });
  }

  private installKubernetesDashboard(cluster: eks.Cluster): void {
    // Create namespace
    const dashboardNamespace = cluster.addManifest('DashboardNamespace', {
      apiVersion: 'v1',
      kind: 'Namespace',
      metadata: {
        name: 'kubernetes-dashboard',
        labels: {
          name: 'kubernetes-dashboard',
        },
      },
    });

    // Install Kubernetes Dashboard
    const dashboard = cluster.addHelmChart('KubernetesDashboard', {
      chart: 'kubernetes-dashboard',
      repository: 'https://kubernetes.github.io/dashboard/',
      namespace: 'kubernetes-dashboard',
      values: {
        service: {
          type: 'ClusterIP',
        },
        ingress: {
          enabled: false,
        },
        rbac: {
          clusterReadOnlyRole: true,
        },
        resources: {
          limits: {
            cpu: '100m',
            memory: '300Mi',
          },
          requests: {
            cpu: '100m',
            memory: '200Mi',
          },
        },
        nodeSelector: {
          'node-type': 'primary',
        },
        tolerations: [],
      },
    });

    dashboard.node.addDependency(dashboardNamespace);
  }

  private setupHorizontalPodAutoscaler(cluster: eks.Cluster): void {
    // Create HPA for demo application
    const hpa = cluster.addManifest('DemoAppHpa', {
      apiVersion: 'autoscaling/v2',
      kind: 'HorizontalPodAutoscaler',
      metadata: {
        name: 'demo-app-hpa',
        namespace: 'demo-app',
      },
      spec: {
        scaleTargetRef: {
          apiVersion: 'apps/v1',
          kind: 'Deployment',
          name: 'demo-app',
        },
        minReplicas: 2,
        maxReplicas: 50,
        metrics: [
          {
            type: 'Resource',
            resource: {
              name: 'cpu',
              target: {
                type: 'Utilization',
                averageUtilization: 50,
              },
            },
          },
          {
            type: 'Resource',
            resource: {
              name: 'memory',
              target: {
                type: 'Utilization',
                averageUtilization: 80,
              },
            },
          },
        ],
        behavior: {
          scaleUp: {
            stabilizationWindowSeconds: 60,
            policies: [
              {
                type: 'Percent',
                value: 100,
                periodSeconds: 15,
              },
            ],
          },
          scaleDown: {
            stabilizationWindowSeconds: 300,
            policies: [
              {
                type: 'Percent',
                value: 10,
                periodSeconds: 60,
              },
            ],
          },
        },
      },
    });
  }

  private setupNetworkPolicies(cluster: eks.Cluster): void {
    // Default deny all network policy
    const denyAllNetworkPolicy = cluster.addManifest('DenyAllNetworkPolicy', {
      apiVersion: 'networking.k8s.io/v1',
      kind: 'NetworkPolicy',
      metadata: {
        name: 'deny-all',
        namespace: 'demo-app',
      },
      spec: {
        podSelector: {},
        policyTypes: ['Ingress', 'Egress'],
      },
    });

    // Allow ingress from ALB
    const allowIngressFromAlb = cluster.addManifest('AllowIngressFromAlb', {
      apiVersion: 'networking.k8s.io/v1',
      kind: 'NetworkPolicy',
      metadata: {
        name: 'allow-ingress-from-alb',
        namespace: 'demo-app',
      },
      spec: {
        podSelector: {
          matchLabels: {
            app: 'demo-app',
          },
        },
        policyTypes: ['Ingress'],
        ingress: [
          {
            from: [
              {
                namespaceSelector: {
                  matchLabels: {
                    name: 'kube-system',
                  },
                },
                podSelector: {
                  matchLabels: {
                    'app.kubernetes.io/name': 'aws-load-balancer-controller',
                  },
                },
              },
            ],
            ports: [
              {
                protocol: 'TCP',
                port: 80,
              },
              {
                protocol: 'TCP',
                port: 8080,
              },
            ],
          },
        ],
      },
    });

    // Allow egress to internet
    const allowEgressToInternet = cluster.addManifest('AllowEgressToInternet', {
      apiVersion: 'networking.k8s.io/v1',
      kind: 'NetworkPolicy',
      metadata: {
        name: 'allow-egress-to-internet',
        namespace: 'demo-app',
      },
      spec: {
        podSelector: {},
        policyTypes: ['Egress'],
        egress: [
          {
            to: [],
            ports: [
              {
                protocol: 'TCP',
                port: 80,
              },
              {
                protocol: 'TCP',
                port: 443,
              },
              {
                protocol: 'UDP',
                port: 53,
              },
            ],
          },
        ],
      },
    });
  }

  private setupSecretsManagement(cluster: eks.Cluster): void {
    // Create some sample secrets in AWS Secrets Manager
    const dbSecret = new secretsmanager.Secret(this, 'DatabaseSecret', {
      secretName: 'eks/demo-app/database',
      description: 'Database credentials for demo application',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'admin' }),
        generateStringKey: 'password',
        excludeCharacters: '"@/\\',
      },
    });

    const apiSecret = new secretsmanager.Secret(this, 'ApiSecret', {
      secretName: 'eks/demo-app/api-keys',
      description: 'API keys for demo application',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ service: 'demo-app' }),
        generateStringKey: 'api-key',
        excludeCharacters: '"@/\\',
      },
    });

    // Store secrets in SSM Parameter Store
    new ssm.StringParameter(this, 'DatabaseUrl', {
      parameterName: '/eks/demo-app/database-url',
      stringValue: 'postgresql://localhost:5432/demo',
      description: 'Database URL for demo application',
    });

    new ssm.StringParameter(this, 'AppConfig', {
      parameterName: '/eks/demo-app/config',
      stringValue: JSON.stringify({
        environment: 'production',
        debug: false,
        logLevel: 'info',
      }),
      description: 'Application configuration',
    });

    // Install Secrets Store CSI Driver
    const secretsStoreDriver = cluster.addHelmChart('SecretsStoreCsiDriver', {
      chart: 'secrets-store-csi-driver',
      repository: 'https://kubernetes-sigs.github.io/secrets-store-csi-driver/charts',
      namespace: 'kube-system',
      values: {
        syncSecret: {
          enabled: true,
        },
        enableSecretRotation: true,
        resources: {
          limits: {
            cpu: '200m',
            memory: '200Mi',
          },
          requests: {
            cpu: '50m',
            memory: '100Mi',
          },
        },
        nodeSelector: {
          'node-type': 'primary',
        },
        tolerations: [],
      },
    });

    // Install AWS Provider for Secrets Store CSI Driver
    const awsProvider = cluster.addHelmChart('SecretsStoreAwsProvider', {
      chart: 'secrets-store-csi-driver-provider-aws',
      repository: 'https://aws.github.io/secrets-store-csi-driver-provider-aws',
      namespace: 'kube-system',
      values: {
        resources: {
          limits: {
            cpu: '50m',
            memory: '100Mi',
          },
          requests: {
            cpu: '50m',
            memory: '100Mi',
          },
        },
        nodeSelector: {
          'node-type': 'primary',
        },
        tolerations: [],
      },
    });

    awsProvider.node.addDependency(secretsStoreDriver);
  }

  private setupIngressResources(cluster: eks.Cluster): void {
    // Create ingress class
    const ingressClass = cluster.addManifest('AlbIngressClass', {
      apiVersion: 'networking.k8s.io/v1',
      kind: 'IngressClass',
      metadata: {
        name: 'alb',
        annotations: {
          'ingressclass.kubernetes.io/is-default-class': 'true',
        },
      },
      spec: {
        controller: 'ingress.k8s.aws/alb',
      },
    });

    // Create sample ingress for demo application
    const demoAppIngress = cluster.addManifest('DemoAppIngress', {
      apiVersion: 'networking.k8s.io/v1',
      kind: 'Ingress',
      metadata: {
        name: 'demo-app-ingress',
        namespace: 'demo-app',
        annotations: {
          'alb.ingress.kubernetes.io/scheme': 'internet-facing',
          'alb.ingress.kubernetes.io/target-type': 'ip',
          'alb.ingress.kubernetes.io/healthcheck-path': '/health',
          'alb.ingress.kubernetes.io/healthcheck-interval-seconds': '15',
          'alb.ingress.kubernetes.io/healthcheck-timeout-seconds': '5',
          'alb.ingress.kubernetes.io/healthy-threshold-count': '2',
          'alb.ingress.kubernetes.io/unhealthy-threshold-count': '3',
          'alb.ingress.kubernetes.io/success-codes': '200',
          'alb.ingress.kubernetes.io/listen-ports': '[{"HTTP":80}, {"HTTPS":443}]',
          'alb.ingress.kubernetes.io/ssl-redirect': '443',
        },
      },
      spec: {
        ingressClassName: 'alb',
        rules: [
          {
            http: {
              paths: [
                {
                  path: '/',
                  pathType: 'Prefix',
                  backend: {
                    service: {
                      name: 'demo-app-service',
                      port: {
                        number: 80,
                      },
                    },
                  },
                },
              ],
            },
          },
        ],
      },
    });

    demoAppIngress.node.addDependency(ingressClass);
  }

  private setupOutputs(): void {
    new cdk.CfnOutput(this, 'AlbControllerRoleArn', {
      value: this.albControllerRole.roleArn,
      description: 'ARN of the ALB Controller IAM Role',
      exportName: 'AlbControllerRoleArn',
    });

    new cdk.CfnOutput(this, 'ClusterAutoscalerRoleArn', {
      value: this.clusterAutoscalerRole.roleArn,
      description: 'ARN of the Cluster Autoscaler IAM Role',
      exportName: 'ClusterAutoscalerRoleArn',
    });

    new cdk.CfnOutput(this, 'ExternalDnsRoleArn', {
      value: this.externalDnsRole.roleArn,
      description: 'ARN of the External DNS IAM Role',
      exportName: 'ExternalDnsRoleArn',
    });

    new cdk.CfnOutput(this, 'FluentBitRoleArn', {
      value: this.fluentBitRole.roleArn,
      description: 'ARN of the Fluent Bit IAM Role',
      exportName: 'FluentBitRoleArn',
    });
  }
}
