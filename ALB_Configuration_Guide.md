# AWS Application Load Balancer (ALB) Configuration for EKS

## Overview

An Application Load Balancer (ALB) provides HTTP/HTTPS load balancing for your EKS applications, distributing incoming traffic across multiple targets (pods/nodes) to ensure high availability and fault tolerance.

## Architecture Components

```
Internet → ALB → Target Groups → EKS Nodes (NodePort) → Pods
```

### Key Components:

1. **ALB (Application Load Balancer)**
   - Internet-facing load balancer
   - Distributes HTTP/HTTPS traffic
   - Provides SSL termination
   - Health checks

2. **Target Groups**
   - Collection of targets (EC2 instances)
   - Health check configuration
   - Routing rules

3. **Listeners**
   - Check for connection requests
   - Define port and protocol
   - Forward traffic to target groups

4. **Security Groups**
   - Control inbound/outbound traffic
   - Applied to ALB and EKS nodes

## Configuration Methods

### Method 1: AWS Load Balancer Controller (Recommended)

#### Prerequisites
```bash
# Install AWS Load Balancer Controller
kubectl apply -k "github.com/aws/eks-charts/stable/aws-load-balancer-controller//crds?ref=master"

# Create IAM role for service account
eksctl create iamserviceaccount \
  --cluster=your-cluster-name \
  --namespace=kube-system \
  --name=aws-load-balancer-controller \
  --role-name=AmazonEKSLoadBalancerControllerRole \
  --attach-policy-arn=arn:aws:iam::aws:policy/ElasticLoadBalancingFullAccess \
  --approve

# Install controller using Helm
helm repo add eks https://aws.github.io/eks-charts
helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system \
  --set clusterName=your-cluster-name \
  --set serviceAccount.create=false \
  --set serviceAccount.name=aws-load-balancer-controller
```

#### Ingress Configuration
```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: app-ingress
  namespace: demo-app
  annotations:
    kubernetes.io/ingress.class: alb
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/load-balancer-name: demo-app-alb
    alb.ingress.kubernetes.io/listen-ports: '[{"HTTP": 80}, {"HTTPS": 443}]'
    alb.ingress.kubernetes.io/ssl-redirect: '443'
    alb.ingress.kubernetes.io/healthcheck-path: /health
    alb.ingress.kubernetes.io/healthcheck-interval-seconds: '30'
    alb.ingress.kubernetes.io/healthcheck-timeout-seconds: '5'
    alb.ingress.kubernetes.io/healthy-threshold-count: '2'
    alb.ingress.kubernetes.io/unhealthy-threshold-count: '5'
spec:
  rules:
  - host: demo-app.example.com
    http:
      paths:
      - path: /api
        pathType: Prefix
        backend:
          service:
            name: backend-service
            port:
              number: 3001
      - path: /
        pathType: Prefix
        backend:
          service:
            name: frontend-service
            port:
              number: 3000
```

### Method 2: Manual ALB Configuration (Our Current Setup)

#### Step 1: Create NodePort Services

Since our ALB is manually configured, we need NodePort services to expose applications:

```yaml
# Frontend NodePort Service
apiVersion: v1
kind: Service
metadata:
  name: frontend-nodeport-service
  namespace: demo-app
spec:
  type: NodePort
  ports:
    - name: http
      port: 3000
      targetPort: 3000
      nodePort: 30000
      protocol: TCP
  selector:
    app: frontend
    component: ui
```

```yaml
# Backend NodePort Service
apiVersion: v1
kind: Service
metadata:
  name: backend-nodeport-service
  namespace: demo-app
spec:
  type: NodePort
  ports:
    - name: http
      port: 3001
      targetPort: 3001
      nodePort: 30001
      protocol: TCP
  selector:
    app: backend
    component: api
```

#### Step 2: Create ALB

```bash
# Create ALB
aws elbv2 create-load-balancer \
  --name demo-app-manual-alb \
  --subnets subnet-xxxxxxxxx subnet-yyyyyyyyy subnet-zzzzzzzzz \
  --security-groups sg-xxxxxxxxx \
  --scheme internet-facing \
  --type application \
  --ip-address-type ipv4 \
  --region us-east-1
```

#### Step 3: Create Target Groups

```bash
# Create target group for frontend
aws elbv2 create-target-group \
  --name demo-app-frontend-tg \
  --protocol HTTP \
  --port 30000 \
  --vpc-id vpc-xxxxxxxxx \
  --health-check-protocol HTTP \
  --health-check-port 30000 \
  --health-check-path /health \
  --health-check-interval-seconds 30 \
  --health-check-timeout-seconds 5 \
  --healthy-threshold-count 2 \
  --unhealthy-threshold-count 5 \
  --target-type instance \
  --region us-east-1

# Create target group for backend
aws elbv2 create-target-group \
  --name demo-app-backend-tg \
  --protocol HTTP \
  --port 30001 \
  --vpc-id vpc-xxxxxxxxx \
  --health-check-protocol HTTP \
  --health-check-port 30001 \
  --health-check-path /health \
  --health-check-interval-seconds 30 \
  --health-check-timeout-seconds 5 \
  --healthy-threshold-count 2 \
  --unhealthy-threshold-count 5 \
  --target-type instance \
  --region us-east-1
```

#### Step 4: Register Targets

```bash
# Get EKS node instance IDs
aws ec2 describe-instances \
  --filters "Name=tag:kubernetes.io/cluster/your-cluster-name,Values=owned" \
  --query 'Reservations[*].Instances[*].InstanceId' \
  --output text

# Register instances with target group
aws elbv2 register-targets \
  --target-group-arn arn:aws:elasticloadbalancing:region:account:targetgroup/demo-app-frontend-tg/xxxxxxxxx \
  --targets Id=i-1234567890abcdef0,Port=30000 Id=i-abcdef1234567890,Port=30000
```

#### Step 5: Create Listeners

```bash
# Create HTTP listener
aws elbv2 create-listener \
  --load-balancer-arn arn:aws:elasticloadbalancing:region:account:loadbalancer/app/demo-app-manual-alb/xxxxxxxxx \
  --protocol HTTP \
  --port 80 \
  --default-actions Type=forward,TargetGroupArn=arn:aws:elasticloadbalancing:region:account:targetgroup/demo-app-frontend-tg/xxxxxxxxx

# Create HTTPS listener (if you have SSL certificate)
aws elbv2 create-listener \
  --load-balancer-arn arn:aws:elasticloadbalancing:region:account:loadbalancer/app/demo-app-manual-alb/xxxxxxxxx \
  --protocol HTTPS \
  --port 443 \
  --certificates CertificateArn=arn:aws:acm:region:account:certificate/xxxxxxxxx \
  --default-actions Type=forward,TargetGroupArn=arn:aws:elasticloadbalancing:region:account:targetgroup/demo-app-frontend-tg/xxxxxxxxx
```

#### Step 6: Create Listener Rules for Path-Based Routing

```bash
# Create rule for API traffic
aws elbv2 create-rule \
  --listener-arn arn:aws:elasticloadbalancing:region:account:listener/app/demo-app-manual-alb/xxxxxxxxx/yyyyyyyy \
  --priority 100 \
  --conditions Field=path-pattern,Values='/api/*' \
  --actions Type=forward,TargetGroupArn=arn:aws:elasticloadbalancing:region:account:targetgroup/demo-app-backend-tg/xxxxxxxxx
```

## Security Group Configuration

### ALB Security Group

```bash
# Create ALB security group
aws ec2 create-security-group \
  --group-name demo-app-alb-sg \
  --description "Security group for demo app ALB" \
  --vpc-id vpc-xxxxxxxxx

# Allow HTTP traffic from internet
aws ec2 authorize-security-group-ingress \
  --group-id sg-xxxxxxxxx \
  --protocol tcp \
  --port 80 \
  --cidr 0.0.0.0/0

# Allow HTTPS traffic from internet
aws ec2 authorize-security-group-ingress \
  --group-id sg-xxxxxxxxx \
  --protocol tcp \
  --port 443 \
  --cidr 0.0.0.0/0
```

### EKS Node Security Group

```bash
# Allow NodePort traffic from ALB
aws ec2 authorize-security-group-ingress \
  --group-id sg-node-group-xxxxxxxxx \
  --protocol tcp \
  --port 30000 \
  --source-group sg-alb-xxxxxxxxx

aws ec2 authorize-security-group-ingress \
  --group-id sg-node-group-xxxxxxxxx \
  --protocol tcp \
  --port 30001 \
  --source-group sg-alb-xxxxxxxxx
```

## Configuration Steps Summary

### 1. **Application Setup**
- Deploy applications to EKS cluster
- Ensure applications have health check endpoints
- Configure resource limits and requests

### 2. **Service Configuration**
- Create NodePort services for external access
- Ensure correct port mappings
- Verify service selectors match pod labels

### 3. **ALB Creation**
- Create ALB in public subnets
- Configure appropriate security groups
- Set up internet-facing scheme

### 4. **Target Group Setup**
- Create target groups for each service
- Configure health check parameters
- Set appropriate thresholds

### 5. **Listener Configuration**
- Create listeners for HTTP/HTTPS
- Configure SSL certificates if needed
- Set up routing rules

### 6. **Security Configuration**
- Configure ALB security groups for internet access
- Allow ALB to communicate with EKS nodes
- Restrict access as needed

### 7. **Health Check Verification**
- Ensure applications respond to health checks
- Monitor target group health
- Troubleshoot unhealthy targets

## Troubleshooting Common Issues

### Issue 1: Pods in ImagePullBackOff
```bash
# Check pod events
kubectl describe pod <pod-name> -n <namespace>

# Check if image exists and rebuild if needed
docker build --platform linux/amd64 -t <image-name> .
docker push <image-name>

# Restart deployment
kubectl rollout restart deployment/<deployment-name> -n <namespace>
```

### Issue 2: Health Check Failures
```bash
# Check service endpoints
kubectl get endpoints -n <namespace>

# Test health check endpoint
kubectl run test-pod --image=alpine/curl --rm -it --restart=Never -- curl http://<service>:<port>/health

# Check application logs
kubectl logs -f <pod-name> -n <namespace>
```

### Issue 3: ALB Targets Unhealthy
```bash
# Check target group health
aws elbv2 describe-target-health --target-group-arn <target-group-arn>

# Check security group rules
aws ec2 describe-security-groups --group-ids <security-group-id>

# Test connectivity from ALB to nodes
```

### Issue 4: Port Mismatch
```bash
# Verify NodePort service configuration
kubectl get svc -n <namespace>

# Check application port in container
kubectl exec -it <pod-name> -n <namespace> -- netstat -tlnp
```

## Monitoring and Maintenance

### Health Monitoring
```bash
# Check ALB status
aws elbv2 describe-load-balancers --names <alb-name>

# Monitor target health
aws elbv2 describe-target-health --target-group-arn <target-group-arn>

# Check ALB access logs
aws s3 ls s3://<access-logs-bucket>/
```

### Scaling Considerations
- Configure appropriate target group settings
- Set up auto-scaling for EKS nodes
- Monitor ALB performance metrics
- Adjust health check parameters as needed

## Best Practices

1. **Use AWS Load Balancer Controller** for automated management
2. **Configure SSL/TLS** for secure communication
3. **Set up proper health checks** for reliable traffic routing
4. **Monitor target health** regularly
5. **Use path-based routing** for microservices
6. **Configure appropriate security groups** for least privilege access
7. **Set up CloudWatch alarms** for monitoring
8. **Use sticky sessions** if your application requires it
9. **Configure proper timeouts** for your application needs
10. **Test failover scenarios** regularly

## Current Setup Summary

In our current configuration:
- **ALB DNS**: `demo-app-manual-alb-1659808320.us-east-1.elb.amazonaws.com`
- **Frontend**: Port 30000 (NodePort)
- **Backend**: Port 30001 (NodePort)
- **Health Check**: `/health` endpoint
- **Security**: ALB SG allows internet access, Node SG allows ALB access

## Access URLs

- **Frontend**: http://demo-app-manual-alb-1659808320.us-east-1.elb.amazonaws.com/
- **Backend API**: http://demo-app-manual-alb-1659808320.us-east-1.elb.amazonaws.com/api/
- **Health Check**: http://demo-app-manual-alb-1659808320.us-east-1.elb.amazonaws.com/health
