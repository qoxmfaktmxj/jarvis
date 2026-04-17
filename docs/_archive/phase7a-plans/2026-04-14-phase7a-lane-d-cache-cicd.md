# Phase-7A Lane D — Cache Key + CI/CD + Leakage Test Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `ask()` 캐시 키에 `promptVersion + workspaceId + sensitivityScope`를 추가하여 워크스페이스 간 캐시 오염을 제거하고, pgvector 기반 cross-workspace leakage 통합 테스트 + GitHub Actions CI 파이프라인을 구축해 G4(누수 0) 게이트를 자동화한다.

**Architecture:** `packages/ai/cache.ts`는 순수 함수 `makeCacheKey` + 인메모리 LRU(`getCached`/`setCached`)로 구성된 Phase-7A 최소 구현(Redis 없음). `ask.ts`는 호출 전후 cache-through 패턴으로 래핑하고, `sensitivityScope`는 호출자(요청 핸들러)가 RBAC 레벨로 계산해 넘긴다. 통합 테스트는 실제 Postgres + pgvector를 띄워 워크스페이스 A/B 각각 10행씩 시드하고, 3가지 쿼리 벡터로 검색 결과의 `workspaceId` 단일성을 단언한다. CI는 Postgres 16 + pgvector 서비스 컨테이너에서 마이그레이션 → 유닛 → 통합 순으로 실행한다.

**Tech Stack:** vitest 3.1.1, pgvector, GitHub Actions, Drizzle 0.45.2, pg 8, Node 22, pnpm 10.

**Spec reference:** `docs/superpowers/specs/2026-04-14-phase7-v3-design.md` §3 PR#5, §3 PR#9, §4 G4.

**Dependency order:** Run AFTER Lane A (선택적 `llm_call_log` 상호 참조) and AFTER Lane C (`document_chunks` 테이블이 G4 테스트 시드 대상). Lane A/C가 머지되기 전에도 Lane D 착수는 가능하지만, G4 통합 테스트는 Lane C가 안정화되기 전까지는 red로 남는다. `cache.ts`는 의도적으로 `llm_call_log`에 의존하지 않도록 순수 인메모리로 설계한다.

> **Merge 전략 — `packages/ai/ask.ts`**: Lane A도 이 파일을 수정(logger + assertBudget 삽입), Lane D도 수정(cache-through). **순서: Lane A를 먼저 머지 → Lane D에서 rebase → ask.ts의 최종 diff를 `assertBudget → makeCacheKey → getCached → openai call → setCached → logLlmCall` 순으로 통합**. Lane D PR 생성 전 로컬에서 rebase하여 단일 diff로 관찰.

> **Root `package.json` scripts 병합**: Lane A(eval:budget-test), Lane B(eval:run), Lane D(test:integration) 모두 scripts 추가. 3 lane 각각 머지 후 `package.json` scripts 키를 최종적으로 정렬 + 중복 제거하는 짧은 정리 커밋 필요. PR#G가 이 정리 커밋도 포함할 수 있다.

**Branch:** `claude/phase7a-lane-d-cache-cicd`
**Today:** 2026-04-14

---

## 0. 배경과 결정 사항

### 0.1 왜 캐시 키를 확장하는가
현재 `ask()`는 OpenAI 호출 전후에 명시적 캐시 레이어가 없거나, 있더라도 `(input, model)` 수준에서만 동작한다. 이 상태에서는:

1. **워크스페이스 간 응답 오염**: 워크스페이스 A의 민감 답변이 동일 질문을 던진 워크스페이스 B에 재사용될 위험.
2. **민감도 스코프 무시**: 같은 워크스페이스 내에서도 "internal-only" 답변이 "public" 접근 레벨 사용자에게 누출 가능.
3. **프롬프트 버전 롤포워드 문제**: 프롬프트를 개선해도 과거 응답이 그대로 리턴되어 품질 개선이 체감되지 않음.

§3 PR#5는 이를 해결하기 위해 캐시 키를 `(promptVersion, workspaceId, sensitivityScope, input, model)` 5-튜플의 결정적 해시로 확장한다.

### 0.2 왜 Phase-7A는 인메모리 LRU인가
Redis/Valkey 도입은 운영 오버헤드(HA, TLS, key eviction policy 튜닝, 관측)가 크다. Phase-7A는:

- 요청 단위 중복 제거(같은 요청이 수 초 내 재시도되는 경우) 효과만 노리고,
- 단일 프로세스 인스턴스 기준 cap 500짜리 `Map` + 삽입 순서 eviction으로 충분하며,
- Phase-7B에서 Redis로 교체될 때 `getCached`/`setCached` 서명만 유지하면 무중단 교체가 가능하다.

### 0.3 왜 G4 통합 테스트는 실제 DB를 써야 하는가
pgvector의 `<=>` 연산자 + IVFFlat 인덱스 동작은 목(mock)으로는 재현 불가능하다. 누수(leakage)는 WHERE 절 누락, SQL injection 회피 실수, 인덱스 파라미터 오류 같은 **실제 DB에 붙었을 때만 드러나는** 종류의 버그이므로 반드시 실제 Postgres에 대해 돌려야 한다.

### 0.4 `sensitivityScope` 포맷 결정
캐시 키 일부로 들어가므로 결정적(deterministic) 문자열이어야 한다.

```
sensitivityScope = "workspace:<workspaceId>|level:<accessLevel>"
```

- `workspaceId`는 UUID 소문자.
- `accessLevel`은 `public | internal | confidential | restricted` 중 하나.
- 두 필드를 `|`로 연결하되, 순서를 고정해 해시 안정성을 보장한다.
- `workspaceId`가 키에 이미 포함되므로 중복으로 보이지만, 동일 워크스페이스 내 레벨 차등을 드러내기 위해 명시적으로 재노출한다.

### 0.5 의존성 정리표

| 항목 | 선행 Lane | 없을 때 영향 |
|------|-----------|-------------|
| `cache.ts` 구현·단위 테스트 | 없음 | 독립 실행 가능 |
| `ask.ts` 캐시 배선 | 없음 | 독립 실행 가능 |
| `cross-workspace-leakage.test.ts` | Lane C (`document_chunks`) | 통합 테스트 red, PR#9 완료 지연 |
| CI `pnpm db:migrate` | Lane A (`llm_call_log`), Lane C | 마이그레이션 실패 시 파이프라인 red |
| 선택적 야간 `eval:run` | Lane B | 주석 처리로 비활성화 후 Lane B 머지 시 해제 |

---

## 1. 태스크 시퀀스 (TDD)

### 1.1 환경 준비
- [ ] 1.1.1 현재 워크트리에서 브랜치 확인: `git status`, `git branch --show-current` → `claude/phase7a-lane-d-cache-cicd`가 아니면 생성 후 스위치.
- [ ] 1.1.2 선행 테이블 존재 확인 (Lane A/C 머지 여부 검증). 없다면 cache.ts 작업만 선행하고 통합 테스트는 테스트 파일을 `describe.skip`으로 두고 PR#5만 먼저 낸다.
  ```bash
  pnpm --filter=@jarvis/db exec tsx -e "
    import { db } from './src/client.ts';
    import { sql } from 'drizzle-orm';
    const r = await db.execute(sql\`SELECT to_regclass('llm_call_log') a, to_regclass('document_chunks') b\`);
    console.log(r.rows);
  "
  ```
- [ ] 1.1.3 `packages/ai/cache.ts`, `packages/ai/__tests__/cache.test.ts` 부재 확인.
- [ ] 1.1.4 `apps/worker/vitest.integration.config.ts`, `apps/worker/src/__tests__/integration/` 부재 확인.
- [ ] 1.1.5 `.github/workflows/` 부재 확인 (신규 생성 예정).

### 1.2 PR#5 — cache.ts 결정론 테스트 (red → green)
- [ ] 1.2.1 `packages/ai/__tests__/cache.test.ts` 작성: `makeCacheKey(sameParams)` 두 번 호출 시 동일 해시임을 단언.
- [ ] 1.2.2 `pnpm --filter=@jarvis/ai exec vitest run __tests__/cache.test.ts` 실행 → 모듈 없음으로 실패 확인.
- [ ] 1.2.3 `packages/ai/cache.ts` 최소 구현으로 테스트 통과.
- [ ] 1.2.4 커밋: `feat(ai): add makeCacheKey — deterministic key composition (promptVersion+workspaceId+sensitivityScope+input+model)`.

### 1.3 PR#5 — workspaceId 분리 테스트
- [ ] 1.3.1 테스트 추가: 동일 input/model, 다른 workspaceId → 다른 키.
- [ ] 1.3.2 구현상 이미 통과해야 하므로 바로 green. 커밋.

### 1.4 PR#5 — promptVersion, sensitivityScope 분리 테스트
- [ ] 1.4.1 테스트 추가: promptVersion만 변경, sensitivityScope만 변경 → 각각 다른 키.
- [ ] 1.4.2 green 확인, 커밋.

### 1.5 PR#5 — LRU cap + eviction
- [ ] 1.5.1 테스트: 501번째 `setCached` 후 첫 번째 키가 만료되었음을 `getCached(first) === null`로 단언.
- [ ] 1.5.2 `cache.ts`에서 `Map` 삽입 순서를 이용한 FIFO eviction 구현.
- [ ] 1.5.3 커밋.

### 1.6 PR#5 — ask.ts cache-through 실패 테스트 (TDD red)
- [ ] 1.6.0a `packages/ai/__tests__/ask-cache.test.ts` 작성 — 2차 동일 호출이 OpenAI 재호출 없이 캐시에서 응답되는지 단언.

```ts
// packages/ai/__tests__/ask-cache.test.ts (new)
import { describe, it, expect, vi } from 'vitest';
import { ask } from '../ask.ts';

describe('ask() cache-through', () => {
  it('second identical call returns cached result without OpenAI invocation', async () => {
    const openaiSpy = vi.fn();
    // Inject spy via test harness or mock
    const r1 = await ask({
      workspaceId: 'ws-test',
      prompt: '동일한 질문',
      sensitivityScope: 'workspace:ws-test|level:INTERNAL',
      // ... other required params
    });
    const r2 = await ask({
      workspaceId: 'ws-test',
      prompt: '동일한 질문',
      sensitivityScope: 'workspace:ws-test|level:INTERNAL',
    });
    expect(r1).toEqual(r2);
    expect(openaiSpy).toHaveBeenCalledTimes(1); // cache hit on 2nd
  });

  it('different workspaceId → different cache slot → 2 OpenAI calls', async () => {
    // similar but with ws-A and ws-B → asserts spy called twice
  });
});
```

- [ ] 1.6.0b 실행 (FAIL 예상):

```bash
pnpm --filter @jarvis/ai test ask-cache
```
Expected: FAIL (cache logic not yet in ask.ts)

### 1.6 PR#5 — ask.ts 배선 (TDD green)
- [ ] 1.6.1 `packages/ai/ask.ts` 상단에 `export const PROMPT_VERSION = '2026-04-v1';` 추가.
- [ ] 1.6.2 `ask()` 시그니처에 `sensitivityScope: string` 파라미터 추가 (호출자에서 계산해 주입).
- [ ] 1.6.3 OpenAI 호출 지점 직전에 `makeCacheKey` → `getCached` → 히트 시 즉시 return.
- [ ] 1.6.4 생성 완료 직후 `setCached(key, result)`.
- [ ] 1.6.5 기존 `ask.test.ts`가 깨지면 시그니처 업데이트에 맞춰 테스트의 호출부만 수정 (스펙 변경 없음).
- [ ] 1.6.6 `pnpm --filter=@jarvis/ai test` 전체 green 확인.
- [ ] 1.6.7 커밋: `feat(ai): wire cache-through into ask() with promptVersion+workspace+scope key`.

### 1.7 PR#5 푸시·PR 생성
- [ ] 1.7.1 `git push -u origin claude/phase7a-lane-d-cache-cicd`.
- [ ] 1.7.2 `gh pr create` — 제목 `feat(ai): scope LLM response cache by workspace + prompt version (Phase-7A PR#5)`.

### 1.8 PR#9 — 통합 테스트 설정 파일
- [ ] 1.8.1 `apps/worker/vitest.integration.config.ts` 작성 (아래 §3.3 코드).
- [ ] 1.8.2 root `package.json`에 `"test:integration"` 스크립트 추가.
- [ ] 1.8.3 `apps/worker/package.json`에 `"test:integration": "vitest run --config vitest.integration.config.ts"` 추가.

### 1.9 PR#9 — 누수 테스트 작성 (red 우선)
- [ ] 1.9.1 `apps/worker/src/__tests__/integration/cross-workspace-leakage.test.ts` 작성 (아래 §3.2 코드).
- [ ] 1.9.2 `TEST_DATABASE_URL` 미설정 시 `describe.skipIf`로 skip.
- [ ] 1.9.3 로컬에서 `TEST_DATABASE_URL=postgres://... pnpm test:integration` 실행 → 시드·검색 통과 확인.
- [ ] 1.9.4 커밋: `test(worker): add cross-workspace leakage integration test for G4`.

### 1.10 PR#9 — GitHub Actions 워크플로
- [ ] 1.10.1 `.github/workflows/test.yml` 작성 (아래 §3.4).
- [ ] 1.10.2 YAML 린트: `npx yaml-lint .github/workflows/test.yml` 또는 `act -l`로 파싱만 확인.
- [ ] 1.10.3 커밋: `ci: add test workflow with postgres+pgvector service (Phase-7A PR#9)`.

### 1.11 PR#9 — 선택적 야간 eval 잡
- [ ] 1.11.1 `test.yml`에 `eval-nightly` job을 주석으로 추가 (Lane B 머지 전까지 비활성).
- [ ] 1.11.2 Lane B 머지 후 주석 해제 예정임을 PR 설명에 명시.

### 1.12 PR#9 푸시·PR 생성
- [ ] 1.12.1 `git push`.
- [ ] 1.12.2 `gh pr create` — 제목 `ci: cross-workspace leakage test + GH Actions pipeline (Phase-7A PR#9, G4)`.
- [ ] 1.12.3 첫 CI 실행 결과 확인, red 시 postgres 서비스 헬스체크/pgvector extension CREATE 순서 점검.

---

## 2. 파일 변경 목록

| 경로 | 상태 | 설명 |
|------|------|------|
| `packages/ai/cache.ts` | 신규 | `makeCacheKey` + in-memory LRU |
| `packages/ai/__tests__/cache.test.ts` | 신규 | 6개 단위 테스트 |
| `packages/ai/ask.ts` | 수정 | `PROMPT_VERSION` 상수 + cache-through 배선 + `sensitivityScope` 파라미터 |
| `apps/worker/vitest.integration.config.ts` | 신규 | integration 전용 vitest 설정 |
| `apps/worker/src/__tests__/integration/cross-workspace-leakage.test.ts` | 신규 | G4 pgvector 누수 테스트 |
| `apps/worker/package.json` | 수정 | `test:integration` 스크립트 |
| `package.json` (root) | 수정 | `test:integration` 스크립트 |
| `.github/workflows/test.yml` | 신규 | CI 파이프라인 (postgres + pgvector) |

---

## 3. 전체 코드 (플레이스홀더 없음)

### 3.1 `packages/ai/cache.ts`

> **스펙 범위**: PR#5의 핵심 산출물은 `makeCacheKey()` 키 조합. `getCached`/`setCached`는 **in-memory helper**로 7A 동안만 유효 — 7B에서 Redis/pg로 교체될 수 있다. 키 계산 로직(promptVersion + workspaceId + sensitivityScope)이 테스트의 1차 대상이며, LRU 스토어는 부가 helper이다 (스펙 §3 PR#5 자체는 LRU를 요구하지 않음).

```ts
// packages/ai/cache.ts
// Phase-7A PR#5: workspace/prompt/scope-aware LLM response cache.
// Intentionally minimal: in-memory LRU, no Redis. The public API
// (makeCacheKey/getCached/setCached) is stable so Phase-7B can swap
// the storage backend without touching ask.ts.

import { createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// Key derivation
// ---------------------------------------------------------------------------

export interface CacheKeyParams {
  /** Bumped manually by prompt authors when a prompt template changes. */
  promptVersion: string;
  /** UUID (lower-case) of the workspace that owns the request. */
  workspaceId: string;
  /**
   * Derived by the caller from the user's access level.
   * Format: "workspace:<uuid>|level:<public|internal|confidential|restricted>"
   * The workspaceId is duplicated here on purpose so level-only changes
   * still alter the key within the same workspace.
   */
  sensitivityScope: string;
  /** The full user-visible input string passed to the LLM. */
  input: string;
  /** Concrete model identifier, e.g. "gpt-5.4-mini". */
  model: string;
}

/**
 * Deterministic SHA-256 hex digest of the canonical JSON representation
 * of the given params. Key order is fixed at serialization time so the
 * hash is stable across runs and Node versions.
 */
export function makeCacheKey(params: CacheKeyParams): string {
  const canonical = JSON.stringify({
    promptVersion: params.promptVersion,
    workspaceId: params.workspaceId,
    sensitivityScope: params.sensitivityScope,
    input: params.input,
    model: params.model,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

// ---------------------------------------------------------------------------
// In-memory LRU
// ---------------------------------------------------------------------------

const CACHE_CAP = 500;
const store = new Map<string, string>();

export async function getCached(key: string): Promise<string | null> {
  if (!store.has(key)) return null;
  // Touch: move to newest slot so LRU ordering stays correct.
  const value = store.get(key) as string;
  store.delete(key);
  store.set(key, value);
  return value;
}

export async function setCached(key: string, value: string): Promise<void> {
  if (store.has(key)) store.delete(key);
  store.set(key, value);
  while (store.size > CACHE_CAP) {
    // Map preserves insertion order; the first key is the oldest.
    const oldest = store.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
}

/** Test-only: reset the cache between runs. Not exported from package index. */
export function __resetCacheForTests(): void {
  store.clear();
}
```

### 3.2 `apps/worker/src/__tests__/integration/cross-workspace-leakage.test.ts`

```ts
// apps/worker/src/__tests__/integration/cross-workspace-leakage.test.ts
// Phase-7A PR#9 / G4: pgvector 유사도 검색이 요청된 workspace 밖 행을
// 단 하나도 반환하지 않음을 보장.
// TEST_DATABASE_URL 환경변수가 없으면 전체 describe 블록을 skip.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';

const TEST_DB_URL = process.env['TEST_DATABASE_URL'];
const runIfDb = TEST_DB_URL ? describe : describe.skip;

const WORKSPACE_A = '00000000-0000-0000-0000-00000000000a';
const WORKSPACE_B = '00000000-0000-0000-0000-00000000000b';
const EMBED_DIM = 1536;

function seededVector(seed: number, offset = 0): number[] {
  // Simple LCG so seeds are reproducible across runs/hosts.
  let s = (seed * 9301 + 49297 + offset) % 233280;
  const v: number[] = [];
  for (let i = 0; i < EMBED_DIM; i++) {
    s = (s * 9301 + 49297) % 233280;
    v.push(s / 233280);
  }
  return v;
}

function toVectorLiteral(v: number[]): string {
  return `[${v.join(',')}]`;
}

async function searchChunks(
  client: Client,
  workspaceId: string,
  queryVec: number[],
  limit = 50,
): Promise<Array<{ id: string; workspace_id: string }>> {
  const lit = toVectorLiteral(queryVec);
  const res = await client.query<{ id: string; workspace_id: string }>(
    `SELECT id, workspace_id
       FROM document_chunks
      WHERE workspace_id = $1::uuid
      ORDER BY embedding <=> $2::vector
      LIMIT $3`,
    [workspaceId, lit, limit],
  );
  return res.rows;
}

runIfDb('cross-workspace leakage (G4)', () => {
  const client = new Client({ connectionString: TEST_DB_URL });

  beforeAll(async () => {
    await client.connect();
    await client.query('TRUNCATE document_chunks');
    const insert = `
      INSERT INTO document_chunks
        (id, workspace_id, document_id, chunk_index, content, embedding)
      VALUES
        (gen_random_uuid(), $1::uuid, gen_random_uuid(), $2, $3, $4::vector)
    `;
    for (let i = 0; i < 10; i++) {
      await client.query(insert, [
        WORKSPACE_A,
        i,
        `A-chunk-${i}`,
        toVectorLiteral(seededVector(1000 + i)),
      ]);
    }
    for (let i = 0; i < 10; i++) {
      await client.query(insert, [
        WORKSPACE_B,
        i,
        `B-chunk-${i}`,
        toVectorLiteral(seededVector(2000 + i)),
      ]);
    }
  });

  afterAll(async () => {
    await client.query('TRUNCATE document_chunks');
    await client.end();
  });

  it('query close to workspace A returns only workspace A rows', async () => {
    const q = seededVector(1000, 1); // near A-chunk-0
    const rows = await searchChunks(client, WORKSPACE_A, q);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.workspace_id === WORKSPACE_A)).toBe(true);
  });

  it('query close to workspace B returns only workspace B rows', async () => {
    const q = seededVector(2000, 1); // near B-chunk-0
    const rows = await searchChunks(client, WORKSPACE_B, q);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.workspace_id === WORKSPACE_B)).toBe(true);
  });

  it('generic vector is filtered to requested workspace only', async () => {
    const q = seededVector(9999);
    const rowsA = await searchChunks(client, WORKSPACE_A, q);
    const rowsB = await searchChunks(client, WORKSPACE_B, q);
    expect(rowsA.every((r) => r.workspace_id === WORKSPACE_A)).toBe(true);
    expect(rowsB.every((r) => r.workspace_id === WORKSPACE_B)).toBe(true);
    // And cross-check: no id appears in both result sets.
    const idsA = new Set(rowsA.map((r) => r.id));
    expect(rowsB.some((r) => idsA.has(r.id))).toBe(false);
  });
});
```

### 3.3 `apps/worker/vitest.integration.config.ts`

```ts
// apps/worker/vitest.integration.config.ts
// Runs only the integration suite; excluded from the default `pnpm test`.

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/__tests__/integration/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    pool: 'forks',
    // Integration tests hit a real DB; run serially to avoid TRUNCATE races.
    poolOptions: { forks: { singleFork: true } },
  },
});
```

### 3.4 `.github/workflows/test.yml`

```yaml
name: test

on:
  push:
    branches: [main, 'claude/**']
  pull_request:
    branches: [main]

jobs:
  unit-and-integration:
    runs-on: ubuntu-latest
    timeout-minutes: 20

    services:
      postgres:
        image: pgvector/pgvector:pg16
        env:
          POSTGRES_USER: jarvis
          POSTGRES_PASSWORD: jarvis
          POSTGRES_DB: jarvis_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U jarvis -d jarvis_test"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10

    env:
      TEST_DATABASE_URL: postgres://jarvis:jarvis@localhost:5432/jarvis_test
      DATABASE_URL: postgres://jarvis:jarvis@localhost:5432/jarvis_test
      NODE_ENV: test

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 10.33.0
          run_install: false

      - name: Get pnpm store dir
        id: pnpm-cache
        shell: bash
        run: echo "store=$(pnpm store path --silent)" >> "$GITHUB_OUTPUT"

      - name: Cache pnpm store
        uses: actions/cache@v4
        with:
          path: ${{ steps.pnpm-cache.outputs.store }}
          key: ${{ runner.os }}-pnpm-${{ hashFiles('**/pnpm-lock.yaml') }}
          restore-keys: ${{ runner.os }}-pnpm-

      - name: Install deps
        run: pnpm install --frozen-lockfile

      - name: Ensure pgvector extension
        run: |
          PGPASSWORD=jarvis psql -h localhost -U jarvis -d jarvis_test \
            -c "CREATE EXTENSION IF NOT EXISTS vector;"

      - name: Run DB migrations
        run: pnpm db:migrate

      - name: Unit tests
        run: pnpm test

      - name: Integration tests
        run: pnpm test:integration

      - name: Schema drift check
        run: node scripts/check-schema-drift.mjs --ci

      - name: Upload test artifacts
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: test-logs
          path: |
            **/vitest.log
            **/junit*.xml
          if-no-files-found: ignore

  # -------------------------------------------------------------------------
  # Nightly eval job — disabled until Phase-7A Lane B (eval harness) lands.
  # Unblock by removing the `if: false` gate after `pnpm eval:run` exists.
  # -------------------------------------------------------------------------
  eval-nightly:
    if: false
    runs-on: ubuntu-latest
    needs: unit-and-integration
    # schedule trigger is defined at workflow root once Lane B lands:
    #   schedule:
    #     - cron: '0 3 * * *'
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10.33.0
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: pnpm install --frozen-lockfile
      - run: pnpm eval:run
```

### 3.5 `packages/ai/__tests__/cache.test.ts` (테스트 케이스 본문)

```ts
import { afterEach, describe, expect, it } from 'vitest';
import {
  __resetCacheForTests,
  getCached,
  makeCacheKey,
  setCached,
} from '../cache.js';

const base = {
  promptVersion: '2026-04-v1',
  workspaceId: '00000000-0000-0000-0000-00000000000a',
  sensitivityScope:
    'workspace:00000000-0000-0000-0000-00000000000a|level:internal',
  input: 'hello world',
  model: 'gpt-5.4-mini',
};

afterEach(() => __resetCacheForTests());

describe('makeCacheKey', () => {
  it('is deterministic for identical params', () => {
    expect(makeCacheKey(base)).toBe(makeCacheKey({ ...base }));
  });

  it('differs by workspaceId (isolation invariant)', () => {
    const other = {
      ...base,
      workspaceId: '00000000-0000-0000-0000-00000000000b',
    };
    expect(makeCacheKey(base)).not.toBe(makeCacheKey(other));
  });

  it('differs by promptVersion', () => {
    expect(makeCacheKey(base)).not.toBe(
      makeCacheKey({ ...base, promptVersion: '2026-05-v2' }),
    );
  });

  it('differs by sensitivityScope even with same workspaceId', () => {
    expect(makeCacheKey(base)).not.toBe(
      makeCacheKey({
        ...base,
        sensitivityScope:
          'workspace:00000000-0000-0000-0000-00000000000a|level:confidential',
      }),
    );
  });

  it('is stable across serialization orderings', () => {
    const reordered = {
      model: base.model,
      input: base.input,
      sensitivityScope: base.sensitivityScope,
      workspaceId: base.workspaceId,
      promptVersion: base.promptVersion,
    } as typeof base;
    expect(makeCacheKey(base)).toBe(makeCacheKey(reordered));
  });
});

describe('LRU cache', () => {
  it('returns previously stored values', async () => {
    const k = makeCacheKey(base);
    await setCached(k, 'answer');
    expect(await getCached(k)).toBe('answer');
  });

  it('evicts the oldest entry after exceeding cap 500', async () => {
    const firstKey = makeCacheKey({ ...base, input: 'q-0' });
    await setCached(firstKey, 'v-0');
    for (let i = 1; i <= 500; i++) {
      const k = makeCacheKey({ ...base, input: `q-${i}` });
      await setCached(k, `v-${i}`);
    }
    expect(await getCached(firstKey)).toBeNull();
    const lastKey = makeCacheKey({ ...base, input: 'q-500' });
    expect(await getCached(lastKey)).toBe('v-500');
  });
});
```

### 3.6 root `package.json` 추가 스크립트

```jsonc
// package.json scripts 섹션에 다음 추가
"test:integration": "pnpm --filter=@jarvis/worker test:integration"
```

> **G4 타겟 실행 명령 (PR#G에서 사용)**:
> ```bash
> pnpm test:integration -- src/__tests__/integration/cross-workspace-leakage.test.ts
> ```
> vitest는 positional arg로 filter를 받는다. PR#G의 G4 판정 시 이 정확한 명령을 복사해 사용.

### 3.7 `apps/worker/package.json` 추가 스크립트

```jsonc
"test:integration": "vitest run --config vitest.integration.config.ts"
```

### 3.8 `packages/ai/ask.ts` 수정 요지

```ts
// 파일 상단
export const PROMPT_VERSION = '2026-04-v1';
import { getCached, makeCacheKey, setCached } from './cache.js';

// ask() 시그니처에 sensitivityScope 추가
export async function ask(
  question: string,
  workspaceId: string,
  userPermissions: string[],
  sensitivityScope: string,
): Promise<{ answer: string; sources: SourceRef[] }> {
  // ... 기존 retrieval ...

  const cacheKey = makeCacheKey({
    promptVersion: PROMPT_VERSION,
    workspaceId,
    sensitivityScope,
    input: question,
    model: ASK_MODEL,
  });
  const hit = await getCached(cacheKey);
  if (hit) return JSON.parse(hit);

  // ... 기존 OpenAI 호출 ...
  const result = { answer, sources };
  await setCached(cacheKey, JSON.stringify(result));
  return result;
}
```

> **주의:** 실제 `ask.ts`는 스트리밍 SSE를 쓰고 있을 수 있다. 스트리밍일 경우 최종 완성 텍스트만 캐시하고, 히트 시 단일 `message` 이벤트로 재생해 주는 경량 replayer를 추가한다. 이 확장은 이 PR의 스코프 안이다.

---

## 4. 테스트 / 검증 전략

### 4.1 유닛
- `pnpm --filter=@jarvis/ai test` — `cache.test.ts` 전부 green.
- `pnpm --filter=@jarvis/ai type-check`.

### 4.2 통합 (G4)
- 로컬: Postgres 16 + pgvector 컨테이너 실행:
  ```bash
  docker run --rm -d --name jarvis-test-pg \
    -e POSTGRES_USER=jarvis -e POSTGRES_PASSWORD=jarvis -e POSTGRES_DB=jarvis_test \
    -p 5432:5432 pgvector/pgvector:pg16
  ```
- `psql ... -c "CREATE EXTENSION IF NOT EXISTS vector;"`
- `pnpm db:migrate`
- `TEST_DATABASE_URL=postgres://jarvis:jarvis@localhost:5432/jarvis_test pnpm test:integration`
- 3개 테스트 모두 green이면 G4 통과.

### 4.3 CI
- `.github/workflows/test.yml` 푸시 후 Actions 탭에서 green 확인.
- red 원인 체크리스트:
  - pgvector 이미지 대신 vanilla postgres를 쓰면 `CREATE EXTENSION vector`가 실패 → pgvector/pgvector:pg16 유지.
  - `db:migrate` 실패 → Lane A/C 마이그레이션이 머지되었는지 확인.
  - integration skip만 떴다면 `TEST_DATABASE_URL` env가 job에 전달되지 않은 것.

---

## 5. 롤백 계획

- PR#5 롤백: `ask.ts`의 cache-through 블록 제거 + `cache.ts` 삭제. 캐시 히트가 없어지는 것 외의 기능 영향 없음.
- PR#9 롤백: `.github/workflows/test.yml` 파일 삭제, `test:integration` 스크립트 제거. 통합 테스트 파일은 `describe.skip` 처리로 유지해도 무해.

---

## 6. 관측 / 운영

- 인메모리 캐시이므로 별도 메트릭 없음. Phase-7B에서 Redis 전환 시 히트율/미스율/eviction 카운터 노출 예정.
- CI 실패 알림은 기본 GitHub notification으로 충분 (추가 Slack integration은 Phase-7B).
- `PROMPT_VERSION` 상수 업데이트 시 모든 기존 캐시가 즉시 무효화되는 점을 PR 본문에 기록.

---

## 7. Self-Review Checklist

- [ ] **스펙 정합성 — PR#5의 1차 산출물은 `makeCacheKey()` 키 조합 로직이다**. LRU 스토어는 in-memory helper이며 7B에서 교체 가능하다는 점이 문서·주석에 명시되어 있다.
- [ ] `cache.ts`가 `llm_call_log`에 의존하지 않는다 (Lane A 독립).
- [ ] `makeCacheKey`가 `workspaceId`, `promptVersion`, `sensitivityScope` 세 필드 각각의 변경에 반응한다 (unit tests 존재) — 이것이 PR#5 검증의 핵심.
- [ ] LRU cap 500 eviction 동작이 테스트로 보장된다 (보조 helper 검증).
- [ ] `ask.ts` cache-through 실패 테스트(`ask-cache.test.ts`)가 구현 전에 red를 보였다.
- [ ] CI 워크플로에 `node scripts/check-schema-drift.mjs --ci` 스텝이 포함되어 있다.
- [ ] `ask.ts` 시그니처 변경이 호출부(앱/워커)에도 반영되었다 (`sensitivityScope` 주입).
- [ ] `sensitivityScope` 포맷이 코드 주석과 본 문서(§0.4)에서 일치한다.
- [ ] 통합 테스트가 실제 pgvector에서 돌고, `TEST_DATABASE_URL` 없이도 전체 테스트 런이 깨지지 않는다 (skip).
- [ ] 통합 테스트 3개 시나리오가 모두 `workspaceId` 단일성 단언을 포함한다 (G4 달성).
- [ ] `document_chunks` 테이블 스키마 가정(`id, workspace_id, document_id, chunk_index, content, embedding`)이 Lane C PR과 일치한다 — 불일치 시 Lane C 머지 후 컬럼명 조정.
- [ ] `.github/workflows/test.yml`이 pgvector 확장을 명시적으로 설치하고, `pnpm db:migrate`를 유닛 테스트 이전에 실행한다.
- [ ] 야간 eval 잡은 `if: false`로 비활성화되어 있고, Lane B 머지 전까지 CI 시간을 소모하지 않는다.
- [ ] PR#5와 PR#9가 각각 독립된 커밋 시퀀스로 분리되어, PR#5만 선머지해도 PR#9가 깨지지 않는다.
- [ ] **Lane 의존성 명시:** PR#9 실행은 Lane A(`llm_call_log` 마이그레이션 성공) + Lane C(`document_chunks` 마이그레이션 + 시드 컬럼) 이후에만 CI가 green이 된다. 선행 Lane이 아직 머지되지 않았다면 PR#9는 draft로 유지한다.
- [ ] 스펙 §3 PR#5, §3 PR#9, §4 G4 요구사항을 모두 충족한다.
