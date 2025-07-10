export interface EnvironmentConfig {
  name: string;
  account: string;
  region: string;
  tags: Record<string, string>;
  moduleName: string;
  projectName: string;
  stackNamePrefix?: string;
  features?: {
    enableAddons?: boolean;
    enableNodeGroups?: boolean;
    enableOidcTrust?: boolean;
    clusterType?: 'minimal' | 'production';
  };
}

export const environments: Record<string, EnvironmentConfig> = {
  dev: {
    name: 'dev',
    moduleName: 'platform',
    projectName: 'eks-cluster',
    account: process.env.DEV_AWS_ACCOUNT_ID || '276824024738',
    region: process.env.DEV_AWS_REGION || 'us-east-1',
    stackNamePrefix: 'platform-eks-cluster-dev',
    tags: {
      Environment: 'development',
      Project: 'eks-cluster',
      ManagedBy: 'CDK',
      CostCenter: 'development'
    },
    features: {
      enableAddons: true,
      enableNodeGroups: true,
      enableOidcTrust: false,
      clusterType: 'production'
    }
  },
  staging: {
    name: 'staging',
    moduleName: 'demo-app',
    projectName: 'eks-cluster',
    account: process.env.STAGING_AWS_ACCOUNT_ID || '123456789013',
    region: process.env.STAGING_AWS_REGION || 'us-east-1',
    stackNamePrefix: 'demo-app-eks-cluster-staging',
    tags: {
      Environment: 'staging',
      Project: 'eks-cluster',
      ManagedBy: 'CDK',
      CostCenter: 'staging'
    },
    features: {
      enableAddons: true,
      enableNodeGroups: true,
      enableOidcTrust: false
    }
  },
  prod: {
    name: 'prod',
    moduleName: 'demo-app',
    projectName: 'eks-cluster',
    account: process.env.PROD_AWS_ACCOUNT_ID || '123456789014',
    region: process.env.PROD_AWS_REGION || 'us-east-1',
    stackNamePrefix: 'demo-app-eks-cluster-prod',
    tags: {
      Environment: 'production',
      Project: 'eks-cluster',
      ManagedBy: 'CDK',
      CostCenter: 'production'
    },
    features: {
      enableAddons: true,
      enableNodeGroups: true,
      enableOidcTrust: true
    }
  }
};

export function getEnvironmentConfig(envName?: string): EnvironmentConfig {
  const environment = envName || process.env.ENVIRONMENT || 'dev';
  
  if (!environments[environment]) {
    throw new Error(`Environment '${environment}' not found. Available environments: ${Object.keys(environments).join(', ')}`);
  }
  
  return environments[environment];
}
