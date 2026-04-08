#!/bin/bash
# scripts/start-prod.sh — Full production startup
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "============================================"
echo "  Jarvis Production Startup"
echo "============================================"

# 1. Validate secrets
SECRETS_DIR="$PROJECT_ROOT/docker/secrets"
REQUIRED=(pg_password minio_user minio_password session_secret anthropic_api_key)
for secret in "${REQUIRED[@]}"; do
  if [[ ! -f "$SECRETS_DIR/$secret.txt" ]]; then
    echo "ERROR: Missing $SECRETS_DIR/$secret.txt"
    echo "  Create: echo -n 'your-value' > $SECRETS_DIR/$secret.txt"
    exit 1
  fi
done
echo "[1/4] Secrets validated"

# 2. Start services
echo "[2/4] Starting services..."
docker compose -f "$PROJECT_ROOT/docker/docker-compose.yml" up -d
echo "[2/4] Services started"

# 3. Wait for healthy
echo "[3/4] Waiting for services..."
MAX_WAIT=120; ELAPSED=0
while [[ $ELAPSED -lt $MAX_WAIT ]]; do
  UNHEALTHY=$(docker compose -f "$PROJECT_ROOT/docker/docker-compose.yml" ps --format json 2>/dev/null \
    | python3 -c "import json,sys; data=[json.loads(l) for l in sys.stdin if l.strip()]; print(len([s for s in data if s.get('Health') not in ('healthy','')]))" 2>/dev/null || echo "0")
  [[ "$UNHEALTHY" == "0" ]] && break
  echo "  Waiting... ($ELAPSED/${MAX_WAIT}s)"
  sleep 5; ELAPSED=$((ELAPSED + 5))
done
echo "[3/4] Services ready"

# 4. Health check
echo "[4/4] Running health checks..."
pnpm tsx "$PROJECT_ROOT/scripts/health-check.ts"

echo "============================================"
echo "  Jarvis is running at https://career.minseok91.cloud"
echo "============================================"
