# Domain Setup Steps for interviewdeck.io

## ✅ Completed
- EKS cluster is active (`sats-portals-eks-cluster`)
- Route53 hosted zone created (Z0230466UX8KG6M1GBCM)
- IAM policy and role for ALB controller exist
- SSL certificate requested (`arn:aws:acm:us-east-1:276824024738:certificate/03d76270-6adb-4647-a2b4-daa0edad3f4a`)
- SSL validation CNAME record added to Route53

## 🔄 Next Steps (Critical Order)

### Step 1: Update Domain Nameservers (IMMEDIATE ACTION REQUIRED)

**Go to your domain registrar** and replace the current nameservers:

**FROM (Current):**
```
ns-cloud-e1.googledomains.com
ns-cloud-e2.googledomains.com
ns-cloud-e3.googledomains.com
ns-cloud-e4.googledomains.com
```

**TO (AWS Route53):**
```
ns-1671.awsdns-16.co.uk
ns-492.awsdns-61.com
ns-845.awsdns-41.net
ns-1397.awsdns-46.org
```

⚠️ **Important**: DNS propagation takes 24-48 hours after this change!

### Step 2: Install AWS Load Balancer Controller (After nameserver change)

Run these commands in order:

```bash
# 1. Apply the service account
kubectl apply -f aws-load-balancer-controller-service-account.yaml

# 2. Install the controller via Helm
helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system \
  --set clusterName=sats-portals-eks-cluster \
  --set serviceAccount.create=false \
  --set serviceAccount.name=aws-load-balancer-controller

# 3. Verify installation
kubectl get pods -n kube-system | grep aws-load-balancer-controller
```

### Step 3: Check SSL Certificate Status

```bash
# Check if certificate is validated
aws acm describe-certificate \
  --certificate-arn arn:aws:acm:us-east-1:276824024738:certificate/03d76270-6adb-4647-a2b4-daa0edad3f4a \
  --region us-east-1 \
  --query 'Certificate.Status'
```

### Step 4: Deploy Your Application with Ingress

Create your application ingress with SSL:

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
    alb.ingress.kubernetes.io/certificate-arn: "arn:aws:acm:us-east-1:276824024738:certificate/03d76270-6adb-4647-a2b4-daa0edad3f4a"
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
```

### Step 5: Get Load Balancer DNS and Create DNS Records

```bash
# Get ALB DNS name
ALB_DNS_NAME=$(kubectl get ingress interviewdeck-ingress -n interviewdeck -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
echo "ALB DNS: $ALB_DNS_NAME"

# Create A record for root domain
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

# Create CNAME for www
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

## 🎯 Final Result

After all steps complete:
- **https://interviewdeck.io** → Your EKS application
- **https://www.interviewdeck.io** → Your EKS application
- **Automatic SSL/HTTPS encryption**
- **AWS-managed DNS and load balancing**

## 📋 Verification Commands

```bash
# Check DNS propagation
dig NS interviewdeck.io
dig interviewdeck.io

# Check SSL certificate
curl -I https://interviewdeck.io

# Check ingress status
kubectl describe ingress interviewdeck-ingress -n interviewdeck
```

## ⏱️ Timeline

- **Step 1**: 5 minutes (nameserver update)
- **Step 2-5**: Can be done after 24-48 hours when DNS propagates
- **Total time**: 24-48 hours for complete setup

---

**Current Status**: Ready for Step 1 (nameserver update) - this is the critical step that starts the 24-48 hour DNS propagation timer.
