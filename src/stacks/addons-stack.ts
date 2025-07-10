import * as cdk from 'aws-cdk-lib';
import * as eks from 'aws-cdk-lib/aws-eks';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { HelmChart } from 'aws-cdk-lib/aws-eks';
import { Construct } from 'constructs';

export interface AddonsStackProps extends cdk.StackProps {
  cluster: eks.Cluster;
  stackType?: 'core' | 'monitoring' | 'security' | 'storage' | 'networking' | 'all';
}

export class AddonsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AddonsStackProps) {
    super(scope, id, props);

    const { cluster, stackType = 'all' } = props;

    // Install production-grade add-ons based on stack type
    switch (stackType) {
      case 'core':
        this.installCoreAddons(cluster);
        break;
      case 'storage':
        this.installStorageAddons(cluster);
        break;
      case 'networking':
        this.installNetworkingAddons(cluster);
        break;
      case 'monitoring':
        this.installMonitoringAddons(cluster);
        break;
      case 'security':
        this.installSecurityAddons(cluster);
        this.configureRBAC(cluster);
        break;
      case 'all':
      default:
        // Full production deployment with proper ordering
        const coreResult = this.installCoreAddons(cluster);
        this.installStorageAddons(cluster);
        const networkingResult = this.installNetworkingAddons(cluster);
        
        // Add dependency: IngressNginx must wait for AWS LB Controller
        if (coreResult?.albControllerChart && networkingResult?.ingressNginxChart) {
          networkingResult.ingressNginxChart.node.addDependency(coreResult.albControllerChart);
        }
        
        this.installMonitoringAddons(cluster);
        this.installSecurityAddons(cluster);
        this.installOperationalAddons(cluster);
        this.configureRBAC(cluster);
        break;
    }
  }

  // ============================================================================
  // CORE ADDONS
  // ============================================================================
  private installCoreAddons(cluster: eks.Cluster) {
    // 1. AWS Load Balancer Controller (must be first)
    const albControllerChart = this.installAWSLoadBalancerController(cluster);
    
    // 2. Cluster Autoscaler
    this.installClusterAutoscaler(cluster);
    
    // 3. Metrics Server
    this.installMetricsServer(cluster);
    
    // 4. CoreDNS (managed addon)
    this.installCoreDNSAddon(cluster);
    
    // 5. VPC CNI (managed addon)
    this.installVPCCNIAddon(cluster);
    
    // 6. kube-proxy (managed addon)
    this.installKubeProxyAddon(cluster);
    
    return { albControllerChart };
  }

  // ============================================================================
  // STORAGE ADDONS
  // ============================================================================
  private installStorageAddons(cluster: eks.Cluster) {
    // 1. EBS CSI Driver
    this.installEBSCSIDriver(cluster);
    
    // 2. EFS CSI Driver
    this.installEFSCSIDriver(cluster);
    
    // 3. Secrets Manager CSI Driver
    this.installSecretsManagerCSIDriver(cluster);
    
    // 4. SSM Parameter Store CSI Driver
    this.installSSMParameterStoreCSIDriver(cluster);
  }

  // ============================================================================
  // NETWORKING ADDONS
  // ============================================================================
  private installNetworkingAddons(cluster: eks.Cluster) {
    // 1. External DNS
    this.installExternalDNS(cluster);
    
    // 2. AWS Node Termination Handler
    this.installNodeTerminationHandler(cluster);
    
    // 3. Cert Manager
    this.installCertManager(cluster);
    
    // 4. Ingress Nginx (alternative to ALB) - requires AWS LB Controller to be ready
    const ingressNginxChart = this.installIngressNginx(cluster);
    return { ingressNginxChart };
  }

  // ============================================================================
  // MONITORING ADDONS
  // ============================================================================
  private installMonitoringAddons(cluster: eks.Cluster) {
    // Create monitoring namespace first
    const monitoringNamespace = cluster.addManifest('MonitoringNamespace', {
      apiVersion: 'v1',
      kind: 'Namespace',
      metadata: {
        name: 'monitoring',
        labels: {
          'monitoring': 'true'
        }
      }
    });
    
    // 1. Prometheus
    const prometheusChart = this.installPrometheus(cluster);
    prometheusChart.node.addDependency(monitoringNamespace);
    
    // 2. Grafana
    const grafanaChart = this.installGrafana(cluster);
    grafanaChart.node.addDependency(monitoringNamespace);
    
    // 3. CloudWatch Container Insights
    this.installContainerInsights(cluster);
    
    // 4. Fluent Bit for logging
    this.installFluentBit(cluster);
    
    // 5. Kubernetes Dashboard
    this.installKubernetesDashboard(cluster);
  }

  // ============================================================================
  // SECURITY ADDONS
  // ============================================================================
  private installSecurityAddons(cluster: eks.Cluster) {
    // Create security namespace first
    const securityNamespace = cluster.addManifest('SecurityNamespace', {
      apiVersion: 'v1',
      kind: 'Namespace',
      metadata: {
        name: 'security',
        labels: {
          'pod-security.kubernetes.io/enforce': 'restricted',
          'pod-security.kubernetes.io/audit': 'restricted',
          'pod-security.kubernetes.io/warn': 'restricted'
        }
      }
    });
    
    // 1. Falco (runtime security)
    const falcoChart = this.installFalco(cluster);
    falcoChart.node.addDependency(securityNamespace);
    
    // 2. OPA Gatekeeper (policy enforcement) - uses its own namespace
    this.installOPAGatekeeper(cluster);
    
    // 3. Kube-bench (security benchmarking)
    const kubeBenchJob = this.installKubeBench(cluster);
    kubeBenchJob.node.addDependency(securityNamespace);
    
    // 4. Pod Security Standards enforcement
    this.configurePodSecurityStandards(cluster);
  }

  // ============================================================================
  // OPERATIONAL ADDONS
  // ============================================================================
  private installOperationalAddons(cluster: eks.Cluster) {
    // 1. Vertical Pod Autoscaler
    this.installVerticalPodAutoscaler(cluster);
    
    // 2. Horizontal Pod Autoscaler (keda)
    this.installKEDA(cluster);
    
    // 3. Goldilocks (resource recommendations)
    this.installGoldilocks(cluster);
    
    // 4. Kube State Metrics
    this.installKubeStateMetrics(cluster);
    
    // 5. Node Problem Detector
    this.installNodeProblemDetector(cluster);
  }

  // ============================================================================
  // CORE ADDON IMPLEMENTATIONS
  // ============================================================================
  private installCoreDNSAddon(cluster: eks.Cluster) {
    // CoreDNS managed addon
    const coreDnsAddon = new eks.CfnAddon(this, 'CoreDNSAddon', {
      clusterName: cluster.clusterName,
      addonName: 'coredns',
      resolveConflicts: 'OVERWRITE',
      tags: [
        { key: 'ManagedBy', value: 'CDK' },
        { key: 'Component', value: 'CoreDNS' }
      ]
    });
  }

  private installVPCCNIAddon(cluster: eks.Cluster) {
    // VPC CNI managed addon
    const vpcCniAddon = new eks.CfnAddon(this, 'VPCCNIAddon', {
      clusterName: cluster.clusterName,
      addonName: 'vpc-cni',
      resolveConflicts: 'OVERWRITE',
      tags: [
        { key: 'ManagedBy', value: 'CDK' },
        { key: 'Component', value: 'VPC-CNI' }
      ]
    });
  }

  private installKubeProxyAddon(cluster: eks.Cluster) {
    // kube-proxy managed addon
    const kubeProxyAddon = new eks.CfnAddon(this, 'KubeProxyAddon', {
      clusterName: cluster.clusterName,
      addonName: 'kube-proxy',
      resolveConflicts: 'OVERWRITE',
      tags: [
        { key: 'ManagedBy', value: 'CDK' },
        { key: 'Component', value: 'kube-proxy' }
      ]
    });
  }

  // ============================================================================
  // NETWORKING ADDON IMPLEMENTATIONS
  // ============================================================================
  private installExternalDNS(cluster: eks.Cluster) {
    // External DNS for automatic DNS record management
    const externalDnsChart = new HelmChart(this, 'ExternalDNS', {
      cluster,
      chart: 'external-dns',
      repository: 'https://kubernetes-sigs.github.io/external-dns/',
      namespace: 'kube-system',
      values: {
        provider: 'aws',
        aws: {
          region: this.region,
          zoneType: 'public'
        },
        txtOwnerId: cluster.clusterName,
        logLevel: 'info',
        policy: 'sync',
        registry: 'txt',
        sources: ['service', 'ingress'],
        rbac: { create: true }
      }
    });
  }

  private installNodeTerminationHandler(cluster: eks.Cluster) {
    // AWS Node Termination Handler for graceful shutdowns
    const nodeTerminationHandler = new HelmChart(this, 'NodeTerm', {
      cluster,
      chart: 'aws-node-termination-handler',
      repository: 'https://aws.github.io/eks-charts',
      namespace: 'kube-system',
      values: {
        enableSpotInterruptionDraining: true,
        enableRebalanceMonitoring: true,
        enableScheduledEventDraining: true,
        instanceMetadataPolicy: 'require',
        nodeSelector: {
          'eks.amazonaws.com/capacityType': 'SPOT'
        }
      }
    });
  }

  private installCertManager(cluster: eks.Cluster) {
    // Cert Manager for TLS certificate management
    const certManagerChart = new HelmChart(this, 'CertManager', {
      cluster,
      chart: 'cert-manager',
      repository: 'https://charts.jetstack.io',
      namespace: 'cert-manager',
      createNamespace: true,
      values: {
        installCRDs: true,
        global: {
          rbac: { create: true }
        },
        serviceAccount: {
          create: true,
          name: 'cert-manager'
        }
      }
    });
  }

  private installIngressNginx(cluster: eks.Cluster) {
    // Ingress Nginx as alternative to ALB
    const ingressNginxChart = new HelmChart(this, 'NgxIngress', {
      cluster,
      chart: 'ingress-nginx',
      repository: 'https://kubernetes.github.io/ingress-nginx',
      namespace: 'ingress-nginx',
      createNamespace: true,
      release: 'nginx-ingress',
      values: {
        controller: {
          ingressClassResource: {
            name: 'nginx-ingress',
            controllerValue: 'k8s.io/nginx-ingress'
          },
          service: {
            type: 'LoadBalancer',
            annotations: {
              'service.beta.kubernetes.io/aws-load-balancer-type': 'nlb',
              'service.beta.kubernetes.io/aws-load-balancer-cross-zone-load-balancing-enabled': 'true'
            }
          },
          metrics: {
            enabled: true,
            serviceMonitor: {
              enabled: false  // Disable until Prometheus CRDs are installed
            }
          }
        }
      }
    });
    
    return ingressNginxChart;
  }

  // ============================================================================
  // MONITORING ADDON IMPLEMENTATIONS
  // ============================================================================
  private installPrometheus(cluster: eks.Cluster) {
    // Prometheus for metrics collection
    const prometheusChart = new HelmChart(this, 'Prometheus', {
      cluster,
      chart: 'kube-prometheus-stack',
      repository: 'https://prometheus-community.github.io/helm-charts',
      namespace: 'monitoring',
      createNamespace: false, // We create namespace explicitly now
      values: {
        prometheusOperator: {
          enabled: true
        },
        prometheus: {
          prometheusSpec: {
            retention: '30d',
            storageSpec: {
              volumeClaimTemplate: {
                spec: {
                  storageClassName: 'gp3',
                  accessModes: ['ReadWriteOnce'],
                  resources: {
                    requests: {
                      storage: '50Gi'
                    }
                  }
                }
              }
            }
          }
        },
        grafana: {
          enabled: true,
          adminPassword: 'admin'
        }
      }
    });
    return prometheusChart;
  }

  private installGrafana(cluster: eks.Cluster) {
    // Grafana for visualization (standalone if not using kube-prometheus-stack)
    const grafanaChart = new HelmChart(this, 'Grafana', {
      cluster,
      chart: 'grafana',
      repository: 'https://grafana.github.io/helm-charts',
      namespace: 'monitoring',
      createNamespace: false, // We create namespace explicitly now
      values: {
        adminPassword: 'admin',
        persistence: {
          enabled: true,
          storageClassName: 'gp3',
          size: '10Gi'
        },
        service: {
          type: 'LoadBalancer'
        }
      }
    });
    return grafanaChart;
  }

  private installFluentBit(cluster: eks.Cluster) {
    // Fluent Bit for log collection
    const fluentBitChart = new HelmChart(this, 'FluentBit', {
      cluster,
      chart: 'fluent-bit',
      repository: 'https://fluent.github.io/helm-charts',
      namespace: 'logging',
      createNamespace: true,
      values: {
        config: {
          outputs: `
            [OUTPUT]
                Name cloudwatch_logs
                Match *
                region ${this.region}
                log_group_name /aws/eks/${cluster.clusterName}/fluent-bit
                log_stream_name fluent-bit
                auto_create_group true
          `
        }
      }
    });
  }

  // ============================================================================
  // SECURITY ADDON IMPLEMENTATIONS
  // ============================================================================
  private installFalco(cluster: eks.Cluster) {
    // Falco for runtime security monitoring
    const falcoChart = new HelmChart(this, 'Falco', {
      cluster,
      chart: 'falco',
      repository: 'https://falcosecurity.github.io/charts',
      namespace: 'security',
      createNamespace: false, // We create namespace explicitly now
      values: {
        falco: {
          grpc: {
            enabled: true
          },
          grpcOutput: {
            enabled: true
          }
        }
      }
    });
    return falcoChart;
  }

  private installOPAGatekeeper(cluster: eks.Cluster) {
    // OPA Gatekeeper for policy enforcement
    const gatekeeperChart = new HelmChart(this, 'OPA', {
      cluster,
      chart: 'gatekeeper',
      repository: 'https://open-policy-agent.github.io/gatekeeper/charts',
      namespace: 'gatekeeper-system',
      createNamespace: true,
      values: {
        replicas: 3,
        auditInterval: 60,
        constraintViolationsLimit: 20
      }
    });
  }

  private installKubeBench(cluster: eks.Cluster) {
    // Kube-bench for CIS benchmarking
    const kubeBenchJob = cluster.addManifest('KubeBenchJob', {
      apiVersion: 'batch/v1',
      kind: 'Job',
      metadata: {
        name: 'kube-bench',
        namespace: 'security'
      },
      spec: {
        template: {
          spec: {
            hostPID: true,
            containers: [{
              name: 'kube-bench',
              image: 'aquasec/kube-bench:latest',
              command: ['kube-bench'],
              args: ['--version', '1.6.0'],
              volumeMounts: [{
                name: 'var-lib-etcd',
                mountPath: '/var/lib/etcd',
                readOnly: true
              }]
            }],
            restartPolicy: 'Never',
            volumes: [{
              name: 'var-lib-etcd',
              hostPath: {
                path: '/var/lib/etcd'
              }
            }]
          }
        }
      }
    });
    return kubeBenchJob;
  }

  private configurePodSecurityStandards(cluster: eks.Cluster) {
    // Configure Pod Security Standards for all namespaces
    cluster.addManifest('PodSecurityStandards', {
      apiVersion: 'v1',
      kind: 'Namespace',
      metadata: {
        name: 'security-restricted',
        labels: {
          'pod-security.kubernetes.io/enforce': 'restricted',
          'pod-security.kubernetes.io/audit': 'restricted',
          'pod-security.kubernetes.io/warn': 'restricted'
        }
      }
    });
  }

  // ============================================================================
  // OPERATIONAL ADDON IMPLEMENTATIONS
  // ============================================================================
  private installVerticalPodAutoscaler(cluster: eks.Cluster) {
    // Vertical Pod Autoscaler
    const vpaChart = new HelmChart(this, 'VPA', {
      cluster,
      chart: 'vpa',
      repository: 'https://charts.fairwinds.com/stable',
      namespace: 'vpa',
      createNamespace: true,
      values: {
        recommender: {
          enabled: true
        },
        updater: {
          enabled: true
        },
        admissionController: {
          enabled: true
        }
      }
    });
  }

  private installKEDA(cluster: eks.Cluster) {
    // KEDA for advanced auto-scaling
    const kedaChart = new HelmChart(this, 'KEDA', {
      cluster,
      chart: 'keda',
      repository: 'https://kedacore.github.io/charts',
      namespace: 'keda',
      createNamespace: true,
      values: {
        metricsServer: {
          enabled: true
        },
        prometheus: {
          metricServer: {
            enabled: true
          }
        }
      }
    });
  }

  private installGoldilocks(cluster: eks.Cluster) {
    // Goldilocks for resource recommendations
    const goldilocksChart = new HelmChart(this, 'Goldilocks', {
      cluster,
      chart: 'goldilocks',
      repository: 'https://charts.fairwinds.com/stable',
      namespace: 'goldilocks',
      createNamespace: true,
      values: {
        vpa: {
          enabled: true
        },
        dashboard: {
          enabled: true
        }
      }
    });
  }

  private installKubeStateMetrics(cluster: eks.Cluster) {
    // Kube State Metrics for cluster state metrics
    const kubeStateMetricsChart = new HelmChart(this, 'KubeSM', {
      cluster,
      chart: 'kube-state-metrics',
      repository: 'https://prometheus-community.github.io/helm-charts',
      namespace: 'monitoring',
      createNamespace: false, // We create namespace explicitly now
      values: {
        prometheus: {
          monitor: {
            enabled: true
          }
        }
      }
    });
  }

  private installNodeProblemDetector(cluster: eks.Cluster) {
    // Node Problem Detector for node issues
    const nodeProblemDetectorChart = new HelmChart(this, 'NodePD', {
      cluster,
      chart: 'node-problem-detector',
      repository: 'https://kubernetes-sigs.github.io/node-problem-detector',
      namespace: 'kube-system',
      values: {
        metrics: {
          enabled: true,
          serviceMonitor: {
            enabled: false  // Disable until Prometheus CRDs are installed
          }
        }
      }
    });
  }

  // ============================================================================
  // EXISTING METHODS (AWS Load Balancer Controller, etc.)
  // ============================================================================
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
    const albControllerChart = new HelmChart(this, 'ALBCtrl', {
      cluster,
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
    return albControllerChart;
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
    const clusterAutoscalerChart = new HelmChart(this, 'ClusterAutoscaler', {
      cluster,
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
    const secretsManagerChart = new HelmChart(this, 'SecretsManagerCSIDriver', {
      cluster,
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
    const awsSecretsProviderChart = new HelmChart(this, 'AWSSecretsManagerCSIDriverProvider', {
      cluster,
      chart: 'secrets-store-csi-driver-provider-aws',
      repository: 'https://aws.github.io/secrets-store-csi-driver-provider-aws',
      namespace: 'kube-system',
      version: '1.0.1'
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
    // Note: SSM Parameter Store CSI Driver Provider is not available as a standalone Helm chart
    // This functionality is included in the Secrets Store CSI Driver
    // Creating sample SSM parameters for demonstration
    
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
    new HelmChart(this, 'MetricsServer', {
      cluster,
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
    new HelmChart(this, 'AWSContainerInsights', {
      cluster,
      chart: 'aws-cloudwatch-metrics',
      repository: 'https://aws.github.io/eks-charts',
      namespace: 'amazon-cloudwatch',
      version: '0.0.11',
      values: {
        clusterName: cluster.clusterName,
        region: this.region
      }
    });

    // Fluent Bit is now installed separately in the monitoring addons
  }

  private installKubernetesDashboard(cluster: eks.Cluster) {
    // Install Kubernetes Dashboard
    new HelmChart(this, 'KubernetesDashboard', {
      cluster,
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

    // Note: PodSecurityPolicy removed as it's deprecated in Kubernetes 1.25+
    // EKS 1.28+ uses Pod Security Standards instead which are enabled by default
  }
}
