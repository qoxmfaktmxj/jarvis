# Dashboard Phase 1 — External Signals (FX + Weather)

- 작성: 2026-04-30
- 인스턴스: Instance 2 (`dashboard-phase1-signals`)
- 기준 commit: `8f89279` (Phase 0 — 로컬 main, origin push 미수행)
- 브랜치 정책: **main 직접 작업** (사용자 결정, 위험 인지)
- 워크플로우: superpowers `writing-plans` → `test-driven-development` → `verification-before-completion`

## 목표

대시보드 환율(USD/EUR/JPY) + 날씨 카드용 데이터 파이프라인. **LLM 미사용**.
Worker가 cron으로 fetch → `external_signal` upsert → RSC가 read.

## Scope

### IN
1. `packages/external-signals` 신규 패키지 (web+worker 공유)
   - `exchangerate.ts` — exchangerate-api.com 어댑터
   - `kma.ts` — 기상청 단기예보(getVilageFcst) 어댑터
   - `types.ts` — Adapter 결과 타입 (RSC 출력 타입과 분리)
2. `apps/web/lib/queries/dashboard-signals.ts` 본문 (Phase 0 stub 시그니처 유지)
3. `apps/worker/src/jobs/external-signal-fetch.ts` + `apps/worker/src/index.ts` cron 등록
4. 단위·통합 테스트 (vitest)

### OUT
- 대시보드 카드 UI (다른 instance)
- region_grid seed 추가 (Phase 0 3,815 row로 충분)
- migration 추가 (**금지** — Phase 0 점유)
- LLM/RAG 호출 (미사용)
- airkorea(미세먼지) — 시간 부족, payload에서 omit (지시문 OK)

## 영향도 체크리스트 (jarvis-architecture 17계층)

| 계층 | 변경 | 비고 |
|------|------|------|
| DB 스키마 | ❌ | Phase 0가 `external_signal` + `region_grid` 이미 land |
| Validation (Zod) | ✅ 부분 | adapter 내부에서 외부 응답 가드용 (lightweight) |
| 권한 (34) | ❌ | 시스템 잡 |
| 세션 vs 권한 모델 | ❌ | RSC query는 호출자가 이미 세션 확보 |
| Sensitivity | ❌ | external_signal 도메인 sensitivity 없음 |
| Ask AI / agent tools | ❌ | |
| Wiki-fs (Karpathy) | ❌ | |
| 검색 (pg-search/precedent) | ❌ | |
| 서버 액션/API | ❌ | RSC query만 |
| 서버 lib | ✅ | `apps/web/lib/queries/dashboard-signals.ts` 본문 |
| UI 라우트 | ❌ | 다른 instance |
| UI 컴포넌트 | ❌ | 다른 instance |
| i18n | ❌ | UI 미터치 |
| 테스트 | ✅ | adapter unit + worker integration + RSC unit |
| 워커 잡 | ✅ | `external-signal-fetch` + cron 2개 |
| LLM 호출 | ❌ | |
| Audit | ✅ | `external_signal.fetch.success` / `external_signal.fetch.fail` |

## 파일 변경 순서 (jarvis-architecture 20단계 매핑)

```
0.  packages/external-signals/           (신규 공유 패키지 — 11계층보다 먼저)
    ├─ package.json
    ├─ tsconfig.json
    ├─ vitest.config.ts
    └─ src/
       ├─ index.ts
       ├─ types.ts
       ├─ exchangerate.ts (+ test)
       ├─ kma.ts (+ test)
       └─ kma-helpers.ts (+ test)        # base_date/base_time 계산 등
11. apps/web/lib/queries/dashboard-signals.ts (+ test)  # stub 본문 채움
19. apps/worker/src/jobs/external-signal-fetch.ts (+ test) + apps/worker/src/index.ts cron 등록
20. 모든 테스트 + 검증 게이트
```

i18n은 영향 없음(이번 PR 범위 아님). Phase 0가 이미 .env.example placeholder를 추가했으므로 .env.example 미수정.

## 어댑터 계약

### exchangerate (`fetchKrwRates`)

```ts
fetchKrwRates(deps?: { fetch?: typeof fetch; apiKey?: string; now?: () => Date })
  : Promise<{ base: "KRW"; rates: { USD: number; EUR: number; JPY: number }; fetchedAt: Date } | null>
```

- API: `GET https://v6.exchangerate-api.com/v6/{KEY}/latest/KRW` → `{ result, conversion_rates: { USD, EUR, JPY, ... } }`
- 미설정/에러 시 `null` (graceful) — `console.warn` + 호출자에서 skip
- **change 계산은 어댑터 책임 아님.** Worker가 직전 row를 읽어 비교한다 (DB 의존이라 어댑터 밖에서)

### KMA (`fetchVilageFcst`)

```ts
fetchVilageFcst({ nx, ny }, deps?)
  : Promise<{ temp: number; hi: number; lo: number; sky: SkyLabel; pty: PtyLabel; fetchedAt: Date } | null>
```

- API: `GET https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst`
  - params: `serviceKey`, `pageNo=1`, `numOfRows=300`, `dataType=JSON`, `base_date`, `base_time`, `nx`, `ny`
- `base_date/base_time` 결정: 발표 시각 02·05·08·11·14·17·20·23 (KST). 현재 시각 직전 발표 시각 사용. 헬퍼로 분리 + 단위 테스트
- 카테고리: TMP(현재기온), TMX(일 최고), TMN(일 최저), SKY(1=맑음/3=구름많음/4=흐림), PTY(0=없음/1=비/2=비눈/3=눈/4=소나기)
- TMX/TMN 부재 시 (예: 22시 발표 후 다음날 새벽) → 가용한 TMP 슬롯에서 max/min fallback. 그것도 없으면 `temp` 그대로 hi/lo로
- 미설정/에러 시 `null`

## 워커 잡 계약 (`external-signal-fetch`)

```ts
externalSignalFetchHandler(jobs, db = realDb, adapters = realAdapters, now = new Date())
  : Promise<{ workspaces: number; fxOk: number; fxFail: number; weatherOk: number; weatherFail: number }>
```

흐름:
1. `db.select().from(workspace)` — 모든 워크스페이스 iterate
2. **FX**: 워크스페이스당 1회. 어댑터 호출 → 직전 row 조회 → change 계산 → upsert (`onConflictDoUpdate`)
3. **Weather**: workspace.settings.defaults.weatherGrid → 없으면 서초구 (nx=60, ny=125). 어댑터 호출 → upsert. 격자 라벨은 region_grid에서 lookup
4. 각 결과를 `audit_log`에 `external_signal.fetch.success` / `.fail` 기록 (workspaceId, action, resourceType="external_signal", details, success, errorMessage)
5. expiresAt = fetchedAt + 90분 (RSC stale flag 기준과 동일)

upsert 키: `UNIQUE(workspace_id, kind, key)` (Phase 0 보장)

## RSC query 계약 (`getDailySignals`)

```ts
getDailySignals(workspaceId: string, userId: string): Promise<DashboardSignals>
```

- 격자 결정: `user.preferences.weatherGrid?.{nx,ny,label}` → workspace.settings.defaults.weatherGrid → 서초구 fallback
- `external_signal` SELECT (workspaceId, kind='fx', key='KRW') 1건
- `external_signal` SELECT (workspaceId, kind='weather', key=`${nx},${ny}`) 1건
- `stale = now - fetchedAt > 90min`
- 데이터 없으면 `null` 반환

## Cron 스케줄

KST → UTC 변환:

| KST | UTC | 비고 |
|-----|-----|------|
| 07-19시 매시 (13개) | 22-23시 + 00-10시 (전날 22-23, 당일 00-10) | `0 22-23,0-10 * * *` |
| 21시 | 12시 | |
| 00시 | 15시 (전날) | |
| 03시 | 18시 (전날) | |

총 16번/일. 두 schedule 별도 등록(의도 명확):
- `boss.schedule('external-signal-fetch', '0 22-23,0-10 * * *', {})`
- `boss.schedule('external-signal-fetch', '0 12,15,18 * * *', {})`

## Graceful Degrade

- API key 미설정 (`process.env.EXCHANGERATE_API_KEY`/`KMA_SERVICE_KEY` 빈 문자열): adapter가 `null` 반환, worker가 skip + audit "fail" + reason="missing_api_key"
- HTTP 4xx/5xx: adapter가 `null` 반환, worker는 audit "fail" + reason="http_error"
- region_grid 미발견 (사용자가 잘못된 nx/ny 입력): RSC query는 weather=null 반환

## 검증 게이트

| 명령 | 횟수 | 범위 |
|------|------|------|
| `pnpm --filter @jarvis/external-signals test` | 2 | 어댑터 unit |
| `pnpm --filter @jarvis/web test -- dashboard-signals` | 2 | RSC query |
| `pnpm --filter @jarvis/worker test -- external-signal-fetch` | 2 | 워커 잡 |
| `pnpm --filter @jarvis/external-signals type-check` | 2 | |
| `pnpm --filter @jarvis/web type-check` | 2 | |
| `pnpm --filter @jarvis/worker type-check` | 2 | |
| `pnpm --filter @jarvis/web lint` | 1 | |

DB 변경 없음 → `check-schema-drift` 불필요.
RSC 경계 변경 없음 → `audit:rsc` 불필요.
LLM 변경 없음 → `eval:budget-test` 불필요.

## 미결정 / 가정

- `user.preferences.weatherGrid` shape: `{ nx: number; ny: number; label?: string }` 가정 (jsonb free-form)
- `workspace.settings.defaults.weatherGrid` 동일 shape
- TMX/TMN 누락 fallback 정책: TMP slots min/max → adapter 내부에서 처리

## 위험

- **main 직접 commit** — 사용자 결정. 롤백·리뷰 흐름 일부 손실 감수
- origin/main이 한 발 뒤처짐 (`da74baa`) — 본 작업 끝나면 사용자가 push 결정
