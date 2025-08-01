# Interview Deck - Complete Deployment Guide

This guide documents all steps performed to deploy the Interview Deck application to AWS EKS with HTTPS, database, and OAuth2 authentication.

## Table of Contents
1. [Environment Setup](#environment-setup)
2. [Infrastructure Deployment](#infrastructure-deployment)
3. [Application Deployment](#application-deployment)
4. [Database Setup](#database-setup)
5. [HTTPS & DNS Configuration](#https--dns-configuration)
6. [OAuth2 Configuration](#oauth2-configuration)
7. [Troubleshooting Guide](#troubleshooting-guide)
8. [Fresh Environment Setup](#fresh-environment-setup)

---

## Environment Setup

### Prerequisites
- AWS CLI configured with appropriate permissions
- Docker Desktop installed
- kubectl installed
- Helm 3.x installed
- Node.js and npm/pnpm installed
- Java 17 and Maven installed
- Git repository access

### AWS CLI Configuration
```bash
aws configure
# Enter your AWS credentials, region (us-east-1), and output format (json)
```

---

## Infrastructure Deployment

### 1. EKS Cluster Creation
```bash
# Navigate to CDK project
cd /path/to/eks-cluster-cdk

# Install dependencies
npm install

# Deploy CDK stack
npx cdk deploy --all --require-approval never
```

### 2. Configure kubectl Access
```bash
# Update kubeconfig for EKS cluster
aws eks update-kubeconfig --name sats-portals-eks-cluster --region us-east-1

# Verify cluster access
kubectl get nodes
kubectl get namespaces
```

### 3. Create Application Namespace
```bash
kubectl create namespace interviewdeck
```

---

## Application Deployment

### 1. Build and Push Docker Images

#### Frontend Image
```bash
cd /path/to/interview-deck-io/interviewdeck-io-frontend

# Build Docker image
docker build -t interviewdeck-frontend:latest .

# Get ECR login token
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 276824024738.dkr.ecr.us-east-1.amazonaws.com

# Tag and push to ECR
docker tag interviewdeck-frontend:latest 276824024738.dkr.ecr.us-east-1.amazonaws.com/interviewdeck-frontend:latest
docker push 276824024738.dkr.ecr.us-east-1.amazonaws.com/interviewdeck-frontend:latest
```

#### Backend Image
```bash
cd /path/to/interview-deck-io/interviewdeck-io-backend

# Build Java application
mvn clean package -DskipTests

# Build Docker image (with platform specification for EKS compatibility)
docker build --platform linux/amd64 -t interviewdeck-backend:latest .

# Tag and push to ECR
docker tag interviewdeck-backend:latest 276824024738.dkr.ecr.us-east-1.amazonaws.com/interviewdeck-backend:latest
docker push 276824024738.dkr.ecr.us-east-1.amazonaws.com/interviewdeck-backend:latest
```

### 2. Deploy Applications with Helm

#### Deploy Frontend
```bash
cd /path/to/eks-cluster-cdk
helm install interviewdeck-frontend ./helm-charts/interviewdeck-frontend -n interviewdeck
```

#### Deploy Backend
```bash
helm install interviewdeck-backend ./helm-charts/interviewdeck-backend -n interviewdeck
```

### 3. Create Load Balancer Service
```bash
# Apply load balancer configuration
kubectl apply -f - <<EOF
apiVersion: v1
kind: Service
metadata:
  name: interviewdeck-frontend-lb
  namespace: interviewdeck
  annotations:
    service.beta.kubernetes.io/aws-load-balancer-type: "nlb"
spec:
  type: LoadBalancer
  selector:
    app.kubernetes.io/name: interviewdeck-frontend
  ports:
    - protocol: TCP
      port: 80
      targetPort: 80
EOF
```

### 4. Verify Deployment
```bash
# Check all pods are running
kubectl get pods -n interviewdeck

# Check services
kubectl get svc -n interviewdeck

# Get load balancer URL
kubectl get svc interviewdeck-frontend-lb -n interviewdeck -o jsonpath='{.status.loadBalancer.ingress[0].hostname}'
```

---

## Database Setup

### 1. Create PostgreSQL EC2 Instance
```bash
# Launch EC2 instance (use CDK or manual creation)
# Instance type: t3.micro or larger
# Security group: Allow port 5432 from VPC CIDR (10.0.0.0/16)
# Key pair: interviewdeck-key

# Get instance details
aws ec2 describe-instances --filters "Name=tag:Name,Values=interviewdeck-postgres" --query 'Reservations[*].Instances[*].[Tags[?Key==`Name`].Value|[0],State.Name,PublicIpAddress,PrivateIpAddress,InstanceId]' --output table
```

### 2. Setup PostgreSQL on EC2
```bash
# Copy PEM key to local SSH directory
cp /tmp/interviewdeck-key.pem ~/.ssh/
chmod 600 ~/.ssh/interviewdeck-key.pem

# Connect to EC2 instance
ssh -i ~/.ssh/interviewdeck-key.pem ec2-user@<EC2_PUBLIC_IP>

# Install PostgreSQL on EC2 (Amazon Linux 2)
sudo yum update -y
sudo yum install -y postgresql13-server
sudo postgresql-setup initdb
sudo systemctl enable postgresql
sudo systemctl start postgresql

# Configure PostgreSQL
sudo -u postgres psql -c "CREATE DATABASE interviewdeck;"
sudo -u postgres psql -c "CREATE USER interviewdeck WITH PASSWORD 'interviewdeck123';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE interviewdeck TO interviewdeck;"

# Update pg_hba.conf for network access
sudo sed -i 's/host    all             all             127.0.0.1\/32            ident/host    all             all             127.0.0.1\/32            md5/' /var/lib/pgsql/data/pg_hba.conf
echo "host all all 10.0.0.0/16 md5" | sudo tee -a /var/lib/pgsql/data/pg_hba.conf

# Update postgresql.conf for network listening
sudo sed -i "s/#listen_addresses = 'localhost'/listen_addresses = '*'/" /var/lib/pgsql/data/postgresql.conf

# Restart PostgreSQL
sudo systemctl restart postgresql
```

### 3. Create Database Configuration Secret
```bash
# Create Kubernetes secret with database connection details
kubectl create secret generic database-config -n interviewdeck \
  --from-literal=SPRING_DATASOURCE_URL="jdbc:postgresql://<EC2_PRIVATE_IP>:5432/interviewdeck" \
  --from-literal=SPRING_DATASOURCE_USERNAME="interviewdeck" \
  --from-literal=SPRING_DATASOURCE_PASSWORD="interviewdeck123" \
  --from-literal=SPRING_DATASOURCE_DRIVER_CLASS_NAME="org.postgresql.Driver" \
  --from-literal=SPRING_JPA_DATABASE_PLATFORM="org.hibernate.dialect.PostgreSQLDialect" \
  --from-literal=SPRING_JPA_HIBERNATE_DDL_AUTO="update" \
  --from-literal=SPRING_JPA_SHOW_SQL="false"
```

### 4. Test Database Connection
```bash
# Test connection from within cluster
kubectl run test-db-connection --image=postgres:13 --rm -i --restart=Never -n interviewdeck -- psql "postgresql://interviewdeck:interviewdeck123@<EC2_PRIVATE_IP>:5432/interviewdeck" -c "SELECT 1 as test;"
```

---

## HTTPS & DNS Configuration

### 1. Setup Route53 Domain
```bash
# Create Route53 hosted zone (if not exists)
aws route53 create-hosted-zone --name interviewdeck.io --caller-reference $(date +%s)

# Get name servers
aws route53 get-hosted-zone --id <HOSTED_ZONE_ID>
```

### 2. Create CloudFront Distribution
```bash
# Get load balancer hostname
LB_HOSTNAME=$(kubectl get svc interviewdeck-frontend-lb -n interviewdeck -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')

# Create CloudFront distribution (via AWS Console or CLI)
aws cloudfront create-distribution --distribution-config '{
  "CallerReference": "interviewdeck-'$(date +%s)'",
  "Aliases": {
    "Quantity": 2,
    "Items": ["interviewdeck.io", "www.interviewdeck.io"]
  },
  "DefaultRootObject": "index.html",
  "Origins": {
    "Quantity": 1,
    "Items": [
      {
        "Id": "ELB-origin",
        "DomainName": "'$LB_HOSTNAME'",
        "CustomOriginConfig": {
          "HTTPPort": 80,
          "HTTPSPort": 443,
          "OriginProtocolPolicy": "http-only"
        }
      }
    ]
  },
  "DefaultCacheBehavior": {
    "TargetOriginId": "ELB-origin",
    "ViewerProtocolPolicy": "redirect-to-https",
    "AllowedMethods": {
      "Quantity": 7,
      "Items": ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    },
    "ForwardedValues": {
      "QueryString": true,
      "Headers": {
        "Quantity": 1,
        "Items": ["*"]
      }
    }
  },
  "Enabled": true,
  "ViewerCertificate": {
    "AcmCertificateArn": "<SSL_CERTIFICATE_ARN>",
    "SSLSupportMethod": "sni-only"
  }
}'
```

### 3. Create SSL Certificate
```bash
# Request SSL certificate
aws acm request-certificate \
  --domain-name interviewdeck.io \
  --subject-alternative-names www.interviewdeck.io \
  --validation-method DNS \
  --region us-east-1

# Get certificate details for DNS validation
aws acm describe-certificate --certificate-arn <CERTIFICATE_ARN>
```

### 4. Update DNS Records
```bash
# Create A record for main domain
aws route53 change-resource-record-sets --hosted-zone-id <HOSTED_ZONE_ID> --change-batch '{
  "Changes": [{
    "Action": "CREATE",
    "ResourceRecordSet": {
      "Name": "interviewdeck.io",
      "Type": "A",
      "AliasTarget": {
        "DNSName": "<CLOUDFRONT_DOMAIN>",
        "EvaluateTargetHealth": false,
        "HostedZoneId": "Z2FDTNDATAQYW2"
      }
    }
  }]
}'

# Create A record for www subdomain
aws route53 change-resource-record-sets --hosted-zone-id <HOSTED_ZONE_ID> --change-batch '{
  "Changes": [{
    "Action": "CREATE",
    "ResourceRecordSet": {
      "Name": "www.interviewdeck.io",
      "Type": "A",
      "AliasTarget": {
        "DNSName": "<CLOUDFRONT_DOMAIN>",
        "EvaluateTargetHealth": false,
        "HostedZoneId": "Z2FDTNDATAQYW2"
      }
    }
  }]
}'
```

---

## OAuth2 Configuration

### 1. Update Backend Configuration for Production
```bash
# Create OAuth2 configuration secret
kubectl create secret generic oauth2-config -n interviewdeck \
  --from-literal=OAUTH2_REDIRECT_URI="https://interviewdeck.io/api/login/oauth2/code/google" \
  --from-literal=FRONTEND_URL="https://interviewdeck.io"
```

### 2. Update Backend Helm Values
Edit `helm-charts/interviewdeck-backend/values.yaml`:
```yaml
env:
  - name: SPRING_PROFILES_ACTIVE
    value: "prod"
  - name: SERVER_PORT
    value: "8080"
  - name: OAUTH2_REDIRECT_URI
    valueFrom:
      secretKeyRef:
        name: oauth2-config
        key: OAUTH2_REDIRECT_URI
  - name: FRONTEND_URL
    valueFrom:
      secretKeyRef:
        name: oauth2-config
        key: FRONTEND_URL

envFrom:
  - secretRef:
      name: database-config
```

### 3. Rebuild and Deploy Backend
```bash
# Rebuild backend with updated OAuth2 configuration
cd /path/to/interview-deck-io/interviewdeck-io-backend
mvn clean package -DskipTests
docker build --platform linux/amd64 -t interviewdeck-backend:latest .
docker tag interviewdeck-backend:latest 276824024738.dkr.ecr.us-east-1.amazonaws.com/interviewdeck-backend:latest
docker push 276824024738.dkr.ecr.us-east-1.amazonaws.com/interviewdeck-backend:latest

# Upgrade Helm deployment
cd /path/to/eks-cluster-cdk
helm upgrade interviewdeck-backend ./helm-charts/interviewdeck-backend -n interviewdeck --reset-values
```

### 4. Configure Google OAuth2 Client
In Google Cloud Console:
1. Go to APIs & Credentials
2. Edit OAuth2 client with ID: `1081485295264-0per5dp76vlsp39jj9b1b9i5r2ml813i.apps.googleusercontent.com`
3. Add Authorized JavaScript origins:
   - `https://interviewdeck.io`
   - `https://www.interviewdeck.io`
4. Add Authorized redirect URIs:
   - `https://interviewdeck.io/api/login/oauth2/code/google`
   - `https://www.interviewdeck.io/api/login/oauth2/code/google`

---

## Troubleshooting Guide

### Issue 1: Backend Pods Not Ready / Restarting
**Problem**: Backend pods failing health checks or restarting repeatedly.

**Symptoms**:
```bash
kubectl get pods -n interviewdeck
# Shows pods with 0/1 Ready or CrashLoopBackOff status
```

**Solution**:
```bash
# Check pod logs
kubectl logs <pod-name> -n interviewdeck

# Common causes and fixes:
# 1. Database connection issues
kubectl run test-db-connection --image=postgres:13 --rm -i --restart=Never -n interviewdeck -- psql "postgresql://interviewdeck:interviewdeck123@<DB_IP>:5432/interviewdeck" -c "SELECT 1;"

# 2. Increase health check timeouts
# Update helm-charts/interviewdeck-backend/values.yaml:
livenessProbe:
  httpGet:
    path: /actuator/health
    port: http
  initialDelaySeconds: 120  # Increased from 90
  periodSeconds: 30
  timeoutSeconds: 5
  failureThreshold: 5

readinessProbe:
  httpGet:
    path: /actuator/health
    port: http
  initialDelaySeconds: 90   # Increased from 60
  periodSeconds: 10
  timeoutSeconds: 5
  failureThreshold: 10

# Apply changes
helm upgrade interviewdeck-backend ./helm-charts/interviewdeck-backend -n interviewdeck
```

### Issue 2: Database Authentication Failed
**Problem**: Backend can't connect to PostgreSQL database.

**Symptoms**:
```
FATAL: password authentication failed for user "interviewdeck"
```

**Solution**:
```bash
# 1. Check and fix PostgreSQL configuration
ssh -i ~/.ssh/interviewdeck-key.pem ec2-user@<EC2_IP>
sudo -u postgres psql -c "ALTER USER interviewdeck PASSWORD 'interviewdeck123';"

# 2. Update pg_hba.conf for network access
sudo sed -i 's/host    all             all             127.0.0.1\/32            ident/host    all             all             127.0.0.1\/32            md5/' /var/lib/pgsql/data/pg_hba.conf

# 3. Restart PostgreSQL
sudo systemctl reload postgresql

# 4. Test connection from cluster
kubectl run test-db-connection --image=postgres:13 --rm -i --restart=Never -n interviewdeck -- psql "postgresql://interviewdeck:interviewdeck123@<DB_IP>:5432/interviewdeck" -c "SELECT 1;"
```

### Issue 3: Docker Image Platform Compatibility
**Problem**: ErrImagePull with platform mismatch error.

**Symptoms**:
```
no match for platform in manifest: not found
```

**Solution**:
```bash
# Build with explicit platform for EKS (AMD64)
docker build --platform linux/amd64 -t interviewdeck-backend:latest .
docker tag interviewdeck-backend:latest 276824024738.dkr.ecr.us-east-1.amazonaws.com/interviewdeck-backend:latest
docker push 276824024738.dkr.ecr.us-east-1.amazonaws.com/interviewdeck-backend:latest

# Force pod restart
kubectl rollout restart deployment interviewdeck-backend -n interviewdeck
```

### Issue 4: OAuth2 Redirecting to Localhost
**Problem**: Google OAuth2 redirects to localhost instead of production domain.

**Symptoms**:
```
Redirect URL: http://localhost:8080/login/oauth2/code/google
```

**Solution**:
```bash
# 1. Create OAuth2 configuration secret
kubectl create secret generic oauth2-config -n interviewdeck \
  --from-literal=OAUTH2_REDIRECT_URI="https://interviewdeck.io/api/login/oauth2/code/google" \
  --from-literal=FRONTEND_URL="https://interviewdeck.io"

# 2. Update backend configuration to use environment variables
# Edit auth-service/src/main/resources/application.properties:
spring.security.oauth2.client.registration.google.redirect-uri=${OAUTH2_REDIRECT_URI:http://localhost:8080/login/oauth2/code/google}
app.oauth2.authorized-redirect-uri=${FRONTEND_URL:http://localhost:3000}/auth/callback

# 3. Rebuild and redeploy backend
mvn clean package -DskipTests
docker build --platform linux/amd64 -t interviewdeck-backend:latest .
docker push 276824024738.dkr.ecr.us-east-1.amazonaws.com/interviewdeck-backend:latest
helm upgrade interviewdeck-backend ./helm-charts/interviewdeck-backend -n interviewdeck --reset-values
```

### Issue 5: Helm Values Not Applied
**Problem**: Updated Helm values not taking effect.

**Solution**:
```bash
# Reset values and force update
helm upgrade <release-name> <chart-path> -n <namespace> --reset-values

# Or force recreation of pods
kubectl delete pods -l app.kubernetes.io/name=<app-name> -n <namespace>
```

### Issue 6: EBS Volume Provisioning Failed
**Problem**: PVC stuck in pending state due to EBS permission issues.

**Solution**:
```bash
# Check PVC status
kubectl describe pvc <pvc-name> -n <namespace>

# Common cause: Node group IAM role missing EBS permissions
# Add EBS CSI policy to node group role:
aws iam attach-role-policy \
  --role-name <node-group-role-name> \
  --policy-arn arn:aws:iam::aws:policy/service-role/Amazon_EBS_CSI_DriverPolicy

# Or use external database instead of in-cluster PostgreSQL
```

### Issue 7: CloudFront Cache Issues
**Problem**: Changes not reflecting due to CloudFront caching.

**Solution**:
```bash
# Create invalidation
aws cloudfront create-invalidation \
  --distribution-id <DISTRIBUTION_ID> \
  --paths "/*"

# Check invalidation status
aws cloudfront get-invalidation \
  --distribution-id <DISTRIBUTION_ID> \
  --id <INVALIDATION_ID>
```

---

## Fresh Environment Setup

### Prerequisites Checklist
- [ ] AWS CLI configured
- [ ] Docker Desktop running
- [ ] kubectl installed
- [ ] Helm 3.x installed
- [ ] Node.js/npm/pnpm installed
- [ ] Java 17 and Maven installed
- [ ] Domain name registered and NS records pointed to Route53

### Step-by-Step Fresh Deployment

#### 1. Infrastructure Setup (30-45 minutes)
```bash
# Clone repository
git clone <repository-url>
cd eks-cluster-cdk

# Install dependencies and deploy infrastructure
npm install
npx cdk bootstrap
npx cdk deploy --all --require-approval never

# Configure kubectl
aws eks update-kubeconfig --name sats-portals-eks-cluster --region us-east-1
kubectl get nodes  # Verify cluster access
```

#### 2. Container Registry Setup (5 minutes)
```bash
# Create ECR repositories
aws ecr create-repository --repository-name interviewdeck-frontend --region us-east-1
aws ecr create-repository --repository-name interviewdeck-backend --region us-east-1
```

#### 3. Database Setup (15-20 minutes)
```bash
# Launch EC2 instance for PostgreSQL
aws ec2 run-instances \
  --image-id ami-0c02fb55956c7d316 \
  --instance-type t3.micro \
  --key-name interviewdeck-key \
  --security-group-ids <sg-id> \
  --subnet-id <subnet-id> \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=interviewdeck-postgres}]'

# Get instance IP and setup PostgreSQL (see Database Setup section above)
```

#### 4. Application Build and Deploy (20-30 minutes)
```bash
# Build and push images (see Application Deployment section)
# Deploy with Helm (see Application Deployment section)
# Create database secrets and configurations
```

#### 5. HTTPS and DNS Setup (45-60 minutes)
```bash
# Request SSL certificate
# Create CloudFront distribution
# Update Route53 records
# Wait for DNS propagation (up to 48 hours for NS records)
```

#### 6. OAuth2 Configuration (10 minutes)
```bash
# Update Google OAuth2 client configuration
# Deploy updated backend with production OAuth2 settings
```

### Total Estimated Time: 2-3 hours (excluding DNS propagation)

### Verification Commands
```bash
# Check all components
kubectl get all -n interviewdeck
kubectl get secrets -n interviewdeck
kubectl get pvc -n interviewdeck

# Test application endpoints
curl -I https://interviewdeck.io
curl https://interviewdeck.io/api/actuator/health

# Test database connection
kubectl run test-db --image=postgres:13 --rm -i --restart=Never -n interviewdeck -- psql "postgresql://interviewdeck:interviewdeck123@<DB_IP>:5432/interviewdeck" -c "SELECT version();"
```

---

## Useful Commands Reference

### Kubernetes Management
```bash
# Pod management
kubectl get pods -n interviewdeck
kubectl logs <pod-name> -n interviewdeck --tail=50
kubectl describe pod <pod-name> -n interviewdeck
kubectl delete pod <pod-name> -n interviewdeck

# Service management
kubectl get svc -n interviewdeck
kubectl port-forward service/<service-name> 8080:8080 -n interviewdeck

# Secret management
kubectl get secrets -n interviewdeck
kubectl describe secret <secret-name> -n interviewdeck
kubectl create secret generic <name> --from-literal=key=value -n interviewdeck

# Deployment management
kubectl rollout restart deployment <deployment-name> -n interviewdeck
kubectl rollout status deployment <deployment-name> -n interviewdeck
kubectl scale deployment <deployment-name> --replicas=2 -n interviewdeck
```

### Helm Management
```bash
# List releases
helm list -n interviewdeck

# Get values
helm get values <release-name> -n interviewdeck

# Upgrade release
helm upgrade <release-name> <chart-path> -n interviewdeck

# Uninstall release
helm uninstall <release-name> -n interviewdeck
```

### Docker Management
```bash
# Build and push
docker build --platform linux/amd64 -t <image-name> .
docker tag <image-name> <ecr-repo>:<tag>
docker push <ecr-repo>:<tag>

# ECR login
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com
```

### AWS Management
```bash
# EKS
aws eks describe-cluster --name <cluster-name>
aws eks update-kubeconfig --name <cluster-name> --region us-east-1

# Route53
aws route53 list-hosted-zones
aws route53 list-resource-record-sets --hosted-zone-id <zone-id>

# CloudFront
aws cloudfront list-distributions
aws cloudfront create-invalidation --distribution-id <id> --paths "/*"

# EC2
aws ec2 describe-instances --filters "Name=tag:Name,Values=<name>"
aws ec2 describe-security-groups --group-ids <sg-id>
```

---

## Security Considerations

1. **Database Security**:
   - Use strong passwords
   - Restrict PostgreSQL access to VPC CIDR only
   - Consider using RDS with encryption at rest

2. **Kubernetes Secrets**:
   - Secrets are base64 encoded, not encrypted
   - Consider using AWS Secrets Manager or External Secrets Operator

3. **Network Security**:
   - Security groups properly configured
   - No direct internet access to database
   - CloudFront for DDoS protection

4. **OAuth2 Security**:
   - Keep client secrets secure
   - Use HTTPS for all OAuth2 flows
   - Validate redirect URIs

---

## Monitoring and Maintenance

### Health Checks
```bash
# Application health
curl https://interviewdeck.io/api/actuator/health

# Database health
kubectl run db-test --image=postgres:13 --rm -i --restart=Never -n interviewdeck -- psql "<connection-string>" -c "SELECT 1;"

# Kubernetes cluster health
kubectl get nodes
kubectl get pods --all-namespaces
```

### Log Monitoring
```bash
# Application logs
kubectl logs -f deployment/interviewdeck-backend -n interviewdeck
kubectl logs -f deployment/interviewdeck-frontend -n interviewdeck

# System logs
journalctl -u kubelet
```

### Backup Procedures
```bash
# Database backup
ssh -i ~/.ssh/interviewdeck-key.pem ec2-user@<db-ip>
sudo -u postgres pg_dump interviewdeck > backup_$(date +%Y%m%d).sql

# Kubernetes configuration backup
kubectl get all -n interviewdeck -o yaml > k8s-backup.yaml
helm get values <release-name> -n interviewdeck > helm-values-backup.yaml
```

---

## Support Contacts and Resources

- **AWS Documentation**: https://docs.aws.amazon.com/
- **Kubernetes Documentation**: https://kubernetes.io/docs/
- **Helm Documentation**: https://helm.sh/docs/
- **Spring Boot Documentation**: https://spring.io/projects/spring-boot
- **React Documentation**: https://reactjs.org/docs/

---

*Last Updated: August 1, 2025*
*Version: 1.0*
