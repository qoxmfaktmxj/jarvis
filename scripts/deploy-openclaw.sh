#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_dir"

bootstrap_sample_evidence() {
  local wiki_root=".runtime/wiki-repo"
  if [[ -d "$wiki_root" ]] && find "$wiki_root" -type f -name '*.md' -print -quit | grep -q .; then
    return
  fi

  echo "runtime Wiki is empty; bootstrapping bundled evidence samples"
  if [[ ! -f ".runtime/sample-ingest-state.json" ]]; then
    pnpm samples:ingest
  fi
  pnpm wiki:bootstrap
  pnpm wiki:project
}

if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  echo "tracked files are dirty; deployment stopped" >&2
  exit 1
fi

before="$(git rev-parse HEAD)"
git fetch origin main
after="$(git rev-parse origin/main)"
if [[ "$before" == "$after" ]]; then
  bootstrap_sample_evidence
  echo "already up to date: $after"
  exit 0
fi
git merge-base --is-ancestor "$before" "$after"
changed="$(git diff --name-only "$before" "$after")"
git merge --ff-only "$after"

if grep -Eq '(^|/)(package.json|pnpm-lock.yaml|pnpm-workspace.yaml)$' <<<"$changed"; then
  pnpm install --frozen-lockfile
fi
if grep -q '^packages/db/migrations/' <<<"$changed"; then
  pnpm db:migrate
fi

bootstrap_sample_evidence

# PR의 required verify가 lint/unit/security를 이미 통과시킨다.
# 서버에서는 production build와 재기동 smoke만 반복한다.
pnpm build

if grep -q '^infra/cliproxy/' <<<"$changed"; then
  docker compose -f infra/cliproxy/compose.yaml pull
  sudo systemctl restart jarvis-cliproxy
fi
sudo systemctl restart jarvis-worker jarvis-web
curl --fail --silent --show-error http://127.0.0.1:3010/login >/dev/null

echo "deployed: $before -> $after"
