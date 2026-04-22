# Multi-Provider LLM Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current hardcoded OpenAI-only provider with a multi-provider (OpenAI + Anthropic + Gemini + Ollama) factory driven by DB config. Enable three modes — **company system subscription** (기본), **per-user BYO subscription**, **per-workspace API-key** — all selectable from an admin UI and a user settings page. Keep embeddings strictly local via Ollama.

**Architecture:** `packages/ai/providers/` holds one adapter per vendor exposing a unified `chat / stream / embed` interface. A resolver reads `llm_provider_config` + `llm_credential` (DB, scoped **user > workspace > global > env fallback**) and returns the right adapter per `Operation`. CLIProxy-style OAuth gateways cover subscription modes (OpenAI existing, Claude+Gemini newly wired in Phase C). `packages/secret/` stores API keys/OAuth tokens AES-256-GCM encrypted. Ollama handles all embeddings (HNSW re-indexed when dim changes). Admin UI + user settings page drive all config without restart.

**Tech Stack:** Next.js 15 App Router, React 19, Drizzle ORM (PostgreSQL 16 + pg_trgm + pgvector + HNSW), Vercel AI SDK (`ai`, `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`), Ollama REST, pg-boss worker queue, Vitest + Playwright.

---

## Context for New Session (READ FIRST)

**Branch:** `feat/llm-multi-provider`
**Base:** `main` (as of 2026-04-21, after PR #10 merge `6901ca7`)
**Expected duration:** ~14 working days (3 weeks buffered)
**Worktree:** single worktree is fine — no isolation needed

**Start commands (paste verbatim into new session):**

```bash
cd C:/Users/kms/Desktop/dev/jarvis
git fetch origin
git switch main
git pull origin main
git switch -c feat/llm-multi-provider
# Verify: plan file present
ls docs/superpowers/plans/2026-04-21-multi-provider-llm-integration.md
# Verify: LLM policy lint clean
node scripts/check-llm-models.mjs
# Read this plan Phase-by-Phase and execute using subagent-driven-development
```

**Preconditions assumed at start:**
- `OPENAI_API_KEY` in `.env`/`apps/web/.env.local` may be placeholder — this work makes it optional (system subscription is default)
- Docker Compose services running: `postgres` (5436), `minio` (9100/9101), `cli-proxy` (8317, OpenAI OAuth)
- Node 22+, pnpm 9+
- **Optional until Phase D:** Ollama installed locally (`https://ollama.ai/download`, then `ollama pull bge-m3`)

**Existing constraints (DO NOT VIOLATE):**
- `docs/policies/llm-models.md` — currently allows ONLY OpenAI `gpt-5.4` / `gpt-5.4-mini` + `text-embedding-3-small`. **Task A5 rewrites this policy** to permit Anthropic/Gemini/Ollama with the new whitelist. No code may reference the new models until A5 lands.
- `scripts/check-llm-models.mjs` — **Task A6 extends the allow-list**. Before that task, any Claude/Gemini literal trips the lint.
- DB sensitivity + RBAC rules (`packages/db/schema/knowledge.ts`, `packages/auth/rbac.ts`) must be preserved — new `admin:llm_config` permission is added alongside, not replacing existing ones
- `knowledge_page.embedding` is HNSW-indexed at 1536d (`text-embedding-3-small`). Ollama models use **different** dims (bge-m3 = 1024d). **Task A7 migrates this column to a configurable dim** and re-indexes. All ingest/search code must read the dim from config, not hardcode 1536.
- `.env`/`apps/web/.env.local` are gitignored — do NOT commit credentials
- Jarvis "subscription-first" default: every operation's default `mode` must be `system_subscription` unless env overrides

---

## Scope

### In scope

- **4 providers:** OpenAI · Anthropic · Gemini · Ollama (Ollama for `embed` only in v1)
- **4 modes:** `system_subscription`, `user_subscription` (BYO), `api_key`, `local`
- **4 operations:** `query` · `ingest` · `lint` · `embed`
- **DB-driven config** with per-scope precedence (user > workspace > global > env)
- **Admin UI** at `/admin/llm-providers` (RBAC: `admin:llm_config`)
- **User settings UI** at `/settings/llm` (every authenticated user)
- **Encrypted credential storage** via `packages/secret/` (AES-256-GCM)
- **BYO OAuth flow** for Claude / Gemini / OpenAI user subscriptions (where a free/OSS proxy exists — Phase C investigation)
- **Policy update** (`docs/policies/llm-models.md`) + lint allow-list expansion

### Out of scope (explicit)

- Multi-model ensembling / primary→fallback chain (only simple retry in E5)
- Fine-tuned model hosting
- Streaming proxy re-implementation — use Vercel AI SDK streams as-is
- Cost/usage dashboard redesign (`llm_call_log` table stays; dashboard UI is a separate PR)
- Anthropic/Gemini for `embed` op (v1 keeps Ollama only — per user decision)
- Ingest via subscription (still ToS-direct per existing policy; user subscription allowed for query/lint only)

---

## File Structure

### New files

```
packages/ai/providers/
  types.ts                      # Provider / Operation / Mode / Unified interfaces
  openai.ts                     # OpenAI adapter (subscription + api_key)
  anthropic.ts                  # Anthropic adapter
  gemini.ts                     # Google GenAI adapter
  ollama.ts                     # Ollama local (embed only)
  __tests__/openai.test.ts
  __tests__/anthropic.test.ts
  __tests__/gemini.test.ts
  __tests__/ollama.test.ts

packages/ai/gateway/
  cliproxy-openai.ts            # Wrap existing CLIProxy
  cliproxy-claude.ts             # Claude subscription OAuth proxy (Phase C1)
  cliproxy-gemini.ts             # Gemini subscription OAuth proxy (Phase C2)

packages/ai/
  resolver.ts                   # DB lookup -> {provider, mode, credential}
  client.ts                     # Unified chat / stream / embed
  __tests__/resolver.test.ts
  __tests__/client.integration.test.ts

packages/db/schema/
  llm-provider-config.ts
  llm-credential.ts

packages/db/drizzle/
  0037_llm_provider_config.sql
  0038_llm_credential.sql
  0039_embedding_dim_flex.sql   # knowledge_page.embedding -> vector(1024) + HNSW rebuild

packages/secret/
  encrypt.ts                    # AES-256-GCM (if not present)
  master-key.ts                 # Env-based master key loader
  __tests__/encrypt.test.ts

apps/web/app/(app)/admin/llm-providers/
  page.tsx
  actions.ts
  [op]/page.tsx
  _components/ProviderMatrix.tsx
  _components/CredentialForm.tsx
  _components/BYOConnectFlow.tsx

apps/web/app/(app)/settings/llm/
  page.tsx
  actions.ts
  _components/UserSubscriptionCard.tsx
  _components/UserApiKeyCard.tsx

apps/web/app/api/admin/llm-config/route.ts    # GET/POST/PUT/DELETE
apps/web/app/api/admin/llm-credential/route.ts # GET (masked)/POST/DELETE
apps/web/app/api/byo/oauth-start/route.ts
apps/web/app/api/byo/oauth-callback/route.ts

infra/cliproxy-claude/
  docker-compose.yml
  config.yaml
  README.md
infra/cliproxy-gemini/
  docker-compose.yml
  config.yaml
  README.md

docs/policies/llm-models.md            # UPDATED (Task A5 rewrites)
docs/ops/ollama-setup.md               # NEW — install + model pull
docs/ops/byo-subscription-flow.md      # NEW — user flow for BYO

apps/web/messages/ko.json              # MODIFY — Admin.llm.*, Settings.llm.* keys
apps/web/messages/en.json              # MODIFY — English equivalents
```

### Modified files

| Path | Change |
|------|--------|
| `packages/ai/provider.ts` | Deprecated thin shim calling `resolver.ts`. Kept for compat |
| `packages/ai/ask.ts`, `tutor.ts`, `page-first/index.ts`, `page-first/synthesize.ts`, `embed.ts` | Replace direct `getProvider()` with `client.chat()` / `client.embed()` |
| `apps/worker/src/jobs/ingest/analyze.ts`, `ingest/generate.ts`, `wiki-lint/contradictions.ts`, `wiki-bootstrap.ts` | Same |
| `apps/web/lib/env.ts` | Add `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `OLLAMA_URL`, `SECRET_MASTER_KEY` (all optional) |
| `apps/web/lib/navigation/routes.ts` | Register `/admin/llm-providers`, `/settings/llm` |
| `apps/web/components/layout/Sidebar.tsx` | Add menu items (gated by RBAC) |
| `packages/auth/rbac.ts` | Add `admin:llm_config` permission + assign to `admin` role |
| `packages/db/schema/index.ts` | Re-export new schemas |
| `docker/docker-compose.yml` | Add `cli-proxy-claude`, `cli-proxy-gemini` services |
| `.env.example`, `apps/web/.env.local.example` | Add new env docs |
| `scripts/check-llm-models.mjs` | Extend allow-list (Task A6) |
| `README.md` §6, §6.5 | Tech-stack + policy summary refresh |
| `packages/search/pg-search.ts` | Read embedding dim from config (not 1536 hardcode) |

---

## Phases (execution order)

- **Phase A** (2d): Schema + policy + encryption foundation
- **Phase B** (3d): Provider adapters (4 vendors)
- **Phase C** (2d): Subscription gateway research + wire-up (Claude, Gemini)
- **Phase D** (2d): Resolver + unified client + migrate call sites
- **Phase E** (3d): Admin UI + API routes + RBAC
- **Phase F** (2d): User BYO settings + OAuth flow
- **Phase G** (2d): Integration tests + docs + release

Phase order is rigid — each assumes the previous. Do not parallelize Phase A→D. Phase E+F may parallelize after Phase D lands.

---

## Phase A: Schema + Policy + Encryption Foundation

### Task A1: Add `llm_credential` schema (credential table first — FK target)

**Why credential first:** `llm_provider_config.credential_id` references it.

**Files:**
- Create: `packages/db/schema/llm-credential.ts`
- Modify: `packages/db/schema/index.ts` — append `export * from "./llm-credential.js";`
- Test: `packages/db/__tests__/llm-credential.schema.test.ts`

- [ ] **Step 1: Write failing test for schema shape**

```ts
// packages/db/__tests__/llm-credential.schema.test.ts
import { describe, it, expect } from "vitest";
import { llmCredential } from "../schema/llm-credential";

describe("llmCredential schema", () => {
  it("has all required columns", () => {
    const c = llmCredential as unknown as Record<string, unknown>;
    for (const k of [
      "id", "scope", "scopeId", "provider", "mode",
      "secretRef", "label", "maskedKey", "verifiedAt",
      "lastUsedAt", "enabled", "createdAt", "updatedAt",
    ]) {
      expect(c[k], `missing column: ${k}`).toBeDefined();
    }
  });
});
```

- [ ] **Step 2: Run test, expect fail**

```bash
pnpm --filter @jarvis/db test -t "llmCredential schema"
```

Expected: `Cannot find module './schema/llm-credential'`

- [ ] **Step 3: Implement schema**

```ts
// packages/db/schema/llm-credential.ts
import {
  pgTable, uuid, varchar, boolean, timestamp, index, uniqueIndex,
} from "drizzle-orm/pg-core";

export const llmCredential = pgTable(
  "llm_credential",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scope: varchar("scope", { length: 16 }).notNull(),   // 'workspace' | 'user'
    scopeId: uuid("scope_id").notNull(),
    provider: varchar("provider", { length: 16 }).notNull(), // 'openai'|'anthropic'|'gemini'
    mode: varchar("mode", { length: 24 }).notNull(),     // 'api_key' | 'user_subscription'
    secretRef: varchar("secret_ref", { length: 128 }).notNull(), // packages/secret reference
    label: varchar("label", { length: 64 }).notNull(),   // user-facing name
    maskedKey: varchar("masked_key", { length: 32 }),    // "sk-...last4"
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    scopeIdx: index("llm_credential_scope_idx").on(t.scope, t.scopeId),
    uniqueLabel: uniqueIndex("llm_credential_unique_label")
      .on(t.scope, t.scopeId, t.provider, t.label),
  }),
);

export type LlmCredential = typeof llmCredential.$inferSelect;
export type NewLlmCredential = typeof llmCredential.$inferInsert;
```

- [ ] **Step 4: Register export**

Edit `packages/db/schema/index.ts`, add after last `export * from ...`:

```ts
export * from "./llm-credential.js";
```

- [ ] **Step 5: Verify test passes**

```bash
pnpm --filter @jarvis/db test -t "llmCredential schema"
```

Expected: PASS (1 test).

- [ ] **Step 6: Commit**

```bash
git add packages/db/schema/llm-credential.ts packages/db/schema/index.ts \
        packages/db/__tests__/llm-credential.schema.test.ts
git commit -m "feat(db): add llm_credential schema (workspace/user scoped, encrypted secretRef)"
```

---

### Task A2: Add `llm_provider_config` schema with FK to credential

**Files:**
- Create: `packages/db/schema/llm-provider-config.ts`
- Modify: `packages/db/schema/index.ts` (add export)
- Test: `packages/db/__tests__/llm-provider-config.schema.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// packages/db/__tests__/llm-provider-config.schema.test.ts
import { describe, it, expect } from "vitest";
import { llmProviderConfig } from "../schema/llm-provider-config";

describe("llmProviderConfig schema", () => {
  it("has all required columns", () => {
    const c = llmProviderConfig as unknown as Record<string, unknown>;
    for (const k of [
      "id", "scope", "scopeId", "operation", "provider", "mode",
      "model", "credentialId", "gatewayUrl", "priority", "enabled",
      "createdAt", "updatedAt",
    ]) {
      expect(c[k], `missing column: ${k}`).toBeDefined();
    }
  });
});
```

- [ ] **Step 2: Run test, expect fail**

```bash
pnpm --filter @jarvis/db test -t "llmProviderConfig schema"
```

- [ ] **Step 3: Implement schema**

```ts
// packages/db/schema/llm-provider-config.ts
import {
  pgTable, uuid, varchar, integer, boolean, timestamp, index, uniqueIndex,
} from "drizzle-orm/pg-core";
import { llmCredential } from "./llm-credential";

export const llmProviderConfig = pgTable(
  "llm_provider_config",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scope: varchar("scope", { length: 16 }).notNull(),
    scopeId: uuid("scope_id"), // nullable for global
    operation: varchar("operation", { length: 16 }).notNull(),
    provider: varchar("provider", { length: 16 }).notNull(),
    mode: varchar("mode", { length: 24 }).notNull(),
    model: varchar("model", { length: 64 }).notNull(),
    credentialId: uuid("credential_id").references(() => llmCredential.id, {
      onDelete: "set null",
    }),
    gatewayUrl: varchar("gateway_url", { length: 256 }),
    priority: integer("priority").notNull().default(100),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    scopeOpIdx: index("llm_provider_config_scope_op_idx").on(
      t.scope, t.scopeId, t.operation, t.priority,
    ),
    uniqueConfig: uniqueIndex("llm_provider_config_unique")
      .on(t.scope, t.scopeId, t.operation, t.provider),
  }),
);

export type LlmProviderConfig = typeof llmProviderConfig.$inferSelect;
export type NewLlmProviderConfig = typeof llmProviderConfig.$inferInsert;
```

- [ ] **Step 4: Register export** — `packages/db/schema/index.ts` add `export * from "./llm-provider-config.js";`

- [ ] **Step 5: Verify test passes**

```bash
pnpm --filter @jarvis/db test -t "llmProviderConfig schema"
```

- [ ] **Step 6: Commit**

```bash
git add packages/db/schema/llm-provider-config.ts packages/db/schema/index.ts \
        packages/db/__tests__/llm-provider-config.schema.test.ts
git commit -m "feat(db): add llm_provider_config schema with credential FK"
```

---

### Task A3: Generate migrations 0037 + 0038

**Files:**
- Create: `packages/db/drizzle/0037_llm_provider_config.sql` (auto-generated)
- Create: `packages/db/drizzle/0038_llm_credential.sql` (auto-generated)
- Modify: `packages/db/drizzle/meta/_journal.json` (auto)

- [ ] **Step 1: Generate migration**

```bash
pnpm db:generate
```

Expected: two new `.sql` files appear with `CREATE TABLE llm_credential` and `CREATE TABLE llm_provider_config` + indexes.

- [ ] **Step 2: Review generated SQL**

Open both files. Verify:
- `llm_credential` created first (FK target)
- `CREATE UNIQUE INDEX llm_credential_unique_label` present
- `llm_provider_config.credential_id` has `REFERENCES llm_credential(id) ON DELETE SET NULL`

- [ ] **Step 3: Apply migration locally**

```bash
pnpm db:migrate
```

Expected: both tables created. Verify:

```bash
docker exec jarvis-postgres psql -U jarvis -d jarvis -c "\d llm_credential"
docker exec jarvis-postgres psql -U jarvis -d jarvis -c "\d llm_provider_config"
```

- [ ] **Step 4: Verify schema-drift check passes**

```bash
node scripts/check-schema-drift.mjs
```

Expected: `✅ No schema drift.`

- [ ] **Step 5: Commit**

```bash
git add packages/db/drizzle/0037_llm_provider_config.sql \
        packages/db/drizzle/0038_llm_credential.sql \
        packages/db/drizzle/meta/_journal.json
git commit -m "feat(db): migrations 0037+0038 for llm_provider_config + llm_credential"
```

---

### Task A4: AES-256-GCM encryption helper in `packages/secret/`

**Files:**
- Check first: `packages/secret/` — if `encrypt.ts` already exists, extend; if not, create
- Create: `packages/secret/encrypt.ts`
- Create: `packages/secret/master-key.ts`
- Test: `packages/secret/__tests__/encrypt.test.ts`

- [ ] **Step 1: Inspect existing package**

```bash
ls packages/secret/
cat packages/secret/package.json
```

If `encrypt.ts` exists, read it and adapt. If not, proceed to Step 2.

- [ ] **Step 2: Write failing test**

```ts
// packages/secret/__tests__/encrypt.test.ts
import { describe, it, expect } from "vitest";
import { encrypt, decrypt } from "../encrypt";

describe("encrypt/decrypt", () => {
  const masterKey = "0".repeat(64); // 32 bytes hex

  it("roundtrips a secret", () => {
    const plain = "sk-proj-fake-key-12345";
    const cipher = encrypt(plain, masterKey);
    expect(cipher).not.toContain(plain);
    expect(cipher).toMatch(/^enc:v1:/);
    expect(decrypt(cipher, masterKey)).toBe(plain);
  });

  it("produces different ciphertext each call (random IV)", () => {
    const plain = "secret";
    const a = encrypt(plain, masterKey);
    const b = encrypt(plain, masterKey);
    expect(a).not.toBe(b);
  });

  it("rejects tampered ciphertext", () => {
    const cipher = encrypt("secret", masterKey);
    const tampered = cipher.slice(0, -4) + "XXXX";
    expect(() => decrypt(tampered, masterKey)).toThrow();
  });
});
```

- [ ] **Step 3: Run test, expect fail**

```bash
pnpm --filter @jarvis/secret test
```

- [ ] **Step 4: Implement `encrypt.ts`**

```ts
// packages/secret/encrypt.ts
import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

const VERSION = "v1";
const ALGO = "aes-256-gcm";
const IV_LEN = 12;

/** Encrypt plaintext with master key (hex-encoded, 64 chars = 32 bytes). */
export function encrypt(plaintext: string, masterKeyHex: string): string {
  if (!/^[0-9a-f]{64}$/i.test(masterKeyHex)) {
    throw new Error("masterKey must be 64-char hex (32 bytes)");
  }
  const key = Buffer.from(masterKeyHex, "hex");
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:${VERSION}:${iv.toString("base64url")}:${tag.toString("base64url")}:${enc.toString("base64url")}`;
}

export function decrypt(payload: string, masterKeyHex: string): string {
  const parts = payload.split(":");
  if (parts.length !== 5 || parts[0] !== "enc" || parts[1] !== VERSION) {
    throw new Error("Invalid ciphertext format");
  }
  const [, , ivB64, tagB64, encB64] = parts;
  const key = Buffer.from(masterKeyHex, "hex");
  const iv = Buffer.from(ivB64, "base64url");
  const tag = Buffer.from(tagB64, "base64url");
  const enc = Buffer.from(encB64, "base64url");
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString("utf8");
}
```

- [ ] **Step 5: Implement `master-key.ts`**

```ts
// packages/secret/master-key.ts
export function masterKey(): string {
  const k = process.env["SECRET_MASTER_KEY"];
  if (!k) {
    throw new Error(
      "SECRET_MASTER_KEY is not set. Generate with: node -e \"console.log(require('node:crypto').randomBytes(32).toString('hex'))\"",
    );
  }
  if (!/^[0-9a-f]{64}$/i.test(k)) {
    throw new Error("SECRET_MASTER_KEY must be 64-char hex (32 bytes).");
  }
  return k;
}
```

- [ ] **Step 6: Run tests, expect pass**

```bash
pnpm --filter @jarvis/secret test
```

Expected: 3 pass.

- [ ] **Step 7: Commit**

```bash
git add packages/secret/encrypt.ts packages/secret/master-key.ts \
        packages/secret/__tests__/encrypt.test.ts
git commit -m "feat(secret): AES-256-GCM encrypt/decrypt for LLM credentials"
```

---

### Task A5: Update `docs/policies/llm-models.md` for multi-provider

**Files:**
- Modify: `docs/policies/llm-models.md`

- [ ] **Step 1: Read current policy**

```bash
cat docs/policies/llm-models.md | head -100
```

- [ ] **Step 2: Replace §1 "허용 모델" block**

New allow-list (replace entire §1 content):

```markdown
## 1. 허용 모델 (whitelist)

### 1.1 OpenAI — 생성·reasoning·라우팅

| 모델 | 용도 |
|------|------|
| `gpt-5.4` | 합성·reasoning·긴 합성 태스크 |
| `gpt-5.4-mini` | 기본. 라우팅·셀렉터·lint·ingest 등 |

### 1.2 Anthropic — 생성·reasoning (2026-04-21 신규)

| 모델 | 용도 |
|------|------|
| `claude-sonnet-4.7` | 합성·reasoning (OpenAI gpt-5.4 대체) |
| `claude-haiku-4.7` | 라우팅·셀렉터 (gpt-5.4-mini 대체) |

### 1.3 Google — 생성·reasoning (2026-04-21 신규)

| 모델 | 용도 |
|------|------|
| `gemini-2.5-pro` | 합성·reasoning |
| `gemini-2.5-flash` | 라우팅·셀렉터 |

### 1.4 임베딩 (Ollama 로컬 전용)

| 모델 | 차원 | 비고 |
|------|------|------|
| `bge-m3` | 1024 | 기본. 한국어 우수 |
| `Qwen3-Embedding-0.6B` | 1024 | 대안 |

OpenAI `text-embedding-3-small`은 기존 인덱스 호환 목적으로만 허용 (2~3 릴리스 후 DROP).
```

- [ ] **Step 3: Update §2 "금지 모델"**

Adjust the forbidden list — only legacy versions remain forbidden:

```markdown
## 2. 금지 모델 (blocklist)

- OpenAI: `gpt-4*`, `gpt-3*`, `o1`·`o3`·`o4`, `text-embedding-ada-*`, `text-embedding-3-large`
- Anthropic: `claude-3*`, `claude-2*`, `claude-instant*` (구 버전)
- Google: `gemini-1*`, `gemini-pro` (무버전), PaLM 계열
- Other local: `nomic-embed`, `embeddinggemma`, llama.cpp 통한 생성 LLM (embedding 외 로컬 생성 금지)
```

- [ ] **Step 4: Add §7 변경 이력 entry**

```markdown
| 2026-04-21 | Multi-provider 확장. Claude/Gemini 생성 허용, Ollama embedding 도입, `text-embedding-3-small` sunset 선언 | PR #??: feat/llm-multi-provider |
```

- [ ] **Step 5: Commit**

```bash
git add docs/policies/llm-models.md
git commit -m "docs(policy): expand LLM allow-list — Claude 4.7, Gemini 2.5, Ollama embed"
```

---

### Task A6: Extend `scripts/check-llm-models.mjs` allow-list

**Files:**
- Modify: `scripts/check-llm-models.mjs`

- [ ] **Step 1: Remove Claude/Gemini from FORBIDDEN patterns**

Edit `FORBIDDEN` array. Remove/narrow these entries (keep only old versions forbidden):

```js
  // BEFORE:
  { pattern: /\bclaude-(?:3|2|instant)[\w.-]*/gi, reason: "Claude (Anthropic) — 서비스 런타임 금지" },
  // AFTER (narrower — only pre-4.x forbidden):
  { pattern: /\bclaude-(?:3|2|instant|1)[\w.-]*/gi, reason: "Claude legacy versions — use claude-4.7+" },
```

Add Gemini:

```js
  { pattern: /\bgemini-(?:1|pro(?![0-9]))[\w.-]*/gi, reason: "Gemini legacy — use gemini-2.5+" },
  { pattern: /\bpalm[\w.-]*/gi, reason: "PaLM (Google legacy)" },
```

Remove `ollama` / `bge-m3` from forbidden (now allowed for embedding):

```js
  // DELETE these lines:
  { pattern: /\bollama\b/gi, ... },
  { pattern: /\bbge-(?:m3|...)\b/gi, ... },
```

Keep `nomic-embed`, `embeddinggemma` forbidden.

- [ ] **Step 2: Run lint to verify nothing in repo trips new rules**

```bash
node scripts/check-llm-models.mjs
```

Expected: ✅ 0 violations (repo has no `claude-4.7`, `gemini-2.5` etc. yet).

- [ ] **Step 3: Commit**

```bash
git add scripts/check-llm-models.mjs
git commit -m "feat(lint): permit claude-4.7+ / gemini-2.5+ / ollama bge-m3 per new policy"
```

---

### Task A7: Migration 0039 — flexible embedding dim

**Problem:** `knowledge_page.embedding` is `vector(1536)` HNSW-indexed. bge-m3 is 1024d. Must migrate.

**Strategy:** Drop-and-recreate column. Data loss is acceptable — embeddings will be regenerated by ingest workers after Phase D.

**Files:**
- Create: `packages/db/drizzle/0039_embedding_dim_flex.sql` (manual, not via drizzle-kit — custom SQL)

- [ ] **Step 1: Write migration SQL**

```sql
-- packages/db/drizzle/0039_embedding_dim_flex.sql
-- Phase-W6: drop 1536d embedding, recreate as 1024d for Ollama bge-m3.
-- Existing vectors will be re-generated by ingest workers; data loss is intentional.

DROP INDEX IF EXISTS knowledge_page_embedding_hnsw_idx;
ALTER TABLE knowledge_page DROP COLUMN IF EXISTS embedding;
ALTER TABLE knowledge_page ADD COLUMN embedding vector(1024);

CREATE INDEX knowledge_page_embedding_hnsw_idx
  ON knowledge_page USING hnsw (embedding vector_cosine_ops);
```

- [ ] **Step 2: Update `_journal.json`**

Manually append entry for 0039 following the same format as 0037/0038.

- [ ] **Step 3: Update schema file**

Edit `packages/db/schema/knowledge.ts` — change `embedding: vector("embedding", { dimensions: 1536 })` → `1024`.

- [ ] **Step 4: Update search code**

Edit `packages/search/pg-search.ts` — any reference to "1536" or "text-embedding-3-small" in comments/constants should note "now 1024d bge-m3".

Search-replace:
```bash
grep -rn "1536\|text-embedding-3-small" packages/search packages/ai apps/web/lib/server/search-embedder.ts
```

Decide each match — if it's hardcoded dim, make it come from a constant `EMBEDDING_DIM = 1024` exported from `packages/ai/providers/ollama.ts`.

- [ ] **Step 5: Apply + verify**

```bash
pnpm db:migrate
docker exec jarvis-postgres psql -U jarvis -d jarvis -c "\d knowledge_page"
# Expect: embedding | vector(1024)
node scripts/check-schema-drift.mjs
```

- [ ] **Step 6: Commit**

```bash
git add packages/db/drizzle/0039_embedding_dim_flex.sql \
        packages/db/drizzle/meta/_journal.json \
        packages/db/schema/knowledge.ts \
        packages/search/pg-search.ts apps/web/lib/server/search-embedder.ts
git commit -m "feat(db): migration 0039 — embedding 1536d -> 1024d for Ollama bge-m3"
```

---

### Task A8: Env schema additions

**Files:**
- Modify: `apps/web/lib/env.ts`
- Modify: `.env.example`, `apps/web/.env.local.example`

- [ ] **Step 1: Extend Zod schema**

Add to `baseSchema` object:

```ts
    ANTHROPIC_API_KEY: z.string().min(1).optional(),
    GEMINI_API_KEY: z.string().min(1).optional(),
    OLLAMA_URL: z.string().url().default("http://localhost:11434"),
    SECRET_MASTER_KEY: z.string().regex(/^[0-9a-f]{64}$/i).optional(),
    CLAUDE_GATEWAY_URL: z.string().url().optional(),
    GEMINI_GATEWAY_URL: z.string().url().optional(),
```

- [ ] **Step 2: Update `.env.example`**

Append:
```env
# Anthropic (optional — used when provider_config mode='api_key')
ANTHROPIC_API_KEY=

# Google Gemini (optional)
GEMINI_API_KEY=

# Ollama (local embedding)
OLLAMA_URL=http://localhost:11434

# Secret encryption master key (32 bytes hex). Generate:
#   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
SECRET_MASTER_KEY=

# Claude/Gemini subscription gateways (Phase C)
CLAUDE_GATEWAY_URL=http://localhost:8318/v1
GEMINI_GATEWAY_URL=http://localhost:8319/v1
```

- [ ] **Step 3: Run env tests**

```bash
pnpm --filter @jarvis/web test lib/env
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/env.ts .env.example apps/web/.env.local.example
git commit -m "feat(env): add Anthropic/Gemini/Ollama/SecretMasterKey vars"
```

---

**Phase A gate:** `pnpm test` passes, `node scripts/check-schema-drift.mjs` passes, `node scripts/check-llm-models.mjs` passes. Tag: `git tag phase-a-complete`.

---

## Phase B: Provider Adapters (3 days)

**Pattern:** Each adapter follows the same TDD loop — detailed for B1 (OpenAI), abbreviated for B2/B3/B4 (same pattern, different SDK).

### Task B1: Unified provider types

**Files:**
- Create: `packages/ai/providers/types.ts`
- Test: `packages/ai/providers/__tests__/types.test.ts`

- [ ] **Step 1: Test — types compile**

```ts
// packages/ai/providers/__tests__/types.test.ts
import { describe, it, expectTypeOf } from "vitest";
import type {
  Provider, Operation, Mode, ChatRequest, ChatResponse,
  EmbedRequest, EmbedResponse, ProviderAdapter,
} from "../types";

describe("provider types", () => {
  it("Provider union", () => {
    expectTypeOf<Provider>().toEqualTypeOf<"openai" | "anthropic" | "gemini" | "ollama">();
  });
  it("ProviderAdapter has chat+embed", () => {
    type A = ProviderAdapter;
    expectTypeOf<A["chat"]>().toBeFunction();
    expectTypeOf<A["embed"]>().toBeFunction();
  });
});
```

- [ ] **Step 2: Implement types**

```ts
// packages/ai/providers/types.ts
export type Provider = "openai" | "anthropic" | "gemini" | "ollama";
export type Operation = "query" | "ingest" | "lint" | "embed";
export type Mode = "system_subscription" | "user_subscription" | "api_key" | "local";

export interface ChatRequest {
  model: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface ChatChunk {
  delta: string;
  finishReason?: "stop" | "length" | "error";
}

export interface ChatResponse {
  text: string;
  model: string;
  usage?: { promptTokens: number; completionTokens: number };
}

export interface EmbedRequest {
  model: string;
  inputs: string[];
}

export interface EmbedResponse {
  embeddings: number[][];
  model: string;
  dim: number;
}

export interface ResolvedCredential {
  provider: Provider;
  mode: Mode;
  apiKey?: string;       // decrypted at resolve time
  gatewayUrl?: string;
}

export interface ProviderAdapter {
  name: Provider;
  chat(req: ChatRequest, cred: ResolvedCredential): Promise<ChatResponse>;
  stream(req: ChatRequest, cred: ResolvedCredential): AsyncIterable<ChatChunk>;
  embed(req: EmbedRequest, cred: ResolvedCredential): Promise<EmbedResponse>;
}
```

- [ ] **Step 3: Verify + commit**

```bash
pnpm --filter @jarvis/ai test -t "provider types"
git add packages/ai/providers/types.ts packages/ai/providers/__tests__/types.test.ts
git commit -m "feat(ai): unified provider adapter types"
```

---

### Task B2: OpenAI adapter

**Files:**
- Create: `packages/ai/providers/openai.ts`
- Test: `packages/ai/providers/__tests__/openai.test.ts`

Follow TDD pattern identically to B1:

- [ ] **Step 1: Write test with mocked OpenAI SDK** — assert:
  - `chat()` calls `client.chat.completions.create` with correct baseURL (gateway if `mode=system_subscription`, default if `api_key`)
  - `embed()` throws `Error("OpenAI embed not supported in v1 — use Ollama")`
  - `stream()` yields `ChatChunk` objects

- [ ] **Step 2: Run test, expect fail**

- [ ] **Step 3: Implement:**

```ts
// packages/ai/providers/openai.ts
import OpenAI from "openai";
import type { ProviderAdapter, ChatRequest, ChatResponse, ChatChunk, EmbedRequest, EmbedResponse, ResolvedCredential } from "./types";

function client(cred: ResolvedCredential): OpenAI {
  if (cred.mode === "system_subscription" || cred.mode === "user_subscription") {
    return new OpenAI({
      baseURL: cred.gatewayUrl ?? "http://localhost:8317/v1",
      apiKey: cred.apiKey ?? "sk-jarvis-local-dev",
      maxRetries: 0,
      timeout: 120_000,
    });
  }
  // api_key
  return new OpenAI({ apiKey: cred.apiKey, maxRetries: 0, timeout: 120_000 });
}

export const openaiAdapter: ProviderAdapter = {
  name: "openai",
  async chat(req, cred) {
    const c = client(cred);
    const res = await c.chat.completions.create({
      model: req.model,
      messages: req.messages,
      temperature: req.temperature,
      max_completion_tokens: req.maxTokens,
    });
    return {
      text: res.choices[0]?.message?.content ?? "",
      model: req.model,
      usage: res.usage ? {
        promptTokens: res.usage.prompt_tokens,
        completionTokens: res.usage.completion_tokens,
      } : undefined,
    };
  },
  async *stream(req, cred) {
    const c = client(cred);
    const s = await c.chat.completions.create({
      model: req.model,
      messages: req.messages,
      stream: true,
    });
    for await (const chunk of s) {
      const delta = chunk.choices[0]?.delta?.content ?? "";
      if (delta) yield { delta };
    }
  },
  async embed() {
    throw new Error("OpenAI embed disabled in v1. Use Ollama bge-m3.");
  },
};
```

- [ ] **Step 4: Verify + commit**

```bash
pnpm --filter @jarvis/ai test providers/__tests__/openai
git add packages/ai/providers/openai.ts packages/ai/providers/__tests__/openai.test.ts
git commit -m "feat(ai): OpenAI provider adapter (subscription + api_key)"
```

---

### Task B3: Anthropic adapter

Same TDD pattern as B2. Implementation sketch:

```ts
// packages/ai/providers/anthropic.ts
import Anthropic from "@anthropic-ai/sdk";
// ... client(cred) branches on mode -> gateway or direct
// chat: c.messages.create({ model, max_tokens, messages })
// stream: iterate c.messages.stream
// embed: throw Error("use Ollama")
```

Install SDK (A8 env plus Anthropic SDK dep):

```bash
pnpm add @anthropic-ai/sdk --filter @jarvis/ai
```

Commit message: `feat(ai): Anthropic provider adapter`

---

### Task B4: Gemini adapter

Same pattern. SDK: `@google/genai`.

```bash
pnpm add @google/genai --filter @jarvis/ai
```

Commit: `feat(ai): Gemini provider adapter`

---

### Task B5: Ollama adapter (embed only)

**Files:**
- Create: `packages/ai/providers/ollama.ts`
- Test: `packages/ai/providers/__tests__/ollama.test.ts`

Ollama speaks a simple REST. No OpenAI SDK needed.

- [ ] **Step 1: Write failing test** — assert `embed()` POSTs to `${OLLAMA_URL}/api/embeddings` and returns `{embeddings, model, dim}`.

- [ ] **Step 2: Implementation**

```ts
// packages/ai/providers/ollama.ts
import type { ProviderAdapter, ResolvedCredential, EmbedRequest, EmbedResponse } from "./types";

export const OLLAMA_EMBED_DIM = 1024; // bge-m3

export const ollamaAdapter: ProviderAdapter = {
  name: "ollama",
  async chat() { throw new Error("Ollama chat disabled in v1 (subscription LLMs only)"); },
  async *stream() { throw new Error("Ollama stream disabled in v1"); },
  async embed(req, cred): Promise<EmbedResponse> {
    const baseUrl = cred.gatewayUrl ?? process.env["OLLAMA_URL"] ?? "http://localhost:11434";
    const vectors: number[][] = [];
    for (const input of req.inputs) {
      const res = await fetch(`${baseUrl}/api/embeddings`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: req.model, prompt: input }),
      });
      if (!res.ok) throw new Error(`Ollama embed ${res.status}: ${await res.text()}`);
      const json = (await res.json()) as { embedding: number[] };
      vectors.push(json.embedding);
    }
    return { embeddings: vectors, model: req.model, dim: vectors[0]?.length ?? 0 };
  },
};
```

- [ ] **Step 3: Verify + commit**

```bash
# Test: mock fetch to return {embedding: Array(1024).fill(0.1)}
pnpm --filter @jarvis/ai test providers/__tests__/ollama
git commit -m "feat(ai): Ollama provider adapter (embed only, bge-m3 1024d)"
```

---

**Phase B gate:** all 5 adapter test files green (types + 4 adapters). Tag: `git tag phase-b-complete`.

---

## Phase C: Subscription Gateway Wire-Up (2 days)

### Task C1: Research + pick Claude subscription proxy

- [ ] **Step 1: Survey options (30 min research)**

Candidates as of 2026-04:
- `claude-code-proxy` (OSS) — converts OpenAI-style requests to Anthropic
- `claude-to-chatgpt` — similar
- Custom: use Claude Code CLI session in a small proxy

Evaluate: OAuth support, upstream maintenance, Docker image availability.

- [ ] **Step 2: Document decision**

Create `infra/cliproxy-claude/README.md` explaining:
- Chosen proxy + version
- How it authenticates to Anthropic (OAuth vs. session cookie)
- Rate limits / quota

- [ ] **Step 3: Commit research doc**

```bash
git add infra/cliproxy-claude/README.md
git commit -m "docs(infra): pick Claude subscription proxy — <name>"
```

---

### Task C2: Wire Claude proxy into docker-compose

**Files:**
- Create: `infra/cliproxy-claude/docker-compose.yml`
- Create: `infra/cliproxy-claude/config.yaml` (proxy-specific)
- Modify: `docker/docker-compose.yml` (add service)

- [ ] **Step 1: Add service to main compose**

```yaml
  cli-proxy-claude:
    image: <chosen-image>:<tag>
    container_name: jarvis-cli-proxy-claude
    ports:
      - "127.0.0.1:8318:8318"
    volumes:
      - ./infra/cliproxy-claude/config.yaml:/app/config.yaml:ro
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8318/health"]
      interval: 30s
      timeout: 5s
      retries: 3
```

- [ ] **Step 2: Bring up + smoke test**

```bash
docker compose -f docker/docker-compose.yml up -d cli-proxy-claude
curl -s http://localhost:8318/v1/models | jq .
# Expect: claude-sonnet-4.7 in the list
```

- [ ] **Step 3: Commit**

```bash
git add docker/docker-compose.yml infra/cliproxy-claude/
git commit -m "infra(cliproxy): add Claude subscription proxy on :8318"
```

---

### Task C3: Gemini proxy (same pattern as C1+C2)

Research → Decision doc → docker-compose wire-up.
Service name `cli-proxy-gemini`, port `:8319`.

Commit: `infra(cliproxy): add Gemini subscription proxy on :8319`

---

**Phase C gate:** all three gateways (`:8317` OpenAI, `:8318` Claude, `:8319` Gemini) return `/v1/models` 200 with respective model IDs. Tag: `phase-c-complete`.

---

## Phase D: Resolver + Unified Client + Migrate call sites (2 days)

### Task D1: Resolver — DB lookup with scope precedence

**Files:**
- Create: `packages/ai/resolver.ts`
- Test: `packages/ai/__tests__/resolver.test.ts`

Behavior:
1. Given `{op, workspaceId, userId}`, query `llm_provider_config` rows ordered by scope (`user` > `workspace` > `global`) and `priority`
2. For the first `enabled=true` row, load `llm_credential` if `credentialId` set
3. Decrypt `secretRef` via `packages/secret/`
4. Return `ResolvedProvider = { adapter, credential, model }`

- [ ] **Step 1: Write failing integration test** — seed DB with (global, workspace-override, user-override) rows, assert user-override wins.

- [ ] **Step 2: Implement with Drizzle query**

```ts
// packages/ai/resolver.ts
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@jarvis/db/client";
import { llmProviderConfig, llmCredential } from "@jarvis/db/schema";
import { decrypt } from "@jarvis/secret/encrypt";
import { masterKey } from "@jarvis/secret/master-key";
import type { Operation, ProviderAdapter, ResolvedCredential } from "./providers/types";
import { openaiAdapter } from "./providers/openai";
import { anthropicAdapter } from "./providers/anthropic";
import { geminiAdapter } from "./providers/gemini";
import { ollamaAdapter } from "./providers/ollama";

const adapters: Record<string, ProviderAdapter> = {
  openai: openaiAdapter,
  anthropic: anthropicAdapter,
  gemini: geminiAdapter,
  ollama: ollamaAdapter,
};

export interface ResolveArgs {
  op: Operation;
  workspaceId: string;
  userId?: string;
}

export interface Resolved {
  adapter: ProviderAdapter;
  credential: ResolvedCredential;
  model: string;
}

export async function resolve({ op, workspaceId, userId }: ResolveArgs): Promise<Resolved> {
  const scopeConditions = [
    { scope: "user" as const, scopeId: userId ?? null },
    { scope: "workspace" as const, scopeId: workspaceId },
    { scope: "global" as const, scopeId: null },
  ];

  for (const { scope, scopeId } of scopeConditions) {
    if (scope === "user" && !scopeId) continue;
    const [row] = await db
      .select()
      .from(llmProviderConfig)
      .where(and(
        eq(llmProviderConfig.scope, scope),
        scopeId === null
          ? sql`${llmProviderConfig.scopeId} IS NULL`
          : eq(llmProviderConfig.scopeId, scopeId),
        eq(llmProviderConfig.operation, op),
        eq(llmProviderConfig.enabled, true),
      ))
      .orderBy(llmProviderConfig.priority)
      .limit(1);

    if (!row) continue;

    // Load credential if needed
    let apiKey: string | undefined;
    if (row.credentialId) {
      const [cred] = await db
        .select()
        .from(llmCredential)
        .where(eq(llmCredential.id, row.credentialId))
        .limit(1);
      if (cred?.secretRef) apiKey = decrypt(cred.secretRef, masterKey());
    }

    return {
      adapter: adapters[row.provider]!,
      credential: {
        provider: row.provider as any,
        mode: row.mode as any,
        apiKey,
        gatewayUrl: row.gatewayUrl ?? undefined,
      },
      model: row.model,
    };
  }

  throw new Error(`No enabled llm_provider_config for op=${op} (user/workspace/global)`);
}
```

- [ ] **Step 3: Verify + commit**

```bash
pnpm --filter @jarvis/ai test resolver
git commit -m "feat(ai): resolver with scope precedence (user > workspace > global)"
```

---

### Task D2: Unified client

**Files:**
- Create: `packages/ai/client.ts`
- Test: `packages/ai/__tests__/client.test.ts`

```ts
// packages/ai/client.ts
import { resolve, type ResolveArgs } from "./resolver";
import type { ChatRequest, ChatResponse, ChatChunk, EmbedRequest, EmbedResponse } from "./providers/types";

export async function chat(args: ResolveArgs, req: Omit<ChatRequest, "model">): Promise<ChatResponse> {
  const r = await resolve(args);
  return r.adapter.chat({ ...req, model: req as any /* caller may override */ ?? r.model } as any, r.credential);
}

export async function* stream(args: ResolveArgs, req: Omit<ChatRequest, "model">): AsyncGenerator<ChatChunk> {
  const r = await resolve(args);
  yield* r.adapter.stream({ ...req, model: r.model } as any, r.credential);
}

export async function embed(args: ResolveArgs, inputs: string[]): Promise<EmbedResponse> {
  const r = await resolve({ ...args, op: "embed" });
  return r.adapter.embed({ model: r.model, inputs }, r.credential);
}
```

TDD + commit: `feat(ai): unified chat/stream/embed client`

---

### Task D3: Migrate `packages/ai/ask.ts` → use `client.ts`

**Files:**
- Modify: `packages/ai/ask.ts`
- Modify tests

Replace `getProvider("query", ...)` + `.chat.completions.create` with `chat({op:"query", workspaceId, userId}, ...)`.

Commit: `refactor(ai): ask.ts uses unified client`

---

### Task D4: Migrate remaining call sites

Same pattern for:
- `packages/ai/tutor.ts`
- `packages/ai/page-first/index.ts`
- `packages/ai/page-first/synthesize.ts`
- `packages/ai/embed.ts` — now calls `embed()` (Ollama)
- `apps/worker/src/jobs/ingest/analyze.ts`, `ingest/generate.ts`
- `apps/worker/src/jobs/wiki-lint/contradictions.ts`
- `apps/worker/src/jobs/wiki-bootstrap.ts`

One commit per file, message format: `refactor(ai): <file> uses unified client`.

- [ ] **Step 5: Deprecate `provider.ts`**

Replace body with thin shim forwarding to resolver (for any external caller). Mark `@deprecated` in JSDoc. Commit: `refactor(ai): deprecate provider.ts in favor of resolver+client`.

---

### Task D5: Seed default `llm_provider_config` rows

**Files:**
- Create: `packages/db/seed/llm-provider-defaults.ts`
- Create/modify: `packages/db/seed/dev.ts`

Insert on first boot if no rows exist — one per `(global, operation)`:

```ts
// (global, query,  openai, system_subscription, gpt-5.4-mini, gateway=http://cli-proxy:8317/v1)
// (global, lint,   openai, system_subscription, gpt-5.4-mini, gateway=...)
// (global, ingest, openai, api_key,             gpt-5.4-mini, credential=env_openai_key)
// (global, embed,  ollama, local,               bge-m3,       gateway=http://localhost:11434)
```

Commit: `feat(db): seed default llm_provider_config rows`

---

**Phase D gate:** ASK + Ingest + Lint all pass E2E smoke test via new resolver. Remove `FEATURE_SUBSCRIPTION_QUERY` env references (now DB-driven). Tag: `phase-d-complete`.

---

## Phase E: Admin UI + API routes + RBAC (3 days)

### Task E1: Add `admin:llm_config` permission

**Files:**
- Modify: `packages/auth/rbac.ts`
- Modify: `packages/auth/__tests__/rbac.test.ts`

Add permission constant + include in `admin` role. Commit: `feat(auth): add admin:llm_config permission`

---

### Task E2: API route `/api/admin/llm-config`

**Files:**
- Create: `apps/web/app/api/admin/llm-config/route.ts`
- Test: `apps/web/__tests__/api/admin-llm-config.test.ts`

Methods:
- `GET ?scope=global|workspace:<id>|user:<id>` — return config rows
- `POST` — create/update row (upsert by unique index)
- `DELETE ?id=<uuid>` — disable (set `enabled=false`)

All require `admin:llm_config` permission. Commit: `feat(api): admin llm-config CRUD`

---

### Task E3: API route `/api/admin/llm-credential`

Similar to E2 but with encryption on POST.

- POST body: `{scope, scopeId, provider, mode, apiKey, label}` — encrypt `apiKey` → `secretRef`, mask for display
- GET returns `maskedKey` only — never decrypted
- DELETE removes row + also zeroes referenced `credentialId` in `llm_provider_config`

Commit: `feat(api): admin llm-credential CRUD with AES encryption`

---

### Task E4: Admin page `/admin/llm-providers`

**Files:**
- Create: `apps/web/app/(app)/admin/llm-providers/page.tsx`
- Create: `apps/web/app/(app)/admin/llm-providers/actions.ts`
- Create: `apps/web/app/(app)/admin/llm-providers/_components/ProviderMatrix.tsx`

Page layout:
- Header: "LLM 공급자 설정"
- Tab: Global / Workspaces
- Table: rows = operations (query/ingest/lint/embed), columns = providers. Each cell shows current config + edit button.
- Edit opens drawer with provider/mode/model/credential selectors

Follow existing admin page patterns (see `apps/web/app/(app)/admin/audit/page.tsx` for reference).

Commit: `feat(admin): LLM provider matrix UI`

---

### Task E5: Simple fallback in resolver

**Files:**
- Modify: `packages/ai/resolver.ts`

When first-choice provider fails (network/5xx), query next `priority` row and retry once.

Add test. Commit: `feat(ai): resolver retries next priority on provider error`

---

**Phase E gate:** admin can view+edit matrix, operations survive provider flip (query flipping openai→anthropic at runtime via DB update). Tag: `phase-e-complete`.

---

## Phase F: BYO User Subscription UI + OAuth (2 days)

### Task F1: User settings page `/settings/llm`

**Files:**
- Create: `apps/web/app/(app)/settings/llm/page.tsx`
- Create: `apps/web/app/(app)/settings/llm/actions.ts`
- Create: `apps/web/app/(app)/settings/llm/_components/UserSubscriptionCard.tsx`
- Create: `apps/web/app/(app)/settings/llm/_components/UserApiKeyCard.tsx`

Layout:
- "내 LLM 설정"
- Section: **내 구독 연결** — OpenAI / Claude / Gemini 3 cards. Each: "연결하기" button → OAuth flow, or "연결 해제".
- Section: **내 API Key** — 3 cards. Each: "키 등록" → encrypt → save; shows masked preview.

No admin permission required — any authenticated user.

Commit: `feat(settings): user LLM settings page`

---

### Task F2: OAuth flow for user subscription

**Files:**
- Create: `apps/web/app/api/byo/oauth-start/route.ts`
- Create: `apps/web/app/api/byo/oauth-callback/route.ts`

Strategy depends on each proxy's OAuth model (from Phase C research). Implementation sketch for OpenAI:

1. `/api/byo/oauth-start?provider=openai` — generate PKCE pair, redirect to OpenAI OAuth endpoint
2. Callback: exchange code → access/refresh token → encrypt → insert `llm_credential` with `scope=user, mode=user_subscription`
3. Also insert `llm_provider_config` row for this user with operation = all chat-capable ops

Commit per provider: `feat(byo): OpenAI OAuth flow` / `feat(byo): Claude OAuth flow` / `feat(byo): Gemini OAuth flow`

---

### Task F3: Docs

**Files:**
- Create: `docs/ops/byo-subscription-flow.md`

Describe for users: "How to connect your personal ChatGPT/Claude/Gemini subscription to Jarvis".

Commit: `docs(ops): BYO subscription flow guide`

---

**Phase F gate:** A test user can connect their own OpenAI subscription and ASK queries are routed through it (verify via `llm_call_log.via` field). Tag: `phase-f-complete`.

---

## Phase G: Integration tests + Release (2 days)

### Task G1: E2E Playwright tests

**Files:**
- Create: `apps/web/e2e/admin-llm-providers.spec.ts`
- Create: `apps/web/e2e/user-llm-settings.spec.ts`

Scenarios:
- Admin: flip `query` provider from openai→anthropic, run ASK, verify answer+lane metadata
- User: connect own subscription, run ASK, verify routed via user creds
- Fallback: disable primary provider, verify resolver uses next priority

Commit: `test(e2e): admin + user + fallback scenarios`

---

### Task G2: Ollama setup guide

**Files:**
- Create: `docs/ops/ollama-setup.md`

Content:
- Install Ollama (macOS/Windows/Linux links)
- `ollama pull bge-m3`
- Verify `curl http://localhost:11434/api/tags`
- Configure `OLLAMA_URL` in `.env`
- How to run embedding backfill job

Commit: `docs(ops): Ollama setup guide`

---

### Task G3: README refresh

**Files:**
- Modify: `README.md` — §6 (tech stack) add Anthropic/Gemini/Ollama; §6.5 (policy) refresh allow-list table
- Modify: `CHANGELOG.md` (if exists) — add multi-provider entry

Commit: `docs(readme): reflect multi-provider + Ollama embeddings`

---

### Task G4: Final lint + build sweep

- [ ] `node scripts/check-llm-models.mjs` → ✅
- [ ] `node scripts/check-schema-drift.mjs` → ✅
- [ ] `pnpm type-check` → ✅
- [ ] `pnpm test` → ✅
- [ ] `pnpm build` → ✅ (pre-push hook target)

Fix any issues. Commit: `chore: final sweep before PR`

---

### Task G5: Open PR

```bash
git push -u origin feat/llm-multi-provider
gh pr create --base main \
  --title "feat: multi-provider LLM (OpenAI+Claude+Gemini+Ollama) with BYO subscription" \
  --body "$(cat <<'EOF'
## Summary
- 4 providers, 4 modes, 4 operations in a DB-driven resolver
- BYO user subscription via OAuth proxies
- Ollama embeddings (bge-m3, 1024d) replace OpenAI embeddings
- Admin UI at /admin/llm-providers, user UI at /settings/llm
- Policy + lint updated to allow Claude-4.7 / Gemini-2.5 / Ollama

## Breaking changes
- `knowledge_page.embedding` dimension: 1536d → 1024d (full re-embed required)
- `FEATURE_SUBSCRIPTION_*` env flags deprecated (DB-driven now)
- Ingest/Query/Lint call sites refactored

## Test plan
- [x] Unit tests for 5 adapters + resolver
- [x] E2E: admin flip, user BYO, fallback
- [ ] Manual QA in staging

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review Checklist

Before executing, verify this plan against the spec:

- [x] **OpenAI + Claude + Gemini** — B2/B3/B4 adapters, A5 policy, A6 lint
- [x] **Ollama embedding only** — B5 adapter, A7 dim migration, policy §1.4
- [x] **Subscription + API key + BYO modes** — Mode union in B1, resolver D1, BYO in F1-F2
- [x] **DB-backed config** — A1 + A2 schemas, D1 resolver, D5 seed, E2/E3 API
- [x] **Admin UI** — E4 matrix page
- [x] **User settings UI** — F1 BYO page
- [x] **Encryption** — A4 AES-GCM, E3 encrypt on POST
- [x] **Claude/Gemini subscription proxies** — Phase C full research+wire
- [x] **Policy updated first** (A5) before code uses new models (B3/B4)
- [x] **Lint updated** (A6) before Claude/Gemini literals appear
- [x] **RBAC gate** (E1) before admin UI (E4)
- [x] **Single branch** `feat/llm-multi-provider` throughout

---

## Execution Handoff

**When you open a new session:**

1. Read "Context for New Session" section top of this file
2. Run the `git switch -c feat/llm-multi-provider` commands
3. Start with **Phase A, Task A1** — TDD loop: test → fail → implement → pass → commit
4. Gate check between phases — do not start Phase B until Phase A gate passes
5. For execution automation, invoke **`superpowers:subagent-driven-development`** skill — it will dispatch a fresh subagent per Task with two-stage review between

**Questions to consider at Phase C1:**
- If no viable Claude OAuth proxy exists, **fall back to api_key mode only for Claude** and document the limitation. Same for Gemini at C3.
- Phase F OAuth flow depends on C outcome — may become "user enters their API key" instead of true OAuth if no proxy supports user-specific OAuth.
