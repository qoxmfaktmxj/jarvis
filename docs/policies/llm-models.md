# Jarvis LLM 모델 정책 (FIXED)

**최종 업데이트:** 2026-04-23
**SSoT:** 이 문서. 다른 문서·README·주석·코드·`.env`에 다른 모델이 적혀 있으면 **이 문서가 이긴다**.
**집행:** `scripts/check-llm-models.mjs` — Claude Code PostToolUse hook(advisory) + pre-commit + CI + 수동.

> **왜 이 문서가 있나.** Jarvis는 과거에 `gpt-4o-mini`, `gpt-4.1-mini`, `claude-3-5-sonnet`, Ollama `bge-m3` 등 여러 모델이 코드·환경변수·문서에 혼재했다. 2026-04-21에 `.env`에 남아 있던 `ASK_AI_MODEL=gpt-4o-mini` 때문에 ASK 런타임이 CLIProxy에서 `502 unknown provider` 에러를 뿜은 사건이 유발 원인. 이 사건이 반복되는 걸 막기 위해 **허용 모델을 좁게 고정하고 자동 lint로 집행**한다.
>
> **2026-04-23 Harness-first 전환:** embedding 파이프라인 전면 폐지. Ask AI 는 tool-use agent 가 wiki-fs 를 직접 탐색하는 구조로 바뀌어 **벡터 유사도 검색이 더 이상 필요하지 않다**. `text-embedding-3-small` 을 포함한 모든 embedding 모델은 서비스 런타임에서 **금지**.

---

## 1. 허용 모델 (whitelist)

### 1.1 OpenAI — 생성·reasoning·라우팅

| 모델 | 용도 | 비고 |
|------|------|------|
| `gpt-5.4` | 합성·reasoning·긴 합성 태스크, Query 최종 답변 합성 | CLIProxy 경유 (→ 내부 `gpt-5`) |
| `gpt-5.4-mini` | **기본값.** 라우팅·셀렉터·lint contradictions·ingest analyze/generate·tutor·cluster digest·query shortlist·fill-aliases 등 모든 일반 호출 | CLIProxy 경유 (→ 내부 `gpt-5-codex-mini`) |

### 1.2 OpenAI — 임베딩 (폐지)

> **2026-04-23 Harness-first 전환.** embedding 모델은 서비스 런타임에서 **전면 금지**. Ask AI 가 tool-use agent 로 wiki-fs 를 grep·read·follow-link 방식으로 직접 탐색하므로 벡터 유사도 검색이 불필요해졌다. `knowledge_page.embedding` / `knowledge_claim.embedding` / `precedent_case.embedding` 컬럼 및 HNSW 인덱스, `embed_cache` 테이블은 migration 0037/0038 로 제거.

| 모델 | 상태 |
|------|------|
| — | **허용된 embedding 모델 없음.** `text-embedding-3-small` 은 §2.1 로 이동. |

### 1.3 CLIProxy 게이트웨이 내부 모델 ID

CLIProxy는 OpenAI Codex API를 경유해 실제로 다음 모델 ID를 호출한다. **이들은 `infra/cliproxy/config.yaml` 매핑 전용**이며, 애플리케이션 코드에서는 `gpt-5.4` / `gpt-5.4-mini` 별칭만 쓴다.

- `gpt-5`
- `gpt-5-codex`
- `gpt-5-codex-mini`
- `gpt-5-pro`

---

## 2. 금지 모델 (blocklist)

### 2.1 OpenAI

- `gpt-4`, `gpt-4o`, `gpt-4o-mini`, `gpt-4-turbo`, `gpt-4-vision`
- `gpt-4.1`, `gpt-4.1-mini`
- `gpt-3`, `gpt-3.5-turbo`
- Reasoning 계열: `o1`, `o1-mini`, `o1-preview`, `o3`, `o3-mini`, `o4-mini`
- **임베딩 전체 금지** (Harness-first 전환): `text-embedding-3-small`, `text-embedding-3-large`, `text-embedding-ada-002`

### 2.2 Anthropic

- **서비스 런타임에서 `claude-*` 사용 금지** (`@anthropic-ai/sdk` import 금지)
- `.env`에 `ANTHROPIC_API_KEY`가 존재해도 런타임은 호출하지 않는다
- `claude-3-5-sonnet`, `claude-3-5-haiku`, `claude-3-opus`, `claude-2`, `claude-instant` 등 전부

### 2.3 로컬 / 오픈소스

- **Ollama** (`ollama`, `bge-m3`, `nomic-embed-text` 등 로컬 임베딩·생성)
- **llama.cpp** (`node-llama-cpp`)
- **HuggingFace GGUF** (`Qwen3-Embedding`, `embeddinggemma` 등)
- **사유:** 2026-04-20 page-first retrieval 설계 확정으로 embedding 의존도가 낮아져 로컬화 필요성이 사라졌다. `docs/superpowers/specs/2026-04-20-llm-first-retrieval-design.md` §423 "Embedding 로컬화 — 보류" 결정.

---

## 3. Claude (Anthropic) 사용 규칙

| 환경 | 사용 |
|------|------|
| Claude Code CLI (개발·리팩토링·리뷰) | ✅ 허용 |
| Codex CLI (개발 도구) | ✅ 허용 |
| Jarvis 서비스 런타임 (`apps/web`, `apps/worker`) | ❌ **금지** |
| Jarvis 스크립트 (`scripts/`) | ❌ 금지 (OpenAI만) |

**규칙:**
- `@anthropic-ai/sdk` 패키지를 `apps/**`, `packages/**`, `scripts/**`에 **import 하지 않는다**.
- 사용자 요청을 받아 Claude로 프록시 호출하지 않는다.
- `ANTHROPIC_API_KEY`가 `.env`에 존재해도 **Jarvis 코드는 그 값을 사용하지 않는다**. (개발자의 Claude Code CLI가 별도로 사용)

---

## 4. 예외 절차

새 모델을 도입하거나 금지 모델을 한시적으로 허용해야 할 경우:

1. **이 문서(`docs/policies/llm-models.md`)의 §1 허용 리스트에 추가**하는 PR 작성
2. **`scripts/check-llm-models.mjs`의 허용/금지 패턴 동기 업데이트**
3. **`README.md §6.5` 정책 표 업데이트**
4. PR 본문에 다음 포함:
   - 도입 근거 (성능·비용·기능 비교)
   - 대안 검토 (왜 `gpt-5.4` / `gpt-5.4-mini`로 안 되는가)
   - 비용 영향 추정 (월간 $ 증가분)
   - 롤백 계획
5. 팀 리뷰 **1건 이상**
6. 머지 후 이 문서 §7 변경 이력 갱신

---

## 5. 집행 (Enforcement)

### 5.1 자동 lint

`scripts/check-llm-models.mjs`가 다음 위치에서 동작:

| 위치 | 모드 | 동작 |
|------|------|------|
| Claude Code PostToolUse hook | `--hook` | Advisory (stderr 경고, 차단 안 함) |
| 로컬 pre-commit | `--precommit` | Blocking (exit 1) |
| CI (GitHub Actions) | `--ci` | Blocking (exit 1) |
| 수동 | 없음 | Blocking (exit 1) |

### 5.2 스캔 범위

**포함:**
- `.env`, `.env.example`, `.env.local`, `.env.production`, `.env.development`
- `apps/**/*.{ts,tsx,js,mjs,cjs}`
- `packages/**/*.{ts,tsx,js,mjs,cjs}`
- `scripts/**/*.{ts,mjs,js,cjs,py}`
- `infra/**/*.{yaml,yml,json}`

**제외:**
- `docs/` — 분석·레퍼런스 문서는 금지 리터럴 언급이 정상 (과거 결정 기록·외부 도구 설명)
- `reference_only/` — 외부 참조 레포
- `node_modules/`, `.next/`, `.turbo/`, `dist/`, `build/`, `coverage/`, `.git/`

### 5.3 예외 라인

라인 주석에 `policy-exempt: <이유>` 또는 `llm-models.md` 참조가 포함되면 해당 라인은 스킵 (정책 문서 자체 또는 근거 있는 예외를 허용하기 위함).

---

## 6. 런타임 모델 선택 규약

### 6.1 환경변수 우선순위

```ts
const MODEL = process.env.ASK_AI_MODEL ?? "gpt-5.4-mini";
```

- 기본값은 **항상 `gpt-5.4-mini`**
- `.env`에 다른 값이 있더라도 이 정책에 없는 모델이면 **lint가 차단**
- 배포 환경별 override는 `apps/web/lib/env.ts` Zod schema에 `.refine()` 추가해 런타임에도 검증 (선택적)

### 6.2 용도별 모델 선택 가이드

| 상황 | 모델 | 근거 |
|------|------|------|
| 페이지 셀렉터 / 라우팅 / shortlist | `gpt-5.4-mini` | 작은 모델로 충분. p95 < 300ms |
| Ingest Analyze (JSON 구조화 추출) | `gpt-5.4-mini` | structured output 안정적, 비용 저렴 |
| Ingest Generate (페이지 본문 생성) | `gpt-5.4-mini` | 긴 컨텍스트에서도 일관성 |
| Lint contradictions | `gpt-5.4-mini` | 단순 y/n 평가 |
| Query 최종 답변 합성 (복잡한 cross-ref) | `gpt-5.4` | 긴 reasoning 필요 시 |
| Query 최종 답변 합성 (일반) | `gpt-5.4-mini` | 비용 절감 |
| Tutor / 사용자 대화 | `gpt-5.4-mini` | 대화형 기본 |
| Cluster digest 생성 | `gpt-5.4-mini` | 대량 호출, 비용 민감 |
| 임베딩 | — | **폐지.** Harness-first 전환으로 벡터 유사도 대신 LLM tool-use 탐색 사용 |

---

## 7. 변경 이력

| 날짜 | 변경 | 사유 |
|------|------|------|
| 2026-04-21 | 정책 초안 제정 + 자동 lint 도입 | `.env`에 남아 있던 `ASK_AI_MODEL=gpt-4o-mini`가 CLIProxy 502 에러 유발. 과거 여러 차례 `gpt-4*` 언급 제거 작업이 있었으나 `.env`/스크립트/테스트에 잔존분이 남아있어 재발. 정책 + lint로 근본 해결 |
| 2026-04-23 | **Harness-first 전환** — `text-embedding-3-small` 를 FORBIDDEN 으로 이동. 모든 embedding 모델 금지 | Ask AI 가 tool-use agent (`wiki-grep` / `wiki-read` / `wiki-follow-link` / `wiki-graph-query`) 로 wiki-fs 를 직접 탐색하는 구조로 전환됨. 벡터 유사도 검색이 불필요하며, embedding 파이프라인 (`embed.ts`, `embed_cache`, `knowledge_page.embedding` 등) 은 migration 0037/0038 로 동시 삭제 |
