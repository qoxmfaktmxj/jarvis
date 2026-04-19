# CLIProxyAPI — Jarvis Subscription Gateway

Phase-W1.5 — see `docs/plan/2026-04-19-Jarvis_openai연동가이드.md`.

## What this is

A local-process OpenAI-compatible reverse proxy ([CLIProxyAPI v6.9.29](https://github.com/router-for-me/CLIProxyAPI))
that lets Jarvis talk to ChatGPT Codex / Claude Code via subscription OAuth
instead of paying per-token API spend, while keeping `OPENAI_API_KEY` as a
warm-standby fallback.

Operation policy (default):

| Operation | `FEATURE_SUBSCRIPTION_*` | Why |
|-----------|--------------------------|-----|
| `query`   | `true` once gateway is healthy | user-facing, looks like a normal ChatGPT chat |
| `lint`    | `true` (weekly cron, low volume)  | well within Pro 5h window |
| `ingest`  | **`false`** — direct API only | ToS "no automated/programmatic" — keep batch on API key |
| `graph`   | n/a — Graphify is deterministic, no LLM | |

## Local dev quickstart

```bash
# 1. one-time login per account (browser opens)
docker run --rm -it -p 1455:1455 \
  -v $PWD/infra/cliproxy/config.yaml:/CLIProxyAPI/config.yaml \
  -v $PWD/infra/cliproxy/auths:/root/.cli-proxy-api \
  eceasy/cli-proxy-api:v6.9.29 \
  /CLIProxyAPI/CLIProxyAPI --codex-login

# 2. start the proxy alongside Jarvis dev services
docker compose -f docker/docker-compose.yml -f docker/docker-compose.dev.yml \
  --profile gateway up -d cli-proxy

# 3. smoke test
curl -sS http://127.0.0.1:8317/v1/models \
  -H "Authorization: Bearer sk-jarvis-local-dev" | jq '.data | length'
```

Then flip the flag(s) you want to try and re-run `pnpm dev`:

```bash
echo 'FEATURE_SUBSCRIPTION_QUERY=true' >> .env
```

## Files

```
infra/cliproxy/
├── config.yaml      # committed — gateway config
├── README.md        # this file
├── .gitignore       # auths/, logs/, .age.key out; auths.tgz.enc + .age.pub in
├── auths/           # OAuth credential JSONs (gitignored, 600 perms)
└── logs/            # gateway access logs (gitignored, rotated)
```

## Rolling back

There is **no DB migration** for this feature. Roll back by toggling env:

```bash
sed -i 's/^FEATURE_SUBSCRIPTION_.*=.*/FEATURE_SUBSCRIPTION_&=false/' .env
docker compose up -d --no-deps web worker
```

The `cli-proxy` container itself can stay running — empty load is fine.
