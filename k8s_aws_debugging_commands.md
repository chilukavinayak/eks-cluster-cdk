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

...

## 🧪 Final Health Check

```bash
curl --connect-timeout 10 http://<alb-dns>/health
```
- Confirms application is publicly reachable via ALB.
