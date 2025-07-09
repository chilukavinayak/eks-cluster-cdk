import * as cdk from 'aws-cdk-lib';
import * as eks from 'aws-cdk-lib/aws-eks';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

export interface AddonsStackProps extends cdk.StackProps {
  cluster: eks.Cluster;
}

export class AddonsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AddonsStackProps) {
    super(scope, id, props);

    const { cluster } = props;

    // Install essential add-ons with sequencing to avoid rate limiting
    this.installAWSLoadBalancerController(cluster);
    this.installEBSCSIDriver(cluster);
    this.installClusterAutoscaler(cluster);
    this.installMetricsServer(cluster);
    
    // Optional add-ons - can be installed manually later if needed
    // this.installEFSCSIDriver(cluster);
    // this.installSecretsManagerCSIDriver(cluster);
    // this.installSSMParameterStoreCSIDriver(cluster);
    // this.installContainerInsights(cluster);
    // this.installKubernetesDashboard(cluster);

    // RBAC configurations
    this.configureRBAC(cluster);
  }

  private installAWSLoadBalancerController(cluster: eks.Cluster) {
    // Use the role created in the OIDC trust stack
    const albControllerRoleArn = `arn:aws:iam::${this.account}:role/EksAlbControllerRole`;

    // Create service account for ALB Controller
    const albControllerServiceAccount = cluster.addServiceAccount('AWSLoadBalancerControllerServiceAccount', {
      name: 'aws-load-balancer-controller',
      namespace: 'kube-system',
      annotations: {
        'eks.amazonaws.com/role-arn': albControllerRoleArn
      }
    });

    // Install AWS Load Balancer Controller
    const albControllerChart = cluster.addHelmChart('AWSLoadBalancerController', {
      chart: 'aws-load-balancer-controller',
      repository: 'https://aws.github.io/eks-charts',
      namespace: 'kube-system',
      version: '1.6.2',
      values: {
        clusterName: cluster.clusterName,
        serviceAccount: {
          create: false,
          name: 'aws-load-balancer-controller'
        },
        region: this.region,
        vpcId: cluster.vpc.vpcId,
        image: {
          repository: `602401143452.dkr.ecr.${this.region}.amazonaws.com/amazon/aws-load-balancer-controller`
        }
      }
    });

    albControllerChart.node.addDependency(albControllerServiceAccount);
  }

  private installEBSCSIDriver(cluster: eks.Cluster) {
    // Install EBS CSI Driver as an EKS add-on
    const ebsAddon = new eks.CfnAddon(this, 'EbsCsiDriverAddon', {
      clusterName: cluster.clusterName,
      addonName: 'aws-ebs-csi-driver',
      addonVersion: 'v1.24.0-eksbuild.1',
      resolveConflicts: 'OVERWRITE',
      serviceAccountRoleArn: `arn:aws:iam::${this.account}:role/EksEbsDriverRole`
    });

    // Note: Default storage class should be created in the EksClusterStack
    // to avoid circular dependencies
  }

  private installEFSCSIDriver(cluster: eks.Cluster) {
    // Install EFS CSI Driver as an EKS add-on
    new eks.CfnAddon(this, 'EfsCsiDriverAddon', {
      clusterName: cluster.clusterName,
      addonName: 'aws-efs-csi-driver',
      addonVersion: 'v1.7.0-eksbuild.1',
      resolveConflicts: 'OVERWRITE',
      serviceAccountRoleArn: `arn:aws:iam::${this.account}:role/EksEfsDriverRole`
    });
  }

  private installClusterAutoscaler(cluster: eks.Cluster) {
    // Create service account for Cluster Autoscaler
    const clusterAutoscalerServiceAccount = cluster.addServiceAccount('ClusterAutoscalerServiceAccount', {
      name: 'cluster-autoscaler',
      namespace: 'kube-system',
      annotations: {
        'eks.amazonaws.com/role-arn': `arn:aws:iam::${this.account}:role/EksClusterAutoScalerRole`
      }
    });

    // Install Cluster Autoscaler
    const clusterAutoscalerChart = cluster.addHelmChart('ClusterAutoscaler', {
      chart: 'cluster-autoscaler',
      repository: 'https://kubernetes.github.io/autoscaler',
      namespace: 'kube-system',
      version: '9.29.0',
      values: {
        autoDiscovery: {
          clusterName: cluster.clusterName,
          enabled: true
        },
        awsRegion: this.region,
        serviceAccount: {
          create: false,
          name: 'cluster-autoscaler'
        },
        extraArgs: {
          'scale-down-delay-after-add': '10m',
          'scale-down-unneeded-time': '10m',
          'scale-down-utilization-threshold': '0.5',
          'skip-nodes-with-local-storage': false,
          'skip-nodes-with-system-pods': false
        }
      }
    });

    clusterAutoscalerChart.node.addDependency(clusterAutoscalerServiceAccount);
  }

  private installSecretsManagerCSIDriver(cluster: eks.Cluster) {
    // Install Secrets Manager CSI Driver
    const secretsManagerChart = cluster.addHelmChart('SecretsManagerCSIDriver', {
      chart: 'secrets-store-csi-driver',
      repository: 'https://kubernetes-sigs.github.io/secrets-store-csi-driver/charts',
      namespace: 'kube-system',
      version: '1.3.4',
      values: {
        syncSecret: {
          enabled: true
        },
        enableSecretRotation: true
      }
    });

    // Install AWS Secrets Manager CSI Driver Provider
    const awsSecretsProviderChart = cluster.addHelmChart('AWSSecretsManagerCSIDriverProvider', {
      chart: 'aws-secrets-manager-csi-driver-provider',
      repository: 'https://aws.github.io/secrets-store-csi-driver-provider-aws',
      namespace: 'kube-system',
      version: '0.3.4'
    });

    awsSecretsProviderChart.node.addDependency(secretsManagerChart);

    // Create a sample secret
    const sampleSecret = new secretsmanager.Secret(this, 'SampleSecret', {
      secretName: 'eks-sample-secret',
      description: 'Sample secret for EKS cluster',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'admin' }),
        generateStringKey: 'password',
        excludeCharacters: '"@/\\'
      }
    });

    // Store secret ARN in SSM
    new ssm.StringParameter(this, 'SampleSecretArn', {
      parameterName: '/eks/sample-secret-arn',
      stringValue: sampleSecret.secretArn,
      description: 'Sample secret ARN'
    });
  }

  private installSSMParameterStoreCSIDriver(cluster: eks.Cluster) {
    // Install AWS SSM Parameter Store CSI Driver Provider
    const ssmProviderChart = cluster.addHelmChart('AWSSSMParameterStoreCSIDriverProvider', {
      chart: 'aws-ssm-parameter-store-csi-driver-provider',
      repository: 'https://aws.github.io/aws-ssm-parameter-store-csi-driver-provider',
      namespace: 'kube-system',
      version: '0.1.0'
    });

    // Create sample SSM parameters
    new ssm.StringParameter(this, 'SampleConfig', {
      parameterName: '/eks/app/config/database-url',
      stringValue: 'postgresql://localhost:5432/mydb',
      description: 'Sample database URL configuration'
    });

    new ssm.StringParameter(this, 'SampleFeatureFlag', {
      parameterName: '/eks/app/feature-flags/new-ui',
      stringValue: 'true',
      description: 'Sample feature flag'
    });
  }

  private installMetricsServer(cluster: eks.Cluster) {
    // Install Metrics Server
    cluster.addHelmChart('MetricsServer', {
      chart: 'metrics-server',
      repository: 'https://kubernetes-sigs.github.io/metrics-server/',
      namespace: 'kube-system',
      version: '3.11.0',
      values: {
        args: [
          '--cert-dir=/tmp',
          '--secure-port=4443',
          '--kubelet-preferred-address-types=InternalIP,ExternalIP,Hostname',
          '--kubelet-use-node-status-port'
        ]
      }
    });
  }

  private installContainerInsights(cluster: eks.Cluster) {
    // Install AWS Container Insights
    cluster.addHelmChart('AWSContainerInsights', {
      chart: 'aws-cloudwatch-metrics',
      repository: 'https://aws.github.io/eks-charts',
      namespace: 'amazon-cloudwatch',
      version: '0.0.11',
      values: {
        clusterName: cluster.clusterName,
        region: this.region
      }
    });

    // Install Fluent Bit for log forwarding
    cluster.addHelmChart('FluentBit', {
      chart: 'aws-for-fluent-bit',
      repository: 'https://aws.github.io/eks-charts',
      namespace: 'amazon-cloudwatch',
      version: '0.1.32',
      values: {
        cloudWatchLogs: {
          enabled: true,
          region: this.region,
          logGroupName: '/aws/containerinsights/' + cluster.clusterName + '/application'
        },
        firehose: {
          enabled: false
        },
        kinesis: {
          enabled: false
        }
      }
    });
  }

  private installKubernetesDashboard(cluster: eks.Cluster) {
    // Install Kubernetes Dashboard
    cluster.addHelmChart('KubernetesDashboard', {
      chart: 'kubernetes-dashboard',
      repository: 'https://kubernetes.github.io/dashboard/',
      namespace: 'kube-system',
      version: '6.0.8',
      values: {
        service: {
          type: 'ClusterIP'
        },
        rbac: {
          clusterAdminRole: false
        }
      }
    });
  }

  private configureRBAC(cluster: eks.Cluster) {
    // Create admin service account
    const adminServiceAccount = cluster.addServiceAccount('AdminServiceAccount', {
      name: 'admin-user',
      namespace: 'kube-system'
    });

    // Create cluster role binding for admin
    cluster.addManifest('AdminClusterRoleBinding', {
      apiVersion: 'rbac.authorization.k8s.io/v1',
      kind: 'ClusterRoleBinding',
      metadata: {
        name: 'admin-user'
      },
      roleRef: {
        apiGroup: 'rbac.authorization.k8s.io',
        kind: 'ClusterRole',
        name: 'cluster-admin'
      },
      subjects: [
        {
          kind: 'ServiceAccount',
          name: 'admin-user',
          namespace: 'kube-system'
        }
      ]
    });

    // Create read-only service account
    const readOnlyServiceAccount = cluster.addServiceAccount('ReadOnlyServiceAccount', {
      name: 'read-only-user',
      namespace: 'kube-system'
    });

    // Create cluster role binding for read-only
    cluster.addManifest('ReadOnlyClusterRoleBinding', {
      apiVersion: 'rbac.authorization.k8s.io/v1',
      kind: 'ClusterRoleBinding',
      metadata: {
        name: 'read-only-user'
      },
      roleRef: {
        apiGroup: 'rbac.authorization.k8s.io',
        kind: 'ClusterRole',
        name: 'view'
      },
      subjects: [
        {
          kind: 'ServiceAccount',
          name: 'read-only-user',
          namespace: 'kube-system'
        }
      ]
    });

    // Create network policies for pod security
    cluster.addManifest('DefaultNetworkPolicy', {
      apiVersion: 'networking.k8s.io/v1',
      kind: 'NetworkPolicy',
      metadata: {
        name: 'default-deny-all',
        namespace: 'default'
      },
      spec: {
        podSelector: {},
        policyTypes: ['Ingress', 'Egress']
      }
    });

    // Create pod security policy
    cluster.addManifest('PodSecurityPolicy', {
      apiVersion: 'policy/v1beta1',
      kind: 'PodSecurityPolicy',
      metadata: {
        name: 'restricted'
      },
      spec: {
        privileged: false,
        allowPrivilegeEscalation: false,
        requiredDropCapabilities: ['ALL'],
        volumes: [
          'configMap',
          'emptyDir',
          'projected',
          'secret',
          'downwardAPI',
          'persistentVolumeClaim'
        ],
        runAsUser: {
          rule: 'MustRunAsNonRoot'
        },
        seLinux: {
          rule: 'RunAsAny'
        },
        fsGroup: {
          rule: 'RunAsAny'
        }
      }
    });
  }
}
