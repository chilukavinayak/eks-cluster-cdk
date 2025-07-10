
# Kubernetes + AWS ECR + ALB Debugging Command Reference

## 🔍 Kubernetes Cluster Inspection

```bash
kubectl get all -A
```
- Lists all resources in all namespaces.

```bash
kubectl get all -n demo-app
```
- Lists all resources in the `demo-app` namespace.

```bash
kubectl describe pod -n demo-app | grep -A 5 -B 5 "Failed to pull image"
```
- Finds pods with image pull failures and displays surrounding context.

---

## 🐳 Amazon ECR Image Verification

```bash
aws ecr describe-repositories --region us-east-1 | grep repositoryName
```
- Lists all ECR repository names.

```bash
aws ecr list-images --repository-name backend-api --region us-east-1
```
- Lists all images in `backend-api` repository.

---

## 🧱 Cluster Infrastructure Info

```bash
kubectl get nodes -o wide
```
- Lists node details like internal IPs and zones.

---

## 🔐 Login to AWS ECR

```bash
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 276824024738.dkr.ecr.us-east-1.amazonaws.com
```
- Logs Docker into ECR using AWS credentials.

---

## 🏗️ Build & Push Docker Images

```bash
docker build --platform linux/amd64 -t 276824024738.dkr.ecr.us-east-1.amazonaws.com/backend-api:latest .
docker build --platform linux/amd64 -t 276824024738.dkr.ecr.us-east-1.amazonaws.com/frontend-app:latest .
```
- Builds backend and frontend images targeting ECR.

```bash
docker push 276824024738.dkr.ecr.us-east-1.amazonaws.com/backend-api:latest
docker push 276824024738.dkr.ecr.us-east-1.amazonaws.com/frontend-app:latest
```
- Pushes images to ECR.

---

## 🔁 Restart Kubernetes Deployments

```bash
kubectl rollout restart deployment/backend-deployment -n demo-app
kubectl rollout restart deployment/frontend-deployment -n demo-app
```
- Triggers redeployments to pull updated images.

---

## 📦 Pod & Service Monitoring

```bash
kubectl get pods -n demo-app
kubectl get all -n demo-app
kubectl get pods -n demo-app -w
```
- Watches pods and other resource statuses.

---

## 📄 Describe Resources & View Logs

```bash
kubectl describe pod <pod-name> -n demo-app
kubectl logs <pod-name> -n demo-app
```
- Describes pod details and retrieves logs.

```bash
kubectl get deployment frontend-deployment -n demo-app -o yaml | grep -A 20 -B 5 "livenessProbe"
```
- Displays health check configurations.

---

## 🌐 Ingress & Load Balancer Checks

```bash
kubectl get ingress -n demo-app
kubectl describe ingress demo-app-ingress -n demo-app
```
- Inspects ingress configurations.

```bash
kubectl get pods -n kube-system | grep aws-load-balancer-controller
kubectl get deployments -A | grep load-balancer
```
- Checks AWS Load Balancer Controller presence.

```bash
aws elbv2 describe-load-balancers --region us-east-1 | grep DNSName
aws elbv2 describe-load-balancers --names demo-app-manual-alb --region us-east-1
```
- Gets ALB details and DNS name.

---

## ✅ Health Check via ALB

```bash
curl -I http://<alb-dns>/
curl --connect-timeout 10 http://<alb-dns>/api/status
```
- Tests HTTP responses from ALB.

---

## 🎯 Target Group Health Debugging

```bash
aws elbv2 describe-target-groups --load-balancer-arn <ALB_ARN> --region us-east-1
aws elbv2 describe-target-health --target-group-arn <TG_ARN> --region us-east-1
```
- Validates target registration and health.

```bash
aws elbv2 describe-listeners --load-balancer-arn <ALB_ARN> --region us-east-1
```
- Lists listeners (ports) on ALB.

---

## 🛠️ Apply NodePort Services (Fallback)

```bash
kubectl apply -f k8s/frontend-nodeport-service.yaml
kubectl apply -f k8s/backend-nodeport-service.yaml
```
- Deploys NodePort services.

---

## 🌍 Direct NodePort Access

```bash
kubectl get nodes -o wide | head -2
curl -I http://<node-ip>:30000/health
```
- Checks service availability via node IP and NodePort.

---

## 🧪 In-Cluster Service Test

```bash
kubectl run test-pod --image=alpine/curl:latest --rm -it --restart=Never -- curl http://frontend-nodeport-service.demo-app.svc.cluster.local:3000/health
```
- Tests internal DNS-based connectivity between services.

---

## 🔐 Security Group Validation

```bash
aws ec2 describe-instances --instance-ids <INSTANCE_ID> --region us-east-1 --query 'Reservations[0].Instances[0].SecurityGroups' --output table
```
- Lists security groups attached to an EC2 instance.

```bash
aws elbv2 describe-load-balancers --names demo-app-manual-alb --region us-east-1 --query 'LoadBalancers[0].SecurityGroups[0]' --output text
```
- Retrieves ALB security group.

---

## 🔓 Open Required Ports

```bash
aws ec2 authorize-security-group-ingress --group-id <TARGET_SG> --protocol tcp --port 30000 --source-group <SOURCE_SG> --region us-east-1
aws ec2 authorize-security-group-ingress --group-id <TARGET_SG> --protocol tcp --port 30001 --source-group <SOURCE_SG> --region us-east-1
```
- Opens NodePort ports between security groups.

```bash
aws ec2 authorize-security-group-ingress --group-id <SG_ID> --protocol tcp --port 80 --cidr 0.0.0.0/0 --region us-east-1
aws ec2 authorize-security-group-ingress --group-id <SG_ID> --protocol tcp --port 443 --cidr 0.0.0.0/0 --region us-east-1
```
- Opens HTTP/HTTPS for public traffic.

---

## 🧪 Final Health Check

```bash
curl --connect-timeout 10 http://<alb-dns>/health
```
- Confirms application is publicly reachable via ALB.
