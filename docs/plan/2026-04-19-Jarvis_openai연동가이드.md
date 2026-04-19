# Jarvis × CLIProxyAPI 하루 만에 붙이는 실전 가이드

**결론부터**: CLIProxyAPI `v6.9.29`(2026-04-18 태그)를 `eceasy/cli-proxy-api:latest` Docker 이미지로 서버에 띄우고, Jarvis `packages/ai`의 OpenAI SDK `baseURL`만 `http://cli-proxy:8317/v1`로 바꾸면 오늘 안에 동작한다. 단 사용자가 제시한 **"Pro 20 / Plus 5 동시"는 현실과 어긋난다** — 커뮤니티 실측과 공식 5시간 한도(Pro 300–1,500 msg / Plus 45–225 msg, developers.openai.com/codex/pricing) 기준 **Pro 1계정은 상시 4–6 세션, Plus 1계정은 상시 1–2 세션**이 안전선이다. Jarvis 피크 수요 15–20 동시성은 **Pro 2 + Plus 1(완충) + OPENAI_API_KEY warm-standby** 하이브리드가 기술·ToS·비용의 최적이고, 특히 **Ingest 배치는 API Key로 분리**해야 ToS "automated/programmatic" 조항과 충돌하지 않는다. 이 가이드는 오늘(토) 3단계 9시간 작업과 월요일 `git pull && docker compose up -d` 한 줄 배포까지 커버한다.

---

## 1. CLIProxyAPI 2026-04 실측 현황

**최신 태그는 `v6.9.29`(2026-04-18, pkg.go.dev v6 모듈 확인), 직전 `v6.9.28`(2026-04-16, 커밋 `5dcca69`).** 릴리스는 사실상 rolling(548 릴리스, 메인 2,212 커밋) — 업스트림 breakage 리스크를 전제로 버전을 `:latest`가 아니라 명시적 태그로 고정할 것을 권장한다. v6.9.29 범위의 의미 있는 변화: `Handle Codex capacity errors as retryable`(36973d4), `fix/responses-stream-multi-tool-calls`, `feat(api): integrate auth index into key retrieval endpoints for Gemini, Claude, Codex, OpenAI, Vertex`. v6.9.28에서 **iFlow 모듈이 제거**되었으므로 이 가이드는 iFlow를 대안 경로로 가정하지 않는다.

지원 인증 채널은 **Codex(ChatGPT) OAuth, Claude Code OAuth, Gemini CLI OAuth, Antigravity OAuth, Qwen Code OAuth, Kimi OAuth**, 그리고 `openai-compatibility`·`vertex-api-key`·`ampcode` 블록으로 들어오는 직접 API 키. README가 적시한 "Kiro 지원"은 **메인 레포에서 확인 불가**이며 사용자 질문에 포함되었으나 이번 배포에는 가정하지 않는다. 노출 엔드포인트는 `POST /v1/chat/completions`, `POST /v1/responses`, `POST /v1/messages`, `GET /v1/models`, Gemini `v1beta/models/*`, 관리용 `/v0/management/*`(Bearer), Web UI `/management.html`. **기본 포트 8317**, OAuth 콜백 포트는 `1455`(Codex/OpenAI), `8085`(Gemini), `54545/51121/11451`(Qwen/Kimi 계열).

공식 Docker 이미지는 **`eceasy/cli-proxy-api:latest`**(Docker Hub). GHCR 공식 배포는 없음(org packages 비어 있음). **계정 로그인 흐름은 외부 `codex` CLI에서 생성한 `~/.codex/auth.json`을 가져오는 것이 아니라 CLIProxyAPI 바이너리가 직접 OAuth를 수행**한다. 서버 측 `auth-dir`(기본 `~/.cli-proxy-api/`)에 **계정별 JSON 파일들이 flat하게 쌓이고**, 클라이언트 `~/.codex/auth.json`에는 `{"OPENAI_API_KEY":"sk-dummy"}` 더미만 둔다. 토큰 refresh는 자동이며 실패 시 수동 재로그인이 필요하다 (CLIProxyAPI #1451 참조).

풀링 전략은 config.example.yaml에서 **`round-robin`(기본)과 `fill-first`만 확실**하다. `least-used`/`sticky-session`/`random`은 Plus 포크(`feat/session-affinity`, `weighted rotation` 머지 흔적)에는 있으나 메인 반영 여부 불확실. **Prometheus `/metrics`는 공식적으로 노출되지 않는 것으로 확인**되어, 관측성은 Jarvis 앱단 `prom-client`로 직접 계측하는 게 안전하다.

중요한 실전 함정: **기본 API timeout 120초**(#839), **429는 IP가 아니라 account/token에 결합**(#1015), Claude 채널 Cloudflare managed challenge 이슈(#1659), `/v1/responses` → Claude 변환 시 role="system" 에러(#736, **Claude 모델은 `/v1/chat/completions` 경로만 사용할 것**).

---

## 2. 동시 세션 수 재산정 — 사용자 가설 반박

사용자가 제시한 **Pro=20 / Plus=5 가설은 커뮤니티 실측과 공식 한도 모두에서 성립하지 않는다.** OpenAI 공식 가격표(developers.openai.com/codex/pricing, 2026-04-19 확인)는 5시간 윈도우당 Pro 로컬 메시지 **300–1,500**건, Plus **45–225**건 범위로 명시한다. Peter Steinberger(OpenAI)의 실사용 로그는 **Pro 1계정에서 3–8 Codex CLI 병렬**이 상한이었고, openai/codex **Issue #9748은 Pro에서 6 subagent 병렬만으로 5시간 한도가 즉시 100% 소진되어 subagent 기능이 "effectively unusable"이라고 보고**한다.

이를 기반으로 한 실무 권장치와 Jarvis 수요 매칭은 다음과 같다.

| 구성 | 상시 안전 동시성 | 피크 허용 | 월 비용 | Jarvis 적합성 |
|---|---|---|---|---|
| Pro 1 | 4–6 | 8(수분) | $200 | **부족** — Ingest 10병렬+Query 5명이면 즉시 429 |
| Pro 1 + Plus 1 | 6–8 | 9–10 | $220 | 경계선 |
| Pro 2 | 8–12 | 16 | $400 | Query는 커버, Ingest 배치 피크에서 borderline |
| **Pro 2 + Plus 1 + API Key fallback** | **10–14 OAuth + 무제한 API** | **20+** | **$420 + 토큰** | **권장** |
| Pro 3 | 12–18 | 24 | $600 | 비용 과다, ToS 리스크 동일 |

**최종 권장 구성**: Pro 계정 2개와 Plus 계정 1개를 CLIProxyAPI `round-robin` 풀에 넣고(합산 상시 10–14), **Ingest Two-Step은 `OPENAI_API_KEY` 경로로 고정**해 ToS 회색지대를 줄이며, Query/Lint만 구독 OAuth를 사용한다. CLIProxyAPI `request-retry: 3`, `quota-exceeded.switch-project: true`, `switch-preview-model: true`를 켜서 **한 계정 쿼터 소진 시 다음 계정으로 자동 롤링**, 최후의 보루로 OpenAI Circuit Breaker fallback이 물린다. Ingest를 구독 OAuth로 돌리는 것은 **OpenAI ToS의 "automated/programmatic" 금지 조항**(openai.com/policies/row-terms-of-use)에 정면 충돌하므로 "작동만 되면 됨" 방침이라도 이 한 경계만큼은 지킬 것을 권한다.

---

## 3. 오늘(토) 타임박스 3단계

### 3.1 오전 3–4시간 — 로컬 PoC

운영자 맥북에서 CLIProxyAPI를 Docker로 기동하고 Codex OAuth 2개(Pro 1, Plus 1) + Claude Code OAuth 1개를 로그인해 `auth-dir`을 채운 뒤 curl 3종으로 동작을 확인한다.

```bash
# 1) 작업 디렉터리
mkdir -p ~/cliproxy-bootstrap/{auths,logs}
cd ~/cliproxy-bootstrap

# 2) 최소 config.yaml (실제 값은 4절 참조)
cat > config.yaml <<'YAML'
port: 8317
auth-dir: "/root/.cli-proxy-api"
api-keys:
  - "sk-jarvis-local-dev"
debug: true
logging-to-file: false
request-retry: 3
max-retry-credentials: 0
max-retry-interval: 30
quota-exceeded:
  switch-project: true
  switch-preview-model: true
routing:
  strategy: "round-robin"
usage-statistics-enabled: true
YAML

# 3) Pro 계정 로그인 (브라우저가 자동으로 열림, 콜백 1455)
docker run --rm -it \
  -p 1455:1455 \
  -v $PWD/config.yaml:/CLIProxyAPI/config.yaml \
  -v $PWD/auths:/root/.cli-proxy-api \
  eceasy/cli-proxy-api:v6.9.29 \
  /CLIProxyAPI/CLIProxyAPI --codex-login
# → auths/ 아래 codex-<uuid>.json 1개 생성. Pro 계정으로 로그인.

# 4) Plus 계정 로그인 (동일 명령 반복, 다른 계정)
docker run --rm -it -p 1455:1455 \
  -v $PWD/config.yaml:/CLIProxyAPI/config.yaml \
  -v $PWD/auths:/root/.cli-proxy-api \
  eceasy/cli-proxy-api:v6.9.29 \
  /CLIProxyAPI/CLIProxyAPI --codex-login
# → codex-<uuid2>.json 추가.

# 5) (선택) Claude Code OAuth — Max 구독 있을 때만
docker run --rm -it -p 54545:54545 \
  -v $PWD/config.yaml:/CLIProxyAPI/config.yaml \
  -v $PWD/auths:/root/.cli-proxy-api \
  eceasy/cli-proxy-api:v6.9.29 \
  /CLIProxyAPI/CLIProxyAPI --claude-login

# 6) 상시 기동
docker run -d --name cliproxy \
  -p 8317:8317 \
  -v $PWD/config.yaml:/CLIProxyAPI/config.yaml \
  -v $PWD/auths:/root/.cli-proxy-api \
  -v $PWD/logs:/CLIProxyAPI/logs \
  eceasy/cli-proxy-api:v6.9.29
```

**curl 3종 스모크 테스트**:

```bash
# A. 비스트리밍 Chat Completions
curl -sS http://127.0.0.1:8317/v1/chat/completions \
  -H "Authorization: Bearer sk-jarvis-local-dev" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-5","messages":[{"role":"user","content":"한국어로 핑 한 단어."}]}' | jq .

# B. 스트리밍
curl -N http://127.0.0.1:8317/v1/chat/completions \
  -H "Authorization: Bearer sk-jarvis-local-dev" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-5","stream":true,"messages":[{"role":"user","content":"1,2,3 스트리밍"}]}'

# C. strict JSON schema
curl -sS http://127.0.0.1:8317/v1/chat/completions \
  -H "Authorization: Bearer sk-jarvis-local-dev" \
  -H "Content-Type: application/json" \
  -d '{
    "model":"gpt-5",
    "messages":[{"role":"user","content":"title=\"hello\", tags=[\"a\",\"b\"] 로 JSON만."}],
    "response_format":{"type":"json_schema","json_schema":{"name":"Page","strict":true,
      "schema":{"type":"object","additionalProperties":false,
        "required":["title","tags"],
        "properties":{"title":{"type":"string"},"tags":{"type":"array","items":{"type":"string"}}}}}}
  }' | jq .
```

3종이 모두 200으로 오면 오전 완료. **Claude 모델 테스트는 반드시 `/v1/chat/completions` 경로로만**(Issue #736 — `/v1/responses`는 system role 변환 버그).

### 3.2 오후 3–4시간 — Jarvis 통합 diff

Jarvis 모노레포 구조에 최소 침습으로 붙인다. 새 디렉터리 생성 없이 **`packages/ai`와 루트 `docker-compose.yml`, `.env.example`, 두 MD 문서만 수정**한다.

**`packages/ai/src/provider.ts` 신설(또는 기존 OpenAI 호출 지점을 이 팩토리 경유로 변경)**:

```ts
// packages/ai/src/provider.ts
import OpenAI from 'openai';

export type Operation = 'ingest' | 'query' | 'lint' | 'graph';

const GATEWAY_URL = process.env.LLM_GATEWAY_URL ?? 'http://cli-proxy:8317/v1';
const GATEWAY_KEY = process.env.LLM_GATEWAY_KEY ?? 'sk-jarvis-local-dev';
const OPENAI_KEY  = process.env.OPENAI_API_KEY!;

function flag(op: Operation): boolean {
  const env = {
    ingest: process.env.FEATURE_SUBSCRIPTION_INGEST,
    query:  process.env.FEATURE_SUBSCRIPTION_QUERY,
    lint:   process.env.FEATURE_SUBSCRIPTION_LINT,
    graph:  'false',
  }[op];
  return env === 'true';
}

const directClient  = () => new OpenAI({ apiKey: OPENAI_KEY, maxRetries: 0, timeout: 120_000 });
const gatewayClient = () => new OpenAI({
  baseURL: GATEWAY_URL,
  apiKey:  GATEWAY_KEY,
  maxRetries: 0,                 // 재시도는 Circuit Breaker가 담당
  timeout: 120_000,
  defaultHeaders: {
    'X-Jarvis-Op': 'pending',    // askLLM wrapper가 덮어씀
  },
});

export function getProvider(op: Operation): { client: OpenAI; via: 'gateway' | 'direct' } {
  // Graph는 LLM 불필요 — 호출해도 direct로만.
  if (op === 'graph' || !flag(op)) return { client: directClient(), via: 'direct' };
  return { client: gatewayClient(), via: 'gateway' };
}

export function resolveModel(op: Operation, requested?: string): string {
  // Jarvis ASK_AI_MODEL 레거시 값 → 게이트웨이 노출 모델 정규화
  const map: Record<string, string> = {
    'gpt-5.4-mini': 'gpt-5-codex-mini',
    'gpt-5.4':      'gpt-5',
  };
  const raw = requested ?? process.env.ASK_AI_MODEL ?? 'gpt-5';
  return map[raw] ?? raw;
}
```

**`packages/ai/src/breaker.ts` 신설 — 3회 연속 실패 시 30초 fallback**:

```ts
// packages/ai/src/breaker.ts
import CircuitBreaker from 'opossum';
import type OpenAI from 'openai';
import { getProvider, type Operation } from './provider';

type ChatArgs = Parameters<OpenAI['chat']['completions']['create']>[0];

async function run(op: Operation, args: ChatArgs) {
  const { client } = getProvider(op);
  return client.chat.completions.create(args);
}

export function makeBreaker(op: Operation) {
  const breaker = new CircuitBreaker(
    (args: ChatArgs) => run(op, args),
    { timeout: 60_000, volumeThreshold: 3, rollingCountTimeout: 30_000,
      resetTimeout: 30_000, name: `llm-${op}` },
  );
  let consec = 0;
  breaker.on('failure', () => { if (++consec >= 3) breaker.open(); });
  breaker.on('success', () => { consec = 0; });
  breaker.fallback(async (args: ChatArgs) => {
    // 강제 direct로 재시도
    const prev = process.env.FEATURE_SUBSCRIPTION_INGEST;
    try {
      process.env[`FEATURE_SUBSCRIPTION_${op.toUpperCase()}`] = 'false';
      return await run(op, args);
    } finally {
      if (prev !== undefined) process.env[`FEATURE_SUBSCRIPTION_${op.toUpperCase()}`] = prev;
    }
  });
  return breaker;
}
```

**기존 LLM 호출 지점 diff — 예시는 Ingest Two-Step**:

```diff
// packages/wiki-agent/src/ingest/two-step.ts
- import OpenAI from 'openai';
- const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
+ import { makeBreaker } from '@jarvis/ai/breaker';
+ import { resolveModel } from '@jarvis/ai/provider';
+ const ingestBreaker = makeBreaker('ingest');

  async function analyze(doc: Doc) {
-   const r = await openai.chat.completions.create({
-     model: process.env.ASK_AI_MODEL ?? 'gpt-5.4-mini',
+   const r = await ingestBreaker.fire({
+     model: resolveModel('ingest'),
      messages: [...],
      response_format: { type: 'json_schema', json_schema: analysisSchema },
+     // @ts-expect-error - SDK 버전에 따라 타입 미반영
+     prompt_cache_key: `jarvis:ingest:${doc.workspaceId}:${doc.rulesetVersion}`,
    });
    return r.choices[0].message.content;
  }
```

**`docker-compose.yml`에 서비스 추가**:

```diff
  services:
    web:
      # ... 기존 설정
+     environment:
+       LLM_GATEWAY_URL: http://cli-proxy:8317/v1
+       LLM_GATEWAY_KEY: ${LLM_GATEWAY_KEY}
+       FEATURE_SUBSCRIPTION_INGEST: ${FEATURE_SUBSCRIPTION_INGEST:-false}
+       FEATURE_SUBSCRIPTION_QUERY:  ${FEATURE_SUBSCRIPTION_QUERY:-false}
+       FEATURE_SUBSCRIPTION_LINT:   ${FEATURE_SUBSCRIPTION_LINT:-false}
+     depends_on:
+       cli-proxy:
+         condition: service_healthy

    worker:
+     environment:
+       LLM_GATEWAY_URL: http://cli-proxy:8317/v1
+       LLM_GATEWAY_KEY: ${LLM_GATEWAY_KEY}
+       FEATURE_SUBSCRIPTION_INGEST: ${FEATURE_SUBSCRIPTION_INGEST:-false}
+       FEATURE_SUBSCRIPTION_LINT:   ${FEATURE_SUBSCRIPTION_LINT:-false}

+   cli-proxy:
+     image: eceasy/cli-proxy-api:v6.9.29
+     container_name: jarvis-cli-proxy
+     restart: unless-stopped
+     ports:
+       - "127.0.0.1:8317:8317"
+     volumes:
+       - ./infra/cliproxy/config.yaml:/CLIProxyAPI/config.yaml:ro
+       - ./infra/cliproxy/auths:/root/.cli-proxy-api:rw
+       - ./infra/cliproxy/logs:/CLIProxyAPI/logs
+     healthcheck:
+       test: ["CMD", "wget", "-qO-", "http://127.0.0.1:8317/v1/models"]
+       interval: 30s
+       timeout: 5s
+       retries: 3
+     networks: [jarvis]
```

**`.env.example` 추가 항목**:

```dotenv
# --- LLM Gateway (CLIProxyAPI) ---
LLM_GATEWAY_URL=http://cli-proxy:8317/v1
LLM_GATEWAY_KEY=sk-jarvis-local-dev

# Operation-level feature flags (default off → OPENAI_API_KEY 직접 호출)
FEATURE_SUBSCRIPTION_INGEST=false
FEATURE_SUBSCRIPTION_QUERY=false
FEATURE_SUBSCRIPTION_LINT=false

# Warm standby — 절대 삭제 금지
OPENAI_API_KEY=sk-proj-...
```

**로컬 E2E**: `pnpm -w install && FEATURE_SUBSCRIPTION_QUERY=true pnpm --filter web dev`. Next.js 3010 포트에서 Query 페이지 1건 스트리밍 성공, `docker logs cli-proxy` 에 요청 라인 1건 확인하면 오후 완료.

### 3.3 저녁 2–3시간 — 월요일 배포 준비

`auth-dir`을 sops로 암호화해 레포에 커밋하고, 단일 명령 배포 스크립트와 1시간 롤백 runbook을 작성한다.

```bash
# auth-dir 암호화 (로컬에서 수행)
age-keygen -o infra/cliproxy/.age.key
cat infra/cliproxy/.age.key | grep 'public key:' > infra/cliproxy/.age.pub
tar czf - -C infra/cliproxy auths \
  | sops --encrypt --age $(cat infra/cliproxy/.age.pub | awk '{print $4}') \
         --input-type binary --output-type binary /dev/stdin \
  > infra/cliproxy/auths.tgz.enc

echo 'infra/cliproxy/auths/' >> .gitignore
echo 'infra/cliproxy/.age.key' >> .gitignore
git add infra/cliproxy/auths.tgz.enc infra/cliproxy/.age.pub
git commit -m "chore: encrypted cliproxy auth bundle"
```

**`scripts/deploy-cliproxy.sh`**:

```bash
#!/usr/bin/env bash
set -euo pipefail
cd /opt/jarvis
export SOPS_AGE_KEY_FILE=/opt/jarvis/infra/cliproxy/.age.key
git pull --ff-only
sops --decrypt infra/cliproxy/auths.tgz.enc | tar xzf - -C infra/cliproxy
chmod 700 infra/cliproxy/auths
chmod 600 infra/cliproxy/auths/*
docker compose pull cli-proxy
docker compose up -d cli-proxy web worker
sleep 5
curl -fsS -H "Authorization: Bearer $LLM_GATEWAY_KEY" \
  http://127.0.0.1:8317/v1/models | jq '.data | length'
```

**`scripts/rollback-cliproxy.sh`** — 1시간 안쪽이 아니라 **1분 롤백**:

```bash
#!/usr/bin/env bash
set -euo pipefail
cd /opt/jarvis
sed -i 's/^FEATURE_SUBSCRIPTION_.*=true/\0_was_true/; s/^FEATURE_SUBSCRIPTION_.*=.*/&/' .env || true
sed -i 's/^FEATURE_SUBSCRIPTION_INGEST=.*/FEATURE_SUBSCRIPTION_INGEST=false/' .env
sed -i 's/^FEATURE_SUBSCRIPTION_QUERY=.*/FEATURE_SUBSCRIPTION_QUERY=false/' .env
sed -i 's/^FEATURE_SUBSCRIPTION_LINT=.*/FEATURE_SUBSCRIPTION_LINT=false/' .env
docker compose up -d --no-deps web worker     # cli-proxy는 유지해도 무방
echo "Rolled back to OPENAI_API_KEY direct. cli-proxy 컨테이너는 보존."
```

DB 마이그레이션이 없는 additive 변경만 했으므로 **롤백은 env 3줄 토글 + `web`·`worker` 재시작**으로 끝난다. `cli-proxy` 컨테이너 자체는 살려둬 다음 재활성 때 재로그인 수고를 없앤다.

**문서 업데이트**. `README.md §9 환경변수`에 `LLM_GATEWAY_URL`·`LLM_GATEWAY_KEY`·`FEATURE_SUBSCRIPTION_{INGEST,QUERY,LINT}` 4항 추가, `WIKI-AGENTS.md §8 feature flag 표`에 operation별 on/off 정책(권장 기본: Query만 true), 변경 이력에 `Phase-W1.5 Subscription Gateway (2026-04-18, v6.9.29 pinned)` 1행 추가.

---

## 4. 운영 config.yaml 전체 원문

```yaml
# infra/cliproxy/config.yaml
port: 8317
host: ""                           # 127.0.0.1 바인딩은 compose의 ports로 제어
auth-dir: "/root/.cli-proxy-api"   # 컨테이너 내부 경로

api-keys:
  - "${LLM_GATEWAY_KEY}"            # compose env_file로 주입 or 평문 하나

debug: false
logging-to-file: true
logs-max-total-size-mb: 500
error-logs-max-files: 30
usage-statistics-enabled: true

# 업스트림 120s 타임아웃 + 재시도 정책
request-retry: 3
max-retry-credentials: 0            # 0 = legacy(모든 credential 순회)
max-retry-interval: 30

quota-exceeded:
  switch-project: true
  switch-preview-model: true

routing:
  strategy: "round-robin"           # v6.9.29 메인에서 확정 지원되는 2종 중 표준

# Codex OAuth alias — Jarvis 레거시 모델명 노출
oauth-model-alias:
  codex:
    - { name: "gpt-5",              alias: "gpt-5" }
    - { name: "gpt-5-codex",        alias: "gpt-5-codex" }
    - { name: "gpt-5-codex-mini",   alias: "gpt-5.4-mini" }   # Jarvis ASK_AI_MODEL 호환
    - { name: "gpt-5-pro",          alias: "gpt-5-pro" }

# Ingest JSON schema strict를 강제하는 override (OAuth 채널 신뢰성 보강)
payload:
  override:
    - models: [{ name: "gpt-5*", protocol: "codex" }]
      params:
        "reasoning.effort": "medium"
  # ※ prompt_cache_key 패스스루 불확실성 대응: 앱에서 직접 최상위로 넣되
  #   OAuth 채널이 이를 strip 해도 치명적이지 않게 설계.

streaming:
  keepalive-seconds: 15             # Next.js fetch idle timeout 회피
  bootstrap-retries: 1

nonstream-keepalive-interval: 20

# OPENAI_API_KEY를 compat upstream으로도 등록해 쿼터 소진 시 CLIProxy 내부 fallback
openai-compatibility:
  - name: "openai-direct"
    prefix: "direct"                # "direct/gpt-5" 형태로 강제 라우팅 가능
    base-url: "https://api.openai.com/v1"
    api-key-entries:
      - api-key: "${OPENAI_API_KEY}"
    models:
      - { name: "gpt-5",            alias: "gpt-5-direct" }
      - { name: "gpt-5-codex-mini", alias: "gpt-5.4-mini-direct" }

# pprof는 localhost만
pprof:
  enable: false
  addr: "127.0.0.1:8316"
```

이 config의 핵심은 세 가지다. **첫째**, `routing: round-robin` + `quota-exceeded.switch-*`로 Pro 2 + Plus 1 풀에서 계정 로테이션을 자동화한다. **둘째**, `oauth-model-alias.codex`에 Jarvis 레거시 `gpt-5.4-mini`를 심어 `packages/ai`의 모델 문자열을 바꾸지 않아도 된다. **셋째**, `openai-compatibility`에 `openai-direct` 프로바이더로 `OPENAI_API_KEY`를 등록해 **게이트웨이 내부에서도 fallback 경로**를 확보한다 — 앱단 Circuit Breaker(OPENAI_API_KEY로 재시도)와 이중 방어.

---

## 5. 오퍼레이션별 통합 세부

**Ingest Two-Step CoT(apps/worker)**. Analysis는 20K+ token 입력과 strict JSON schema가 핵심이다. **이번 가이드의 강한 권고는 Ingest를 `FEATURE_SUBSCRIPTION_INGEST=false`로 두고 OPENAI_API_KEY 경로로 유지하는 것**이다. 이유는 ToS 회색지대 최소화와 strict json_schema의 OAuth 채널 신뢰성 불확실성(prompt_cache_key 패스스루 미확인, CLIProxyAPI v6.9.29에 prompt cache 관련 revert 기록 존재). pg-boss singleton queue(concurrency=1)로 workspace당 직렬 실행을 유지하고, Generation 병렬은 `p-limit(6)`으로 묶어 workspace 내부에서만 fan-out한다. 전체 페이지 Generation 성공 후 **단일 git commit**으로 MindVault 회귀 방지, 중간 실패는 pg-boss dead letter queue로 이동한다.

**Query Page-first(apps/web)**. 사용자 대면 실시간 스트리밍이라 OAuth "개별 사용자 대화" 패턴에 가장 근접 — `FEATURE_SUBSCRIPTION_QUERY=true`를 먼저 켤 가장 안전한 오퍼레이션이다. Next.js App Router Server Action이 `ReadableStream`을 반환하고, OpenAI SDK `.stream()` 시그니처는 그대로 작동한다. 피크 15명 동시 상한은 **미들웨어에서 tenant·user 기준 in-flight 카운터(Redis `INCR`/`DECR`) + 상한 초과 시 429 응답**으로 제어한다. 임원 priority는 이번 pilot 범위 밖, Phase-W3에서 별도 queue로 분리 권장.

**Lint 주간 크론(apps/worker)**. 02:00–05:00 KST 심야 배치이므로 Query와 경합이 없다. Batch API 지원 여부는 **CLIProxyAPI README에서 확인 불가**이므로 단순히 순차 처리로 간다. `FEATURE_SUBSCRIPTION_LINT=true`로 OAuth를 활용해도 주간 1회 수백 건 정도면 Pro 주간 한도 내에서 안전하게 소화된다.

**Graph**. Graphify는 LLM 불필요하므로 이번 통합 영향 없음 — `getProvider('graph')`는 호출되어도 항상 direct 분기.

---

## 6. 놓치기 쉬운 실무 포인트 12개

첫째, **Redis 응답 캐시로 구독 한도 절약**. `sha256({model, messages, temperature})`를 `llm:resp:<hex>` 키로 24시간 TTL 저장, pg-boss `singletonKey`에 동일 해시를 넣어 중복 작업 자체를 예방. 단 스트리밍은 결정론 보장 불가이므로 캐시 제외.

둘째, **단일 계정 토큰 revoke 리스크 완화**. OAuth가 자동 갱신되지만 OpenAI 측 이상행동 탐지 시 revoke될 수 있다(CLIProxyAPI #1451). 운영상 **예비 Plus 계정 2개를 풀에 넣지 않고 로그인 상태만 유지**, `auth-dir`을 **주 1회 `tar + sops` 백업**, chatgpt.com 설정에서 **세션 목록을 주 1회 확인**해 미승인 디바이스를 탐지한다.

셋째, **구독 결제 실패/만료 alert**. OAuth refresh 401/403이 연속 3회 이상 → PagerDuty webhook. 카드 만료 3일 전 알림을 위해 OpenAI 결제일을 Calendar에 고정하고 운영자 1Password vault에 백업 카드 등록.

넷째, **감사 로그 자체 테이블이 필수**. ChatGPT 구독은 platform.openai.com/usage에 집계되지 않는다. Drizzle 스키마로 `llm_audit(id, tenant_id, user_id, request_id, route, provider, model, prompt_hash, prompt_cache_key, input_tokens, cached_input_tokens, output_tokens, latency_ms, virtual_cost_usd, status, error_code, created_at)`를 만들고 **Jarvis 기존 `LLM_DAILY_BUDGET_USD=100` 로직**에 `virtual_cost_usd` 합산을 그대로 연결해 예산 게이트를 유지한다. 가상 단가는 2026-04 rate card 기반(`gpt-5 $1.25/$10 per M`, task 지정치 존중, env override 가능).

다섯째, **법무/보안 전달 최소 사실 3가지**. ① 사내 wiki 콘텐츠가 Plus/Pro 계정 OAuth로 나가므로 chatgpt.com → Settings → Data Controls → "Improve the model for everyone"을 **모든 공유 계정에서 OFF**. ② 한국 개인정보보호법 §26(처리 위탁)·§28의8(국외 이전) 대응으로 처리방침에 OpenAI 위탁·국외이전 기재, 회원가입 약관에 별도 동의 체크박스. ③ 계정 소유자 퇴사 시 revoke 프로세스를 HR 오프보딩 체크리스트에 추가.

여섯째, **Codex JSON schema strict 안정성 재확인**. OAuth 채널에서 strict json_schema 준수가 CLIProxyAPI 버전마다 흔들린다(prompt cache 관련 revert 이력 존재). Ingest Analysis는 failure rate >5% 면 즉시 direct API로 스위치(`FEATURE_SUBSCRIPTION_INGEST=false`). Analysis 단계에 Zod `safeParse`를 2단 재시도로 감싸 로컬 복구 폭을 넓힌다.

일곱째, **API Key warm standby는 절대 삭제 금지**. `OPENAI_API_KEY`는 `.env`에 항상 존재. Circuit Breaker 3회 연속 실패 → 30초간 direct fallback, Grafana `jarvis_llm_circuit_events_total{event="open"}`에 알림.

여덟째, **업스트림 breakage 모니터링**. `v6.9.29`는 주·일 단위 릴리스다. GitHub `router-for-me/CLIProxyAPI` releases RSS를 Slack webhook으로 구독, **staging에서 48시간 검증 후 prod 반영**. 이미지 태그는 `:latest` 금지, 반드시 `:v6.9.xx` 명시.

아홉째, **동시성 스트레스 테스트 필수**. k6 `constant-vus: vus=20, duration=2m`로 TTFB p95 < 4s / error rate < 2% 임계치를 둔다. 상세 스크립트는 7절 부록.

열째, **프롬프트 캐싱 활용**. Codex `prompt_cache_key`를 최상위 필드로 전달하되 OAuth 채널 패스스루 확신이 없으므로 `config.yaml payload.override`에 명시 주입 규칙을 두는 방어층까지 깐다. Jarvis 규칙: `jarvis:<op>:<workspaceId>:<rulesetVersion>`. Ingest Analysis 긴 context(시스템 프롬프트 + 페이지 헤더)를 90% 할인 대상으로 올리면 실질 비용이 눈에 띄게 줄어든다.

열한째, **sticky-session은 해시 기반 자체 구현**. 메인 CLIProxyAPI의 sticky 지원이 불확실하므로, **앱단에서 `workspaceId`의 sha1 mod N으로 `prefix`를 선택**(`direct/`, `pool-a/`, `pool-b/`)해 모델명 앞에 붙이는 방식으로 cache hit율을 올린다. 구현은 `resolveModel`에 옵션 인자 하나 추가.

열두째, **Anthropic 경로의 Cloudflare 이슈 사전 인지**. Claude Code OAuth 로그인은 console.anthropic.com Cloudflare managed challenge에 종종 걸린다(#1659). 해결책은 `TokenURL`을 `api.anthropic.com/v1/oauth/token`으로 바꾸는 패치가 제안되어 있으나 아직 머지 전. **Claude 경로를 이번 pilot 필수 경로로 두지 말고** Ingest의 retry provider 정도로만 활용.

---

## 7. 오늘 체크리스트와 월요일 런북

### 토요일 실행 체크

오전 블록. ☐ `docker run eceasy/cli-proxy-api:v6.9.29 --codex-login`으로 Pro 계정 로그인, `auths/codex-*.json` 생성 확인. ☐ 동일 명령으로 Plus 계정 추가 로그인. ☐ `docker run ... :v6.9.29`로 백그라운드 기동, `curl /v1/models`가 계정 수만큼 모델 목록 반환 확인. ☐ curl 3종(비스트리밍·스트리밍·json_schema)이 모두 200. ☐ `docker logs cli-proxy`에 최소 3행 access log.

오후 블록. ☐ `packages/ai/src/provider.ts`·`breaker.ts` 신설. ☐ `pnpm add -w opossum ioredis`, `pnpm add --filter @jarvis/ai openai@latest`. ☐ 기존 `OpenAI` 직접 인스턴스 생성을 `getProvider(op)` / `makeBreaker(op)` 경유로 교체(wiki-agent, apps/web/app/api, apps/worker). ☐ `docker-compose.yml`에 `cli-proxy` 서비스 추가, `web`·`worker`에 `depends_on: cli-proxy`와 env 3종. ☐ `.env.example`에 5줄 추가 + `.env`에 실값. ☐ `FEATURE_SUBSCRIPTION_QUERY=true`만 먼저 켜고 `pnpm dev` → Query 1건 스트리밍 성공. ☐ `FEATURE_SUBSCRIPTION_LINT=true` 추가 토글 후 워커 1건 성공. ☐ Ingest는 이번 pilot에서 false 유지, direct API 경로 동작 확인.

저녁 블록. ☐ `infra/cliproxy/config.yaml` 운영 버전 커밋. ☐ `age-keygen` + sops로 `auths.tgz.enc` 암호화 커밋(.gitignore에 원본 추가). ☐ `scripts/deploy-cliproxy.sh`·`scripts/rollback-cliproxy.sh` 실행권한. ☐ `README.md §9`에 env 4항, `WIKI-AGENTS.md §8`에 feature flag 표, 변경 이력 1행. ☐ `tests/k6/llm-stream.js` 커밋, `pnpm k6:smoke`로 5 VU 30s 성공. ☐ Grafana alert 규칙 JSON 커밋(`jarvis_llm_circuit_events_total{event="open"} > 0` 5m → PagerDuty). ☐ 월요일 runbook `docs/runbooks/2026-04-20-cliproxy-rollout.md` 1장 커밋.

### 월요일 배포 runbook 요약

```bash
# 서버 도착 후, root 계정으로
git clone git@github.com:yourorg/jarvis.git /opt/jarvis && cd /opt/jarvis
cp .env.example .env && vi .env                    # Gateway 키와 OPENAI_API_KEY 채움
mkdir -p infra/cliproxy && cp /path/to/.age.key infra/cliproxy/.age.key
chmod 600 infra/cliproxy/.age.key
bash scripts/deploy-cliproxy.sh                    # pull → decrypt → up → smoke
# pilot 오픈 (Query만 먼저)
sed -i 's/^FEATURE_SUBSCRIPTION_QUERY=.*/FEATURE_SUBSCRIPTION_QUERY=true/' .env
docker compose up -d --no-deps web worker
```

**실패 시 1분 롤백**: `bash scripts/rollback-cliproxy.sh`. DB 마이그레이션이 없는 additive 변경뿐이므로 상태 손실이 없다.

---

## 8. Phase-W 로드맵 정합

**Phase-W1.5(신설)**는 오늘 작업 자체다: CLIProxyAPI 컨테이너와 `packages/ai` provider 추상, Circuit Breaker, `llm_audit` 테이블, feature flag 뼈대. Phase-W1 기존 2–6번 작업과 병행 가능하다. **Phase-W2**(Two-Step CoT 재작성) 진입 시 LLM 호출부가 이미 gateway 경유 상태라 Analysis의 prompt_cache_key 주입과 Zod 검증만 얹으면 된다. **Phase-W3**(Lint 크론) 역시 동일 경로이며 Batch API 대신 순차 처리로 단순화. **Phase-W4**(5,000명 전사 오픈) 시점엔 Pro 계정을 3–4개로 증설하거나 ChatGPT Business($30/user, 25+ seats) 또는 Azure OpenAI로 전환해 ToS와 DPA 양쪽을 정리한다.

---

## 결론 — 두 가지 명확한 판단

**첫째 판단**: 사용자가 제시한 "Pro 20 / Plus 5 동시" 수치는 2026-04 공식 한도와 커뮤니티 실측 모두에 맞지 않는다. **Pro 1계정 4–6 상시 · Plus 1계정 1–2 상시**가 현실이고, Jarvis 피크 15–20을 잡으려면 **Pro 2 + Plus 1 + OPENAI_API_KEY warm standby 하이브리드**가 유일하게 합리적이다. Ingest 배치는 ToS 위반 소지가 명확하므로 **OPENAI_API_KEY로 고정**하고 구독 OAuth는 Query와 Lint에만 활용하는 역할 분리가 기술적으로도 안전하다.

**둘째 판단**: 오늘 하루 안에 끝나는 구조는 **"신규 디렉터리 없이 기존 `packages/ai`에 provider 팩토리 + Breaker 두 파일 추가, `docker-compose.yml`에 서비스 하나 추가, env 5줄 추가"**다. Feature flag가 operation별로 분리돼 있고 DB 변경이 additive(`llm_audit`만 추가)라 **1분 env 토글로 롤백** 가능하다. CLIProxyAPI 자체는 rolling release에 가까워 이미지 태그를 `:v6.9.29`로 고정하고 staging 48시간 검증 규칙을 지키는 것이 장기 운영의 가장 큰 레버다. 이 가이드의 체크리스트를 오늘 순서대로 밟으면 월요일 서버 도착 후 `git pull && bash scripts/deploy-cliproxy.sh` 한 줄로 pilot이 올라간다.