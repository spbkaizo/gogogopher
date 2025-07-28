# GoGoGopher Deployment Guide

This guide covers deploying GoGoGopher in various environments using Docker and Kubernetes.

## Quick Start with Docker

### Using Docker Compose (Recommended for local development)

```bash
# Start the server
docker-compose up -d

# View logs
docker-compose logs -f gogogopher

# Stop the server
docker-compose down
```

### Using Docker directly

```bash
# Build the image
docker build -t gogogopher .

# Run the container
docker run -d -p 70:70 --name gogogopher-server gogogopher

# Test the connection
echo "" | nc localhost 70
```

## Kubernetes Deployment

### Prerequisites

- Kubernetes cluster (1.19+)
- kubectl configured
- Helm 3.x installed

### Deploy with Helm

1. **Add the Helm repository** (if published):
```bash
helm repo add gogogopher https://your-org.github.io/gogogopher
helm repo update
```

2. **Install from local chart**:
```bash
# Install with default values
helm install gogogopher ./helm/gogogopher

# Install with custom values
helm install gogogopher ./helm/gogogopher -f my-values.yaml
```

3. **Verify deployment**:
```bash
kubectl get pods -l app.kubernetes.io/name=gogogopher
kubectl get services -l app.kubernetes.io/name=gogogopher
```

### Configuration Values

Create a `values.yaml` file to customize your deployment:

```yaml
# Production example
replicaCount: 3

image:
  repository: ghcr.io/your-org/gogogopher
  tag: "1.0.0"

resources:
  limits:
    cpu: 500m
    memory: 512Mi
  requests:
    cpu: 200m
    memory: 256Mi

# Enable LoadBalancer for external access
loadBalancer:
  enabled: true
  type: LoadBalancer
  port: 70

# Enable autoscaling
autoscaling:
  enabled: true
  minReplicas: 2
  maxReplicas: 10
  targetCPUUtilizationPercentage: 70

# Custom configuration
config:
  enableLogging: true
  logLevel: "INFO"
  maxRequestSize: 2048
  connectionTimeout: 60000
```

### Exposing the Service

#### Option 1: LoadBalancer (Cloud environments)
```yaml
loadBalancer:
  enabled: true
  type: LoadBalancer
  port: 70
```

#### Option 2: NodePort
```yaml
service:
  type: NodePort
loadBalancer:
  enabled: true
  type: NodePort
  nodePort: 30070
```

#### Option 3: TCP Ingress (Advanced)
For clusters with TCP ingress support:

```yaml
ingress:
  enabled: true
  className: "nginx"
  annotations:
    nginx.ingress.kubernetes.io/tcp-services-configmap: "default/tcp-services"
```

You'll also need to configure the TCP services ConfigMap:
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: tcp-services
  namespace: default
data:
  70: "default/gogogopher:70"
```

## Production Considerations

### Security

1. **Run as non-root user** (already configured in Docker image)
2. **Network policies** to restrict traffic
3. **Resource limits** to prevent resource exhaustion
4. **Security contexts** in Kubernetes

### Monitoring

1. **Health checks** are configured automatically
2. **Resource monitoring** via Kubernetes metrics
3. **Log aggregation** with your logging solution

### High Availability

1. **Multiple replicas** with anti-affinity rules:
```yaml
affinity:
  podAntiAffinity:
    preferredDuringSchedulingIgnoredDuringExecution:
    - weight: 100
      podAffinityTerm:
        labelSelector:
          matchExpressions:
          - key: app.kubernetes.io/name
            operator: In
            values:
            - gogogopher
        topologyKey: kubernetes.io/hostname
```

2. **Horizontal Pod Autoscaler** for dynamic scaling

### Storage

By default, the server uses the built-in content. For custom content:

```yaml
volumes:
- name: gopher-content
  configMap:
    name: custom-gopher-content

volumeMounts:
- name: gopher-content
  mountPath: /app/gopher-content
  readOnly: true
```

## Troubleshooting

### Common Issues

1. **Connection refused**:
   - Check if the service is running: `kubectl get pods`
   - Verify port configuration: `kubectl describe service gogogopher`
   - Test internal connectivity: `kubectl exec -it <pod> -- nc localhost 70`

2. **Container won't start**:
   - Check logs: `kubectl logs -l app.kubernetes.io/name=gogogopher`
   - Verify resource limits aren't too restrictive
   - Check security context configuration

3. **External access issues**:
   - Verify LoadBalancer has external IP: `kubectl get svc`
   - Check firewall rules for port 70
   - Test with telnet: `telnet <external-ip> 70`

### Debugging Commands

```bash
# Check pod status
kubectl get pods -l app.kubernetes.io/name=gogogopher -o wide

# View logs
kubectl logs -l app.kubernetes.io/name=gogogopher --tail=100

# Get pod description
kubectl describe pod <pod-name>

# Test internal connectivity
kubectl exec -it <pod-name> -- nc -z localhost 70

# Port forward for local testing
kubectl port-forward svc/gogogopher 8070:70
```

## Scaling and Performance

### Vertical Scaling
Increase resources per pod:
```yaml
resources:
  limits:
    cpu: 1000m
    memory: 1Gi
  requests:
    cpu: 500m
    memory: 512Mi
```

### Horizontal Scaling
Increase replica count:
```yaml
replicaCount: 5

autoscaling:
  enabled: true
  minReplicas: 3
  maxReplicas: 20
  targetCPUUtilizationPercentage: 60
```

## Backup and Recovery

The GoGoGopher server is stateless by default. To backup custom content:

1. **ConfigMap-based content**:
```bash
kubectl get configmap custom-gopher-content -o yaml > gopher-content-backup.yaml
```

2. **PersistentVolume-based content**:
```bash
# Create a backup job or use your storage solution's backup features
```

## Updates and Rollbacks

### Rolling Updates
```bash
# Update to new version
helm upgrade gogogopher ./helm/gogogopher --set image.tag=1.1.0

# Check rollout status
kubectl rollout status deployment/gogogopher

# Rollback if needed
helm rollback gogogopher
```

### Blue-Green Deployment
For zero-downtime deployments:
```bash
# Deploy new version with different name
helm install gogogopher-v2 ./helm/gogogopher --set image.tag=1.1.0

# Switch traffic and cleanup old version
kubectl patch service gogogopher -p '{"spec":{"selector":{"app.kubernetes.io/instance":"gogogopher-v2"}}}'
helm uninstall gogogopher-v1
```