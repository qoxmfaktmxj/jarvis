# 2026-04-29 — P0 Security Fixes

## 배경

3-에이전트(architect / code-reviewer / security-reviewer) 병렬 main 리뷰에서 **즉시 차단 권장 7건**이 도출됨. 보안 점수 5.5/10, RISK HIGH. 단일 PR로 묶어서 처리(사용자 결정).

브랜치: `claude/wizardly-leavitt-ced8d3` (현재 main과 동일 HEAD `a2f229b`)
워크트리: `C:\Users\kms\Desktop\dev\jarvis\.claude\worktrees\wizardly-leavitt-ced8d3`

## P0 항목 (7건)

| # | 분류 | 위치 | 결함 |
|---|---|---|---|
| 1 | A02 Crypto | [login/route.ts:84](apps/web/app/api/auth/login/route.ts) | `secure: false` 하드코딩 → 사내망 MITM으로 ADMIN 세션 탈취 |
| 2 | A07 Auth | [login/route.ts:13-39](apps/web/app/api/auth/login/route.ts), [dev-accounts.ts](apps/web/lib/auth/dev-accounts.ts) | `JARVIS_ENABLE_TEMP_LOGIN` env로 prod에서 dev account 활성 가능 + 평문 `admin/admin123!` |
| 3 | A07 Auth | [login/route.ts:12](apps/web/app/api/auth/login/route.ts) | 인증 엔드포인트 rate-limit 부재 → credential stuffing 무방어 |
| 4 | A06 Components | `pnpm-lock.yaml`, root `package.json:30`, [apps/web/package.json:58-59,88](apps/web/package.json) | npm CVE 7 High / 5 Moderate (`xlsx`, `next`, `next-intl`, `postcss`, `@xmldom/xmldom`) |
| 5 | A01 Access Control | [ask/actions.ts:230-269](apps/web/app/(app)/ask/actions.ts) | Server Action `evictOldConversations(workspaceId, userId)` IDOR — caller-supplied ID 검증 부재 |
| 6 | Data Loss | [ingest.ts:557-564](apps/worker/src/jobs/ingest.ts) | catch에서 `metadata: { error }` 통째 덮어쓰기 → PII hits·source provenance·이전 wikiIngest 메타 손실 |
| 7 | A05 Misconfig | [provider.ts:28-31](packages/ai/provider.ts), `docker/docker-compose.yml:96`, [.env.example:41](.env.example), [env.ts](apps/web/lib/env.ts) | `LLM_GATEWAY_KEY` 누락 시 `sk-jar...-dev` sentinel이 prod에 invisibly 적용 |

## 영향도 체크리스트 (jarvis-architecture 17계층)

| 계층 | 영향 |
|------|------|
| DB 스키마 | **없음** — audit_log 신규 row 동적, 스키마 무변경 |
| Validation | env.ts Zod 스키마 강화 (P0-7) |
| 권한 (34) | 변경 없음 |
| 세션 vs 권한 | 변경 없음 (Ask AI 세션 모델 유지) |
| Sensitivity 필터 | 변경 없음 |
| Ask AI agent | 변경 없음 |
| Wiki-fs | 변경 없음 |
| 검색 | 변경 없음 |
| 서버 액션/API | login/route.ts (P0-1,2,3) · ask/actions.ts (P0-5) · ask/route.ts 호출자 (P0-5) |
| 서버 lib | env.ts 강화 (P0-7) · rate-limit 재사용 (P0-3) · dev-accounts dev 격리 (P0-2) |
| UI 라우트 | 변경 없음 |
| UI 컴포넌트 | 변경 없음 |
| i18n 키 | **없음** — 에러 응답은 JSON only, UI 메시지 미추가 |
| 테스트 | login route, evictOldConversations, ingest catch, provider env 검증 unit 테스트 |
| 워커 잡 | ingest.ts (P0-6) |
| LLM 호출 | provider.ts (P0-7) |
| Audit | failed-login audit_log 추가 (P0-3) |

## 핵심 결정점

### A. dev-account 처리 (P0-2)
- **결정:** env override 제거. `tempLoginEnabled = process.env.NODE_ENV !== "production"` 단일 검사. `JARVIS_ENABLE_TEMP_LOGIN` 흔적 완전 삭제.
- 추가: `findTempDevAccount`에서 `crypto.timingSafeEqual` 적용 (timing oracle 회피).
- 근거: HIGH-3(reset-password stub) 완성될 때까지 dev-account가 dev 빌드에서만 살아있어야 함. env override는 사고 면.

### B. rate-limit 키 전략 (P0-3)
- **결정:** IP 단일 키. `login:${clientIp}` → 5회 / 300초.
- IP+username 조합은 **거부** — username enumeration(존재 여부 확인) 면을 만든다.
- IP 추출: `request.headers.get('x-forwarded-for')` 첫 토큰 → 없으면 `'unknown'` (dev 환경).
- 멀티 인스턴스 PG 외부화는 follow-up (`MED` 등급).
- 실패 응답: `429 Too Many Requests`, `Retry-After` 헤더.
- audit_log: 매 실패 + rate-limit 발동 시 `{ action: 'auth.login.fail', userId: null, targetType: 'login', diff: { ip, reason } }` 기록.

### C. 의존성 패치 버전 (P0-4)

| 패키지 | 현재 | 목표 | 채택 근거 |
|--------|------|------|-----------|
| `next` | ^15.2.4 | **^15.5.15** | `backport` dist-tag — security backport, breaking change 회피 |
| `next-intl` | ^4.9.0 | **^4.11.0** | latest stable, open-redirect 패치 포함 |
| `postcss` | ^8.5.3 | **^8.5.12** | latest patch, XSS 패치 포함 |
| `@xmldom/xmldom` | 0.8.12 (transitive via mammoth) | **0.8.13** (pnpm override) | mammoth가 0.8.x range 요구, 보안 패치만 |
| `xlsx` | ^0.18.5 (root devDep) | **제거** | 단일 사용처 [scripts/migrate-add-dev-from-xls.ts](scripts/migrate-add-dev-from-xls.ts)는 일회성. 필요 시 별도 dev-only로 sheetjs tarball 도입. **사용자 확인 필요.** |

### D. evictOldConversations 시그니처 (P0-5)
- **결정:** 인자 전부 제거 (`excludeId`만 옵션 유지). 함수 내부에서 `requireSession()` 호출.
- 호출자 [route.ts:141](apps/web/app/api/ask/route.ts) → `await evictOldConversations()` (session 인자 제거).
- 트랜잭션화 부수 처리: count → select → delete 단일 `db.transaction` 안에서 + 동일 사용자 동시 호출 방지를 위해 `pg_advisory_xact_lock(hash(workspaceId, userId))`. (HIGH-2 TOCTOU 함께 해결)

### E. ingest catch metadata 머지 (P0-6)
- **결정:** try 안에서 fetch한 `source` 변수가 catch 스코프 밖이므로, catch 진입 시 별도 SELECT로 재조회 → `existingMetadata` 추출 → spread merge.
- spread 순서: `{ ...existingMetadata, error: message, errorAt: new Date().toISOString() }`.

### F. provider env 강화 (P0-7)
- **결정:** [apps/web/lib/env.ts](apps/web/lib/env.ts) Zod schema 확장:
  - `LLM_GATEWAY_KEY` / `CLIPROXY_API_KEY` 둘 중 하나 필수 in production
  - sentinel(`sk-jar...-dev` exact match) 거부
  - `superRefine`에서 검증.
- [packages/ai/provider.ts:28-31](packages/ai/provider.ts) fallback `?? "sk-jar...-dev"` 제거. 부재 시 lazy `gatewayClient()` 호출 직전에 throw (현재 어차피 lazy initialization이므로 dev에서 gateway flag가 false면 영향 없음).
- docker-compose.yml의 `LLM_GATEWAY_KEY: ${LLM_GATEWAY_KEY:-sk-jarvis-local-dev}` default 제거 — 명시적 env 강제.

## 파일 변경 순서 (jarvis-architecture 20단계 매핑)

```
 9. packages/ai/provider.ts                          (P0-7: fallback 제거)
11. apps/web/lib/env.ts                              (P0-7: Zod 강화)
11. apps/web/lib/auth/dev-accounts.ts                (P0-2: timingSafeEqual)
13. apps/web/app/(app)/ask/actions.ts                (P0-5: 시그니처 변경 + tx + advisory lock)
14. apps/web/app/api/ask/route.ts                    (P0-5: 호출자 단순화)
14. apps/web/app/api/auth/login/route.ts             (P0-1, P0-2, P0-3: secure + env-only + rate-limit + audit)
18. apps/worker/src/jobs/ingest.ts                   (P0-6: existingMetadata 머지)
20. **테스트 파일 (TDD red 먼저)**
    - apps/web/app/api/auth/login/route.test.ts
    - apps/web/app/(app)/ask/actions.test.ts (evictOldConversations)
    - apps/worker/src/jobs/ingest.test.ts (catch path)
    - packages/ai/provider.test.ts (env validation)
    - apps/web/lib/env.test.ts (Zod superRefine)
infra. docker/docker-compose.yml + .env.example      (P0-7: sentinel default 제거)
infra. package.json + apps/web/package.json + pnpm-lock.yaml (P0-4: 의존성)
```

**i18n 키 변경 없음** → 17단계(ko.json) skip.

## TDD 루프 (각 P0별)

각 항목은 **red → green → refactor** 순서. 검증 명령은 항상 2회 연속.

### P0-7 (provider + env) [실행: 단독 task]
1. **red**: `apps/web/lib/env.test.ts` — production NODE_ENV + LLM_GATEWAY_KEY 부재 시 throw 기대 / sentinel 매칭 시 throw 기대
2. **red**: `packages/ai/provider.test.ts` — fallback 제거 후 `__resetProviderCache` + env mock으로 gateway client 호출 시 명시적 throw 기대
3. **green**: env.ts superRefine + provider.ts fallback 제거
4. 검증: `pnpm --filter @jarvis/web type-check && pnpm --filter @jarvis/web type-check && pnpm --filter @jarvis/web test --run env provider && pnpm --filter @jarvis/web test --run env provider`

### P0-1 + P0-2 + P0-3 (login route 통합) [실행: 단독 task — 한 파일 다중 변경]
1. **red**: `apps/web/app/api/auth/login/route.test.ts`
   - production NODE_ENV에서 `JARVIS_ENABLE_TEMP_LOGIN=true`도 무시하고 404 기대
   - 쿠키 옵션 `secure: true` (production), `secure: false` (dev) 기대
   - 같은 IP 6회 시도 시 6번째 429 + Retry-After 헤더 기대
   - 실패 로그인 시 audit_log INSERT 기대
2. **red**: `apps/web/lib/auth/dev-accounts.test.ts` — timingSafeEqual 사용 (mocking 또는 동작 검증)
3. **green**: 본문 수정
4. 검증: `pnpm --filter @jarvis/web type-check && pnpm --filter @jarvis/web type-check && pnpm --filter @jarvis/web test --run auth/login dev-accounts && pnpm --filter @jarvis/web test --run auth/login dev-accounts`

### P0-5 (evictOldConversations IDOR + 트랜잭션) [실행: 단독 task]
1. **red**: `apps/web/app/(app)/ask/actions.test.ts`
   - `evictOldConversations()` 호출 시 인자 없음 → session 기반 동작 기대
   - 동시 호출 시 advisory lock으로 직렬화 기대 (또는 단일 tx 검증)
   - 외부에서 다른 workspaceId/userId 주입 불가능(타입 레벨)
2. **green**: 시그니처 변경 + tx + advisory lock + 호출자(`route.ts:141`) 동기 수정
3. 검증: `pnpm --filter @jarvis/web type-check && pnpm --filter @jarvis/web type-check && pnpm --filter @jarvis/web test --run actions ask && pnpm --filter @jarvis/web test --run actions ask`

### P0-6 (ingest catch metadata) [실행: 단독 task]
1. **red**: `apps/worker/src/jobs/ingest.test.ts`
   - catch 진입 시 기존 metadata `{ piiHits: [...], wikiIngest: {...} }` 보존되고 `error` 키만 추가 기대
2. **green**: catch에서 별도 SELECT + spread merge
3. 검증: `pnpm --filter @jarvis/worker type-check && pnpm --filter @jarvis/worker type-check && pnpm --filter @jarvis/worker test --run ingest && pnpm --filter @jarvis/worker test --run ingest`

### P0-4 (의존성 패치) [실행: 마지막, lock file 변경 분리]
1. xlsx 사용처 재확인 후 root `package.json:30`에서 제거 (사용자 승인 후)
2. `apps/web/package.json` next/next-intl/postcss 버전 bump
3. root `package.json` `pnpm.overrides`에 `"@xmldom/xmldom": "^0.8.13"` 추가
4. `pnpm install` 실행 → `pnpm-lock.yaml` 갱신
5. `pnpm audit --prod --audit-level=high` 통과 확인
6. 전체 검증 게이트 (type-check + lint + test 2회 연속)

## 검증 게이트 (완료 전 필수)

| 명령 | 범위 | 필수 여부 |
|------|------|----------|
| `pnpm --filter @jarvis/web type-check` | web (P0-1,2,3,5,7) | **필수, 2회** |
| `pnpm --filter @jarvis/worker type-check` | worker (P0-6) | **필수, 2회** |
| `pnpm --filter @jarvis/web lint` | web | **필수** |
| `pnpm --filter @jarvis/web test` | web unit | **필수, 2회** |
| `pnpm --filter @jarvis/worker test` | worker unit | **필수, 2회** |
| `node scripts/check-schema-drift.mjs --precommit` | DB | skip (스키마 무변경) |
| `pnpm wiki:check` | wiki | skip (위키 무변경) |
| `pnpm audit:rsc` | RSC | **필수** (login route 변경 — 보호장치 검증) |
| `pnpm eval:budget-test` | LLM | **필수** (provider.ts 변경) |
| `pnpm audit --prod --audit-level=high` | 의존성 | **필수** (P0-4 후) |
| `pnpm --filter @jarvis/web exec playwright test e2e/auth*.spec.ts` | e2e auth | **필수** (PR 직전) |

## 위험 / 주의

1. **xlsx 제거**: [scripts/migrate-add-dev-from-xls.ts](scripts/migrate-add-dev-from-xls.ts) 일회성 스크립트가 import. 이미 실행 완료라면 제거 가능. 미실행이면 sheetjs tarball 또는 exceljs 교체 필요. **사용자 확인 필수.**
2. **next 15.2.4 → 15.5.15**: minor jump. App Router behavior 회귀 가능성 미세하게 존재. 검증은 e2e + 빌드.
3. **rate-limit IP 추출**: dev에서 X-Forwarded-For 부재 → `'unknown'` 키 공유 → dev 사용자끼리 lockout 가능. dev에서는 rate-limit skip 또는 throttle 완화 검토. **결정: dev에서도 동일 정책 적용** (단순성 우선, 5회/5분은 충분히 관대).
4. **advisory lock**: `pg_advisory_xact_lock`은 트랜잭션 종료 시 자동 해제. drizzle `db.transaction` 안에서 raw `sql` 실행으로 안전.
5. **server action에서 `requireSession`**: route handler가 server action을 import해서 호출할 때 cookies/headers context 전파 확인. 현재 [route.ts:141](apps/web/app/api/ask/route.ts)에서 이미 server action 호출 중이라 동작 확인됨.

## 산출물

- 수정 파일: 7개 + 테스트 5개
- lockfile 변경: `pnpm-lock.yaml`, `package.json`, `apps/web/package.json`
- 인프라: `docker/docker-compose.yml`, `.env.example`
- 신규 audit_log 항목: `auth.login.fail`, `auth.login.rate_limit`

## 비범위 (이 PR에서 제외)

- HIGH 등급 7건(legacy ask AI 정리, manual wiki link projection, ask route INSERT 트랜잭션, wiki_graph_query permission 통일, 세션 회전, chat 라우트 인증 일관성, reset-password 실구현) — 별도 PR
- MED 등급 (sql.raw, upload magic-byte, CSP 등) — follow-up
- multi-instance rate-limit PG 외부화 — follow-up
