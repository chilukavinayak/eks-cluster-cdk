# Route 53 Domain Setup for interviewdeck.io

## ✅ Route 53 Hosted Zone Created

**Domain**: `interviewdeck.io`  
**Hosted Zone ID**: `Z0230466UX8KG6M1GBCM`  
**Status**: Active

---

## 🌐 AWS Nameservers (Replace Current Ones)

### **New AWS Nameservers** (Update in your domain registrar):
```
ns-1671.awsdns-16.co.uk
ns-492.awsdns-61.com
ns-845.awsdns-41.net
ns-1397.awsdns-46.org
```

### **Current Nameservers** (To be replaced):
```
ns-cloud-e1.googledomains.com
ns-cloud-e2.googledomains.com
ns-cloud-e3.googledomains.com
ns-cloud-e4.googledomains.com
```

---

## 📋 Step-by-Step Setup Instructions

### Step 1: Update Nameservers in Your Domain Registrar

1. **Log into your domain registrar** (where you purchased interviewdeck.io)
2. **Find DNS/Nameserver settings** for interviewdeck.io
3. **Replace the current nameservers** with AWS nameservers:
   ```
   ns-1671.awsdns-16.co.uk
   ns-492.awsdns-61.com
   ns-845.awsdns-41.net
   ns-1397.awsdns-46.org
   ```
4. **Save changes** (DNS propagation takes 24-48 hours)

### Step 2: Install AWS Load Balancer Controller (Required for EKS)

```bash
# Download policy document
curl -O https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/v2.7.2/docs/install/iam_policy.json

# Create IAM policy
aws iam create-policy \
    --policy-name AWSLoadBalancerControllerIAMPolicy \
    --policy-document file://iam_policy.json

# Create service account with IAM role
eksctl create iamserviceaccount \
  --cluster=sats-portals-eks-cluster \
  --namespace=kube-system \
  --name=aws-load-balancer-controller \
  --role-name AmazonEKSLoadBalancerControllerRole \
  --attach-policy-arn=arn:aws:iam::276824024738:policy/AWSLoadBalancerControllerIAMPolicy \
  --approve

# Install controller via Helm
helm repo add eks https://aws.github.io/eks-charts
helm repo update
helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system \
  --set clusterName=sats-portals-eks-cluster \
  --set serviceAccount.create=false \
  --set serviceAccount.name=aws-load-balancer-controller
```

### Step 3: Request SSL Certificate

```bash
# Request SSL certificate for your domain
aws acm request-certificate \
  --domain-name interviewdeck.io \
  --subject-alternative-names *.interviewdeck.io \
  --validation-method DNS \
  --region us-east-1
```

### Step 4: Update Kubernetes Ingress

Update the ingress manifest with your domain and SSL certificate:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: interviewdeck-ingress
  namespace: interviewdeck
  annotations:
    kubernetes.io/ingress.class: alb
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/certificate-arn: "arn:aws:acm:us-east-1:276824024738:certificate/YOUR-CERT-ARN"
    alb.ingress.kubernetes.io/ssl-redirect: '443'
    alb.ingress.kubernetes.io/listen-ports: '[{"HTTP":80},{"HTTPS":443}]'
spec:
  rules:
  - host: interviewdeck.io
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: interviewdeck-frontend
            port:
              number: 80
      - path: /api
        pathType: Prefix
        backend:
          service:
            name: interviewdeck-backend
            port:
              number: 8080
  - host: www.interviewdeck.io
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: interviewdeck-frontend
            port:
              number: 80
```

---

## 🔧 DNS Records Setup Commands

After Load Balancer is created, get the ALB DNS name:

```bash
# Get ALB DNS name from ingress
kubectl get ingress interviewdeck-ingress -n interviewdeck -o jsonpath='{.status.loadBalancer.ingress[0].hostname}'
```

Then create DNS records in Route 53:

```bash
# Get the ALB DNS name (example: k8s-intervi-intervi-abc123-456789.us-east-1.elb.amazonaws.com)
ALB_DNS_NAME=$(kubectl get ingress interviewdeck-ingress -n interviewdeck -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')

# Create A record for root domain (interviewdeck.io)
aws route53 change-resource-record-sets --hosted-zone-id Z0230466UX8KG6M1GBCM --change-batch '{
  "Changes": [
    {
      "Action": "CREATE",
      "ResourceRecordSet": {
        "Name": "interviewdeck.io",
        "Type": "A",
        "AliasTarget": {
          "DNSName": "'$ALB_DNS_NAME'",
          "EvaluateTargetHealth": true,
          "HostedZoneId": "Z35SXDOTRQ7X7K"
        }
      }
    }
  ]
}'

# Create CNAME record for www subdomain
aws route53 change-resource-record-sets --hosted-zone-id Z0230466UX8KG6M1GBCM --change-batch '{
  "Changes": [
    {
      "Action": "CREATE",
      "ResourceRecordSet": {
        "Name": "www.interviewdeck.io",
        "Type": "CNAME",
        "TTL": 300,
        "ResourceRecords": [
          {
            "Value": "interviewdeck.io"
          }
        ]
      }
    }
  ]
}'
```

---

## 🚀 Quick Start Commands

### Verify Route 53 Setup
```bash
# Check hosted zone
aws route53 get-hosted-zone --id Z0230466UX8KG6M1GBCM

# List all records
aws route53 list-resource-record-sets --hosted-zone-id Z0230466UX8KG6M1GBCM
```

### Check DNS Propagation
```bash
# Check if nameservers are updated
dig NS interviewdeck.io

# Check domain resolution
dig interviewdeck.io
nslookup interviewdeck.io
```

### Test SSL Certificate
```bash
# Check certificate status
aws acm list-certificates --region us-east-1
aws acm describe-certificate --certificate-arn YOUR-CERT-ARN --region us-east-1
```

---

## 📊 Current Status

### ✅ Completed:
- Route 53 hosted zone created
- AWS nameservers provided
- Setup instructions documented

### 🔄 Next Steps:
1. **Update nameservers** in your domain registrar
2. **Wait for DNS propagation** (24-48 hours)
3. **Install AWS Load Balancer Controller**
4. **Request SSL certificate**
5. **Update ingress configuration**
6. **Create DNS records**

### 🎯 Final Result:
- **https://interviewdeck.io** → Your application
- **https://www.interviewdeck.io** → Your application
- **Automatic SSL/HTTPS**
- **AWS-managed DNS**

---

## 💡 Important Notes

1. **DNS Propagation**: Changes take 24-48 hours to fully propagate
2. **SSL Validation**: You'll need to validate the SSL certificate via DNS
3. **Load Balancer**: Required for external access to your EKS application
4. **Backup**: Keep current DNS records as backup during transition

---

## 🆘 Troubleshooting

### Common Issues:
1. **DNS not resolving**: Check nameserver propagation
2. **SSL certificate pending**: Validate via DNS records
3. **Load balancer not created**: Ensure ALB controller is installed
4. **Application not accessible**: Check ingress and service configurations

### Debug Commands:
```bash
# Check ingress status
kubectl describe ingress interviewdeck-ingress -n interviewdeck

# Check load balancer controller
kubectl get pods -n kube-system | grep aws-load-balancer

# Check DNS resolution
dig interviewdeck.io
nslookup interviewdeck.io 8.8.8.8
```

---

*Created: July 31, 2025*  
*Domain: interviewdeck.io*  
*Hosted Zone: Z0230466UX8KG6M1GBCM*
