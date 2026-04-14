#!/bin/sh
# Reads Docker secret files and exports them as env vars before starting the app.
# Secrets are mounted at /run/secrets/<name> by docker compose.
set -e

# PostgreSQL password → DATABASE_URL (overrides whatever was set in compose env)
if [ -f /run/secrets/pg_password ]; then
  PG_PASSWORD=$(cat /run/secrets/pg_password)
  export DATABASE_URL="postgresql://jarvis:${PG_PASSWORD}@postgres:5432/jarvis"
fi

# Session secret
if [ -f /run/secrets/session_secret ]; then
  export SESSION_SECRET=$(cat /run/secrets/session_secret)
fi

# OpenAI API key
if [ -f /run/secrets/openai_api_key ]; then
  export OPENAI_API_KEY=$(cat /run/secrets/openai_api_key)
fi

# MinIO credentials (root user = app access key in single-tenant setup)
if [ -f /run/secrets/minio_user ]; then
  export MINIO_ACCESS_KEY=$(cat /run/secrets/minio_user)
fi
if [ -f /run/secrets/minio_password ]; then
  export MINIO_SECRET_KEY=$(cat /run/secrets/minio_password)
fi

exec "$@"
