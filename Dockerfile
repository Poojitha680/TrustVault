# Multi-stage build for TrustVault: High-Assurance Confidential Document Platform

# ------------------------------------------------------------------------------
# Stage 1: Build Frontend Assets
# ------------------------------------------------------------------------------
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# ------------------------------------------------------------------------------
# Stage 2: Python Backend Runtime
# ------------------------------------------------------------------------------
FROM python:3.12-slim AS runner
WORKDIR /app

# Prevent Python from writing .pyc files & enable unbuffered stdout
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend application source
COPY backend/ ./backend/

# Copy built frontend production artifacts from Stage 1
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Copy documentation and metadata
COPY README.md THREATS.md PROMPTS.md ./

# Create storage directory with appropriate permissions
RUN mkdir -p /app/vault_storage

EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8000/api/health || exit 1

# Run uvicorn on port 8000 (or $PORT provided by cloud environments)
CMD ["sh", "-c", "uvicorn backend.app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
