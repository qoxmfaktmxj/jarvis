#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_dir"

if [[ ! -f .env.local ]]; then
  echo ".env.local is required" >&2
  exit 1
fi
if [[ ! -f apps/web/.next/BUILD_ID || ! -f apps/worker/dist/index.js ]]; then
  echo "production build is missing; run pnpm build" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env.local
set +a
: "${LLM_GATEWAY_URL:?LLM_GATEWAY_URL is required}"
: "${LLM_GATEWAY_KEY:?LLM_GATEWAY_KEY is required}"

docker compose -f infra/cliproxy/compose.yaml up -d cli-proxy
curl --fail --silent --show-error \
  --header "Authorization: Bearer ${LLM_GATEWAY_KEY}" \
  "${LLM_GATEWAY_URL%/}/models" >/dev/null

node --env-file=.env.local apps/worker/dist/index.js &
worker_pid=$!
pnpm --filter @jarvis/web start &
web_pid=$!

stop() {
  kill "$web_pid" "$worker_pid" 2>/dev/null || true
  wait "$web_pid" "$worker_pid" 2>/dev/null || true
}
trap stop EXIT INT TERM

set +e
wait -n "$web_pid" "$worker_pid"
exit_code=$?
set -e
echo "Jarvis process exited (${exit_code}); stopping the sibling process" >&2
exit "$exit_code"
