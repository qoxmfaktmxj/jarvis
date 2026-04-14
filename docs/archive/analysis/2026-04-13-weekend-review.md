# Jarvis Weekend Review & Next Steps

> **Date**: 2026-04-13
> **Author**: KMS
> **Status**: Active Review
> **Branch**: main (60ec23a)

---

## 1. Jarvis 현재 상태 요약

### 1.1 레포 구조

```
jarvis/
├── apps/
│   ├── web/          # Next.js 15 App Router (OIDC SSO, RBAC, i18n)
│   └── worker/       # pg-boss 기반 백그라운드 워커
│       └── src/jobs/
│           ├── ingest.ts         # 파일 업로드 → 텍스트 추출
│           ├── compile.ts        # MDX 컴파일 → 요약
│           ├── embed.ts          # text-embedding-3-small → pgvector
│           ├── graphify-build.ts # Graphify subprocess 실행
│           ├── stale-check.ts    # 문서 신선도 검사
│           ├── cleanup.ts        # 리소스 정리
│           └── aggregate-popular.ts # 인기 검색어
├── packages/
│   ├── ai/           # ask.ts, embed.ts, graph-context.ts
│   ├── auth/         # OIDC, RBAC, session
│   ├── db/           # Drizzle ORM + schema (15개 도메인)
│   ├── search/       # FTS + pg_trgm + pgvector hybrid
│   └── shared/       # 공용 유틸
├── docs/
│   ├── plan/graphify-integration.md  # 3-phase 통합 계획
│   ├── guidebook/    # ISU 가이드북 (노션에서 내려받은 문서)
│   └── superpowers/  # 12개 구현 계획 + 2개 설계 스펙
└── docker/           # docker-compose (PG, Redis, MinIO, OIDC)
```

### 1.2 주요 기술 스택

| 계층       | 기술                                                    |
| -------- | ----------------------------------------------------- |
| Frontend | Next.js 15, React, Tailwind, next-intl                |
| Backend  | Next.js Server Actions + API Routes                   |
| Worker   | pg-boss, Node.js subprocess                           |
| DB       | PostgreSQL + pgvector (1536d) + Drizzle ORM           |
| 검색       | FTS(tsvector) + pg_trgm + vector hybrid (0.6/0.3/0.1) |
| AI 생성    | Anthropic Claude (SSE 스트리밍)                           |
| AI 임베딩   | OpenAI text-embedding-3-small                         |
| 인증       | OIDC SSO (PKCE, state, nonce 검증)                      |
| 파일저장     | MinIO (S3 호환)                                         |
| 캐시       | Redis                                                 |

### 1.3 현재 화면/기능 목록

| 메뉴 | 경로 | 상태 |
|------|------|------|
| Dashboard | `/dashboard` | 구현됨 |
| Projects | `/projects`, `/projects/[id]/*` | 구현됨 |
| Systems | `/systems`, `/systems/[id]/*` | 구현됨 |
| Knowledge | `/knowledge`, `/knowledge/[pageId]/*` | 구현됨 |
| Knowledge 하위 | `/knowledge/faq,glossary,hr,onboarding,tools` | 구현됨 |
| Search | `/search` | 구현됨 |
| Ask AI | `/ask` | 구현됨 |
| Attendance | `/attendance`, `/attendance/out-manage` | 구현됨 |
| Architecture | `/architecture` | 구현됨 (Graphify 뷰어) |
| Profile | `/profile` | 구현됨 |
| Admin | `/admin/*` (8개 하위) | 구현됨 |

### 1.4 최근 커밋 (main)

```
60ec23a fix(ask): show error state when first query fails (#2)
e24727a fix(architecture): push sensitivity filter to DB level
e03d9b4 fix(ai): add permissions to graph-context integration tests
9b77cba feat(graphify): Trust & Scope — graph-aware Ask + architecture lifecycle UI
38ce669 fix: remove duplicate migration, push sensitivity filter to DB layer
```

---

## 2. 코드/소스 문제점 (현재 상태 기준)

### 2.1 해결이 필요한 이슈

| # | 분류 | 이슈 | 위치 | 심각도 |
|---|------|------|------|--------|
| 1 | **Worker** | **graphify-build.ts 파이프라인 깨짐** — `execFileAsync('graphify', [tempDir, '--wiki'])` 호출하지만 graphify CLI는 이 형식을 지원하지 않음. 실제 서브커맨드: install\|query\|benchmark\|hook\|claude\|codex | `apps/worker/src/jobs/graphify-build.ts:151-165` | **Critical** |
| 2 | **Worker** | **compile→embed 체인 끊김** — compile 완료 후 embed job이 자동 enqueue되지 않음 | `apps/worker/src/jobs/compile.ts` | **높음** |
| 3 | Auth | 로그인 전 deep link redirect 시 querystring 유실 | `middleware.ts` | **높음** |
| 4 | Auth | dev login이 NODE_ENV만으로 열림 + redirect 검증 부재 | `/api/auth/dev-login` | 중간 |
| 5 | Auth | E2E auth helper RBAC 불일치 — mock permissions가 ROLE_PERMISSIONS와 안 맞음 | E2E test helpers | 중간 |
| 6 | Config | next.config.ts 이미지 허용 도메인이 localhost:9000만 | `next.config.ts` | 중간 |
| 7 | Config | middleware publicPaths에 `/callback` 있으나 실제 콜백은 `/api/auth/callback` | `middleware.ts` | 낮음 |
| 8 | Worker | graphify-build.ts가 ANTHROPIC_API_KEY로 graphify subprocess 실행 (OpenAI 전환 필요) | `graphify-build.ts` | **높음** |
| 9 | Worker | worker 패키지에 lint 스크립트 없음 | `apps/worker/package.json` | 낮음 |
| 10 | AI | Anthropic(생성) + OpenAI(임베딩) 혼합 provider | `packages/ai/*` | 정보 |
| 11 | DB | 마이그레이션 0004 미적용 — scopeType/scopeId (graph_snapshot), sourceType/sourceKey (knowledge_page) | `packages/db/schema/graph.ts` | 중간 |
| 12 | Config | `.env.example`은 `NEXTAUTH_SECRET` 사용, 코드는 `SESSION_SECRET` 참조 — 변수명 불일치 | `.env.example`, `.env` | 중간 |
| 13 | Config | `.env.example`에 `MINIO_USE_SSL` 누락 (실제 `.env`에는 존재) | `.env.example` | 낮음 |
| 14 | Infra | GitHub Actions CI/CD 워크플로 없음 — type-check, lint, test, e2e, schema-drift 미자동화 | 프로젝트 루트 | 중간 |
| 15 | Code | MinIO 클라이언트 중복 — `apps/web`과 `apps/worker`에 각각 존재 (TODO 주석 있음) | `apps/web/app/api/graphify/...` | 낮음 |

### 2.2 해결 우선순위

1. **middleware redirect 복원** — pathname만 저장 중, pathname + search 보존 필요
2. **graphify-build provider 전환** — Claude→OpenAI 결정, Anthropic 의존 제거 예정
3. **dev login 강화** — 명시적 환경변수 플래그 + redirect 검증 재사용
4. **이미지 도메인 설정** — 운영 배포 시 CDN/reverse proxy 대응 필요

---

## 3. UI/UX 문제점

| # | 이슈 | 상세 | 우선순위 |
|---|------|------|----------|
| 1 | 사이드바 Desktop-first 고정 | `--sidebar-width: 240px` 고정, 모바일 드로어 없음 | **높음** |
| 2 | Admin 메뉴 비관리자에게 노출 | 사이드바에 항상 렌더링, 클릭하면 forbidden 리다이렉트 | 높음 |
| 3 | 검색 박스 = 링크 | 탑바 검색창이 실제 input이 아니라 /search Link | 중간 |
| 4 | 알림 벨 placeholder | 클릭 핸들러/배지/패널 없음 | 중간 |
| 5 | 사이드바 i18n 미적용 | 사이드바 1차 메뉴가 영문 하드코딩 | 중간 |
| 6 | UserMenu 접근성 | 키보드 화살표 이동/포커스 복귀 없음 | 낮음 |
| 7 | Ask AI 단축키 표기 | Ctrl+Enter만 표시, Mac 대응 없음 | 낮음 |
| 8 | Ask AI 대화 이력 | 컴포넌트 state만, 새로고침 시 소실 | 중간 |

---

## 4. 주말 대화 핵심 결정사항

### 4.1 Provider 전환 (확정)

| 항목 | AS-IS | TO-BE |
|------|-------|-------|
| 생성 모델 | Anthropic Claude | **OpenAI gpt-5.4-mini** |
| 임베딩 모델 | OpenAI text-embedding-3-small | 유지 |
| 임베딩 차원 | 1536d | 유지 |
| Graphify 추출 | Anthropic API | OpenAI 또는 Codex 기반 |

**이유**: Anthropic은 자체 임베딩 모델이 없어 Voyage 등 외부 vendor 추가 필요. OpenAI는 생성+임베딩을 하나의 API/billing으로 관리 가능.

### 4.2 Graphify 통합 전략 (확정)

| 결정      | 내용                                                      |
| ------- | ------------------------------------------------------- |
| 역할      | 백엔드 그래프 빌드 엔진 (사용자 직접 노출 아님)                            |
| 빌드 방식   | Codex 기반 Runner 또는 로컬 수동 실행                             |
| 산출물 활용  | graph.json → DB materialize, wiki/*.md → knowledge_page |
| 질의 방식   | DB materialization 기반 조회 (graphify query CLI 직접 미사용)    |
| MCP     | deep mode에서만 `python -m graphify.serve` 고려              |
| 업데이트 정책 | **version pinning + canary, 자동 daily upgrade 금지**       |

### 4.3 외부 레포 역할 분리 (확정)

| 레포                    | Jarvis에서의 역할                                     |
| --------------------- | ------------------------------------------------ |
| **Graphify**          | 주력 그래프 빌드 엔진 (graph.json, wiki, GRAPH_REPORT.md) |
| **MindVault**         | 실험용 세컨드 빌더 / 질의 오케스트레이션 아이디어 차용                  |
| **llm-wiki-compiler** | 정본 위키 설계 철학 참고 (two-phase, provenance, lint)     |
| **qmd**               | 검색 UX 아이디어만 차용 (모드 분리, context metadata)         |

### 4.4 제품 포지션 (확정)

**AS-IS**: AI 붙은 사내위키 + 메뉴포털

**TO-BE**: 정본 위키 + 과거 해결 판례 + 구조 그래프 + 학습 튜터를 합쳐서,
임직원이 **"찾고, 믿고, 처리하고, 배우게"** 만드는 업무 운영 시스템

---

## 5. 주말 대화에서 도출된 신규 기능 아이디어

### 5.1 확정된 추가 기능

| # | 기능 | 설명 | 차별점 |
|---|------|------|--------|
| 1 | **사례 판례 엔진** | 8년치 유지보수 DB를 정규화/군집화, 유사 사례 추천 | 매우 높음 |
| 2 | **문서 신뢰도/최신성** | 최종수정일, 검증일, 충돌 여부, 출처 수 배지 | 높음 |
| 3 | **HR 튜터** | 개념 설명, 역질문, 시나리오 시뮬레이션, 답변 리뷰 | 높음 |
| 4 | **지식 부채 레이더** | 반복 문의인데 문서 없는 주제, 오래된 문서, 충돌 탐지 | 높음 |
| 5 | **변경 영향도** | graphify 기반 메뉴/배치/테이블/고객사 연결 탐색 | 중간 |
| 6 | **고객사 컨텍스트** | 같은 질문이라도 고객사별 커스터마이징/주의점 자동 반영 | 중간 |
| 7 | **답변 카드형 Ask** | 한 줄 결론 + 신뢰도 + 근거 + 유사사례 + 다음 행동 버튼 | 높음 |

### 5.2 운영 아이디어

| 아이디어 | 설명 |
|----------|------|
| Simple / Expert 2단 UI | 일반 임직원은 간결 답변, 운영자는 상세 증거 |
| 역할별 Home | Dashboard를 사용자 역할에 따라 다르게 구성 |
| 답변 사후평가 루프 | 해결됨/미해결/뒤집힘 피드백 수집 → 답변 품질 학습 |
| 문서화 후보 자동 발굴 | 반복 문의인데 문서가 없는 주제 탐지 |
| 처리 경로/난이도 추정 | 과거 데이터 기반 예상 처리 흐름 및 소요시간 |

---

## 6. Ask AI 라우팅 설계 (신규)

### 6.1 4-Lane 라우팅 구조

```
질문 입력
  ↓
[분류기] → graph-first | text-first | hybrid | case-first | tutor-first
  ↓
[Retrieval]
  ├── text: FTS + pgvector hybrid (기존)
  ├── graph: node/edge/path/community 조회 (기존 graph-context.ts)
  ├── cases: 유사 사례 검색 (신규)
  └── tutor: 학습 카드 조회 (신규)
  ↓
[Evidence Gate] → 실제 evidence 강도에 따라 최종 모드 확정
  ↓
[Answer Composer] → 근거 기반 합성 + 답변 카드 구성
```

### 6.2 판별 기준 (요약)

- **Graph 신호**: 연결, 영향, 의존, 경로, 호출, 아키텍처, 코드형 토큰 등
- **Text 신호**: 규정, 절차, 기준, 기한, 서류, 승인, 최신, 정의 등
- **Case 신호**: 장애, 오류, 재현, 원인, 해결, 고객사, 재오픈 등
- **Tutor 신호**: 퀴즈, 문제, 연습, 시나리오, 피드백 등

### 6.3 핵심 원칙

1. **graph-first ≠ graph-only** — 구조 질문이라도 text support 병행
2. **분류기가 틀릴 수 있다** — retrieval 결과로 2차 검증 (evidence gate)
3. **graph-only 허용 조건 엄격** — evidence 5점 이상 + 최신성/정책 요구 없을 때만
4. **AI는 라우터가 아니라 합성기** — 라우팅은 규칙+분류기, AI는 마지막 답변 생성

---

## 7. 유지보수 사례 데이터 활용 전략

### 7.1 데이터 파이프라인

```
원본 DB (몇만 건)
  ↓
[규칙 전처리] HTML 제거, 마스킹, 정규화
  ↓
[LLM 1차 구조화] 증상/원인/조치/결과 JSON 추출 (저비용 모델)
  ↓
[임베딩/군집화] 유사 사례 묶기, 중복 제거
  ↓
[LLM 2차 정제] 군집 대표 요약, FAQ 초안 (고비용 모델)
  ↓
[사람 검수] 상위 이슈, 고객사 이슈, 충돌 항목만
  ↓
[지식 승격] precedent digest → canonical page → graphify
```

### 7.2 사례 정규화 스키마 (안)

```typescript
interface NormalizedCase {
  customer: string;
  module: string;
  symptom: string;
  suspectedCause: string;
  confirmedCause: string;
  actionTaken: string;
  result: 'resolved' | 'workaround' | 'unresolved';
  reopened: boolean;
  sourceRefs: string[];
  occurredAt: string;
  resolvedAt: string;
  authorRole: string;
  trustScore: number;
}
```

### 7.3 핵심 원칙

- **전수 수기 문서화 금지** — LLM 1차 정리 후 핵심만 사람 검수
- **건별이 아니라 패턴별 문서화** — 10,000건 → 150 클러스터 → 150 대표 문서
- **Graphify 입력은 정제 후** — raw ticket 그대로 graphify 하면 노이즈 그래프

---

## 8. Graphify 운영 방식

### 8.1 추천 이중 운영

| 모드 | 대상 | 방식 | 품질 |
|------|------|------|------|
| **수동 승인 빌드** | 핵심 코퍼스 (HR core, 운영 가이드) | 로컬 Claude Code + Opus | 높음 |
| **자동 빌드** | 일반 문서 | Codex Runner 또는 OpenAI API | 중간 |

### 8.2 코퍼스 관리 원칙

- 코퍼스는 도메인/프로젝트별 분할 (거대 단일 그래프 금지)
- `.graphifyignore` 적극 활용 (vendor, dist, node_modules, 임시파일)
- incoming → accepted → needs_review → rejected 상태 관리
- 매번 전체 리빌드보다 `--update` + SHA256 캐시 활용

### 8.3 서버 스케줄링 참고

- Anthropic 공식 자동화 경로: API 키 기반 (구독 세션 아님)
- 서버 배치는 Claude Code 구독 연결보다 API/Agent SDK 권장
- **daily 자동 승격 금지** — version pinning + canary + 회귀검증 후 승격

---

## 9. 위키 정보구조 설계 (Blue Print)

### 9.1 두 개의 지식 표면

| 표면 | 소유 | 목적 |
|------|------|------|
| **Canonical Wiki** | 사람 (정본) | 정책, 런북, 시스템 문서, FAQ, 온보딩 |
| **Derived Graph Wiki** | 기계 (파생) | graph report, community page, god-node, path explanation |

### 9.2 페이지 메타데이터

```yaml
# Canonical fields
origin: manual | imported | generated
authority: canonical | derived | reference
page_type: runbook | system | project | onboarding | hr-policy | faq | decision | incident | analysis | glossary

# Graph extension (generated pages)
artifact_type: graph_report | community | concept | god_node | path | source_extract
snapshot_id: uuid
confidence_summary: string
derived_from: string[]

# Trust fields
last_verified_at: timestamp
trust_score: number
conflict_detected: boolean
customer_scope: string[]
```

### 9.3 검색 우선순위

1. Canonical docs (정본 문서)
2. Graph artifacts (구조 분석 결과)
3. Raw source extracts (원본)

---

## 10. 다음 단계 우선순위

### Phase 0: 즉시 수정 (이번 주)

- [ ] **graphify-build.ts 파이프라인 수정** — CLI 호출 방식 교체 또는 Python 모듈 직접 호출
- [ ] **compile→embed 체인 복구** — compile 완료 시 embed job 자동 enqueue
- [ ] middleware redirect에 querystring 보존 추가
- [ ] dev login 환경변수 플래그 + redirect 검증
- [ ] 사이드바 Admin 메뉴 권한 기반 렌더링
- [ ] Provider 전환: ask.ts Anthropic → OpenAI
- [ ] 마이그레이션 0004: scopeType/scopeId, sourceType/sourceKey 추가

### Phase 1: 핵심 인프라 (1~2주)

- [ ] Ask AI Answer Card 스키마 정의 (결론 + 신뢰도 + 근거 + 다음행동)
- [ ] Ask AI 라우터 추가 (graph-first / text-first / hybrid)
- [ ] Trust metadata 추가 (origin, authority, last_verified_at, conflict_flag)
- [ ] 유지보수 사례 DB 정규화 파이프라인 설계

### Phase 2: 차별화 기능 (2~4주)

- [ ] Cases (판례) 레이어 — 정규화, 군집화, 유사 사례 추천
- [ ] Knowledge Debt Radar — 반복 문의 vs 문서 부재 탐지
- [ ] Canonical Wiki Compiler — 정본 페이지 승격 워크플로
- [ ] 역할별 Home 화면

### Phase 3: 고도화 (4~8주)

- [ ] HR 튜터 / 시뮬레이터
- [ ] 고객사 컨텍스트 모드
- [ ] 변경 영향도 탐색 (Impact Explorer)
- [ ] 답변 사후평가 루프
- [ ] Simple / Expert 2단 UI

---

## 11. 아키텍처 최종 그림

```
[Raw Sources]
  HR 소스코드 / 운영 문서 / 유지보수 DB / PDF / 스크린샷

          ↓ (Compile Layer)

  ┌─────────────────┐  ┌──────────────────┐  ┌────────────────┐
  │ Graph Compiler   │  │ Case Compiler     │  │ Page Compiler   │
  │ (Graphify)       │  │ (정규화+군집화)    │  │ (llmwiki식)     │
  └────────┬────────┘  └────────┬─────────┘  └────────┬───────┘
           │                    │                      │
           ▼                    ▼                      ▼
  ┌─────────────────────────────────────────────────────────────┐
  │                      PostgreSQL                              │
  │  graph_* │ precedent_case │ knowledge_page │ knowledge_claim │
  │  pgvector │ ACL │ audit │ trust_metadata                     │
  └────────────────────────────┬────────────────────────────────┘
                               │
          ↓ (Retrieval Layer)

  ┌──────────────────────────────────────────────────────────┐
  │                    Query Router                           │
  │  [규칙 + 분류기] → graph-first | text-first | hybrid      │
  │                  → case-first | tutor-first               │
  └────────────────────────────┬─────────────────────────────┘
                               │
          ↓ (Answer Layer)

  ┌──────────────────────────────────────────────────────────┐
  │                  Answer Composer                          │
  │  evidence gate → source selection → LLM synthesis         │
  │  → Answer Card (결론 + 신뢰도 + 근거 + 다음행동)          │
  └──────────────────────────────────────────────────────────┘
                               │
          ↓ (UI Layer)

  ┌──────────┬──────────┬──────────┬──────────┬──────────┐
  │   Ask    │  Wiki    │  Cases   │ Impact   │  Tutor   │
  │          │          │          │          │          │
  │ 답변카드  │ 정본페이지 │ 판례검색  │ 관계탐색  │ 학습훈련  │
  └──────────┴──────────┴──────────┴──────────┴──────────┘
```

---

## 12. 미결 사항

| # | 사항 | 현재 상태 | 결정 필요 시점 |
|---|------|----------|---------------|
| 1 | Graphify 서버 자동 스케줄링 방식 | 고민 중 (서버 구독 vs API) | Phase 2 전 |
| 2 | MindVault 병렬 빌더 실험 여부 | 아이디어 단계 | Phase 2 |
| 3 | 유지보수 사례 DB 접근/마이그레이션 | 아직 미착수 | Phase 1 |
| 4 | OpenAI 모델 선정 (gpt-5.4 vs gpt-5.4-mini) | mini 유력 | Phase 0 |
| 5 | 로컬 Graphify 첫 실행 (HR repo) | 예정 | 즉시 |
| 6 | Canonical Wiki page_type 최종 확정 | 초안 작성됨 | Phase 1 |

---

## 13. 참고 문서

| 문서                     | 위치                                                                     |
| ---------------------- | ---------------------------------------------------------------------- |
| Graphify 3-Phase 통합 계획 | `docs/plan/graphify-integration.md`                                    |
| Jarvis 전체 설계 스펙        | `docs/superpowers/specs/2026-04-07-jarvis-design.md`                   |
| Trust & Scope 설계       | `docs/superpowers/specs/2026-04-10-graphify-trust-and-scope-design.md` |
| ISU 가이드북               | `docs/guidebook/isu-guidebook-full.md`                                 |
| Graphify README        | https://github.com/safishamsi/graphify/blob/v3/README.ko-KR.md         |
| MindVault README       | https://github.com/etinpres/mindvault                                  |
