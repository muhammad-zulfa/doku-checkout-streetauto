# DOKU Checkout API - Production Docker Setup

A Node.js TypeScript API for DOKU payment processing, containerized for production deployment.

## 🚀 Quick Start with Docker

### Option 1: Docker Compose (Recommended)

```bash
# 1. Copy environment template
cp .env.production.template .env.production

# 2. Update .env.production with your production values

# 3. Build and run
docker-compose up -d
```

### Option 2: Docker Build & Run

```bash
# Build the image
docker build -t doku-checkout-api .

# Run with environment file
docker run -p 3003:3000 --env-file .env doku-checkout-api
```

## 📦 Docker Features

### Multi-Stage Build

- **Build stage**: Compiles TypeScript with dev dependencies
- **Production stage**: Minimal runtime with only production dependencies
- **Alpine Linux**: Small footprint (~150MB final image)

### Security Features

- ✅ Non-root user (`nodeapp:nodejs`)
- ✅ Minimal attack surface (Alpine base)
- ✅ Environment file exclusion via `.dockerignore`
- ✅ Health checks for container monitoring

### Production Optimizations

- ✅ Layer caching for faster rebuilds
- ✅ Production-only dependencies in final image
- ✅ Compiled TypeScript (no runtime compilation)
- ✅ Process monitoring and restart policies

## 🔧 Environment Configuration

### Required Environment Variables

```bash
# Server
NODE_ENV=production
PORT=3000

# DOKU Configuration
DOKU_ENV=production  # or 'sandbox'
DOKU_CLIENT_ID=your-client-id
DOKU_SECRET_KEY=your-secret-key

# URLs
PUBLIC_BASE_URL=https://your-domain.com

# Security
API_SECRET_KEY=your-64-char-api-key
```

## 🏗️ Build Commands

```bash
# Build Docker image
npm run docker:build

# Run container
npm run docker:run

# Docker Compose
npm run docker:compose

# Development with rebuild
npm run docker:compose:dev
```

## 🔍 Health Monitoring

The container includes built-in health checks:

- **Endpoint**: `GET /health`
- **Interval**: 30 seconds
- **Timeout**: 3 seconds
- **Retries**: 3

## 📈 Production Deployment

### Container Registry

```bash
# Tag for registry
docker tag doku-checkout-api your-registry/doku-checkout-api:v1.0.0

# Push to registry
docker push your-registry/doku-checkout-api:v1.0.0
```

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: doku-checkout-api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: doku-checkout-api
  template:
    metadata:
      labels:
        app: doku-checkout-api
    spec:
      containers:
        - name: api
          image: your-registry/doku-checkout-api:v1.0.0
          ports:
            - containerPort: 3000
          env:
            - name: NODE_ENV
              value: "production"
          envFrom:
            - secretRef:
                name: doku-api-secrets
```

## 🛡️ Security Best Practices

1. **Environment Variables**: Use Kubernetes secrets or Docker secrets
2. **API Keys**: Rotate regularly and use strong generation
3. **Network**: Run behind reverse proxy (nginx, Traefik)
4. **Monitoring**: Implement logging and metrics collection
5. **Updates**: Regularly update base images for security patches

## 📊 Monitoring & Logging

### Docker Logs

```bash
# View logs
docker-compose logs -f doku-checkout-api

# Follow logs with timestamps
docker logs -f --timestamps container_name
```

### Health Check

```bash
# Check container health
docker ps
# Look for "healthy" status

# Manual health check
curl http://localhost:3003/health
```

## 🚨 Troubleshooting

### Common Issues

1. **Port conflicts**: Change host port in docker-compose.yml
2. **Environment variables**: Verify .env file is properly formatted
3. **Build failures**: Check TypeScript compilation errors
4. **Health check fails**: Verify /health endpoint is accessible

### Debug Container

```bash
# Run container with shell access
docker run -it --entrypoint sh doku-checkout-api

# Execute into running container
docker exec -it container_name sh
```

## 📝 API Endpoints

All endpoints require `X-API-Key` header for authentication:

- `POST /payments/doku/create` - Create payment
- `POST /payments/doku/create-comprehensive` - Create detailed payment
- `GET /payments/doku/status/:invoiceNumber` - Check payment status
- `POST /payments/doku/notify` - DOKU webhook (no auth required)
- `GET /health` - Health check (no auth required)
