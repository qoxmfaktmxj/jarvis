---
title: "Projects 리네임 + Add-Dev 신규 도메인 설계"
date: 2026-04-20
status: approved
author: brainstorming-session (Claude Opus 4.7)
implementation:
  approach: superpowers:subagent-driven-development
  builder_model: claude-sonnet-4-6
related:
  - docs/plan/2026-04-17-tsmt001-infra-pipeline.md
  - TSMT001.sql
  - 추가개발/*.xls
---

# Projects 리네임 + Add-Dev 신규 도메인 설계

## 0. 한 문장 요약

기존 `system`(/systems) 테이블을 `project`(/projects)로 리네임하여 "구축된 고객사 HR 시스템 인벤토리" 도메인으로 재정의하고, 기존 `project`(/projects 더미) 도메인을 완전 삭제한 후, 새 `additional_development`(/add-dev) 도메인을 추가해 "구축된 프로젝트에 대한 추가 개발 요청 → 계약 → 공수·매출 트래킹"을 단일 엔티티 + 탭 UI로 통합한다.

## 1. 배경

- 현재 `/projects`는 내부 업무용 더미 3건(Portal Rewrite / Auth Migration / Search Upgrade)만 있고 실제 업무와 무관.
- 이수시스템 EHR 도메인 실무는 "**구축된 고객사 HR 시스템**(TSMT001 392행)을 유지보수하면서, 공수가 큰 건은 **추가개발** 프로젝트로 분리해 계약·매출 트래킹"으로 운영됨.
- 기존 `/systems`(`system`+`system_access`+`@jarvis/secret`+`canResolveSystemSecrets` RBAC)는 TSMT001 구조와 정확히 일치하나, 네이밍이 실무 용어("프로젝트")와 괴리.
- 기존 EHR 원본 메뉴 3개(추가개발관리 / 인력관리 / 프로젝트관리)는 동일 엔티티의 다른 뷰로, 같은 건이 시트마다 재등장함 → 통합 가능.
- dev 단계이므로 이름·스키마를 깨끗하게 정리하는 편이 장기 유지보수에 유리(DB 마이그레이션 비용 수용).

## 2. 결정 요약 (브레인스토밍 합의)

| 결정 | 값 |
|---|---|
| 범위 | 완전 개명 (A-1) — URL + 테이블 + 권한 상수 + i18n 전부 |
| 기존 `/projects` 및 `project`, `project_task`, `project_inquiry`, `project_staff` | **완전 삭제** |
| `system` → `project` | **리네임** |
| `system_access` → `project_access` | **리네임 + `envType` 컬럼 추가** |
| `/projects` 기본 데이터 모델 | **회사당 1 row** (UNIQUE `workspace_id, company_id`), 운영·개발은 `prod_*` / `dev_*` **컬럼 확장** |
| 부가 접속정보 | `project_access` 자식 row (같은 env 중복 row는 access entry로 풀어 저장) |
| 프로젝트 ↔ 추가개발 관계 | **N:1** (추가개발 N건이 1 프로젝트를 참조) |
| 추가개발 도메인 | **단일 엔티티 `additional_development` + 자식 테이블 `*_effort`, `*_revenue`, `*_staff`** |
| 추가개발 URL | **`/add-dev`** |
| UI 리스트 형태 | **테이블 그리드** (카드 제거, 1000건 규모 대비) |
| 구현 방식 | **superpowers:subagent-driven-development** + 빌더는 **claude-sonnet-4-6** |
| 민감정보 저장 | 기존 `@jarvis/secret` ref 방식 + `canResolveSystemSecrets`(→ `canResolveProjectSecrets`) 그대로 유지 |

## 3. TSMT001 데이터 통계 (설계 근거)

- 총 392 rows, 194 distinct `company_cd`
- 회사당 row 분포: 1건 71개 / 2건 76개 / 3건 19개 / 4건 28개
- `(company_cd, env_type)` distinct 306개 → 중복 그룹 86개 (172 row, 44%)
- env 분포: 운영 239 / 개발 153
- connect 분포: VPN 152 / IP 101 / VDI 75 / RE 64

**함의:**
- "회사당 1 row" 정책은 194 project row를 만들지만, 같은 `(company, env)` 중복 172 row는 **`project_access` 자식으로 풀어 저장**해야 정보 손실 없이 수용 가능.
- 기존 `data/infra/records.jsonl`(파싱 완료) + `parse-tsmt001.py` 재사용 가능.

## 4. 최종 스키마

### 4-1. `project` (구 `system`)

```sql
CREATE TABLE project (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspace(id),
  company_id UUID NOT NULL REFERENCES company(id),

  name VARCHAR(300) NOT NULL,
  description TEXT,
  sensitivity VARCHAR(30) NOT NULL DEFAULT 'INTERNAL',
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  owner_id UUID REFERENCES "user"(id),
  knowledge_page_id UUID REFERENCES knowledge_page(id),

  -- 운영 (prod) 대표
  prod_domain_url VARCHAR(500),
  prod_connect_type VARCHAR(20),      -- IP/VPN/VDI/RE
  prod_repository_url VARCHAR(500),
  prod_db_dsn VARCHAR(500),
  prod_src_path TEXT,
  prod_class_path TEXT,
  prod_memo TEXT,

  -- 개발 (dev) 대표
  dev_domain_url VARCHAR(500),
  dev_connect_type VARCHAR(20),
  dev_repository_url VARCHAR(500),
  dev_db_dsn VARCHAR(500),
  dev_src_path TEXT,
  dev_class_path TEXT,
  dev_memo TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (workspace_id, company_id)
);
CREATE INDEX idx_project_knowledge_page ON project(knowledge_page_id);
```

### 4-2. `project_access` (구 `system_access` + `env_type`)

```sql
CREATE TABLE project_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspace(id),
  project_id UUID NOT NULL REFERENCES project(id) ON DELETE CASCADE,

  env_type VARCHAR(10) NOT NULL,              -- 'prod' | 'dev'
  access_type VARCHAR(20) NOT NULL,           -- web/db/vpn/ssh/ftp/rd/api
  label VARCHAR(200) NOT NULL,
  host VARCHAR(500),
  port INTEGER,

  username_ref VARCHAR(500),
  password_ref VARCHAR(500),
  connection_string_ref VARCHAR(500),
  vpn_file_ref VARCHAR(500),

  notes TEXT,
  required_role VARCHAR(50) NOT NULL DEFAULT 'DEVELOPER',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_project_access_project ON project_access(project_id);
```

### 4-3. `additional_development` (신규)

```sql
CREATE TABLE additional_development (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspace(id),
  project_id UUID NOT NULL REFERENCES project(id) ON DELETE RESTRICT,

  -- 요청
  request_year_month VARCHAR(7),              -- '2025-02'
  request_sequence INTEGER,
  requester_name VARCHAR(100),
  request_content TEXT,
  part VARCHAR(20),                           -- Saas/외부/모바일
  status VARCHAR(30) NOT NULL DEFAULT '협의중', -- 협의중/진행중/완료/보류

  -- 프로젝트/계약
  project_name VARCHAR(500),
  contract_number VARCHAR(50),                -- HRS-26-088
  contract_start_month VARCHAR(7),
  contract_end_month VARCHAR(7),
  contract_amount NUMERIC(14,0),
  is_paid BOOLEAN,
  invoice_issued BOOLEAN,
  inspection_confirmed BOOLEAN,
  estimate_progress TEXT,

  -- 개발
  dev_start_date DATE,
  dev_end_date DATE,
  pm_id UUID REFERENCES "user"(id),
  developer_id UUID REFERENCES "user"(id),
  vendor_contact_note TEXT,
  estimated_effort NUMERIC(8,2),
  actual_effort NUMERIC(8,2),

  -- 메타
  attachment_file_ref VARCHAR(500),
  remark TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_add_dev_project ON additional_development(project_id);
CREATE INDEX idx_add_dev_status ON additional_development(status);
CREATE INDEX idx_add_dev_year_month ON additional_development(request_year_month);
```

### 4-4. 자식 테이블 3개

```sql
CREATE TABLE additional_development_effort (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  add_dev_id UUID NOT NULL REFERENCES additional_development(id) ON DELETE CASCADE,
  year_month VARCHAR(7) NOT NULL,
  effort NUMERIC(8,2) NOT NULL,
  UNIQUE (add_dev_id, year_month)
);

CREATE TABLE additional_development_revenue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  add_dev_id UUID NOT NULL REFERENCES additional_development(id) ON DELETE CASCADE,
  year_month VARCHAR(7) NOT NULL,
  amount NUMERIC(14,0) NOT NULL,
  UNIQUE (add_dev_id, year_month)
);

CREATE TABLE additional_development_staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  add_dev_id UUID NOT NULL REFERENCES additional_development(id) ON DELETE CASCADE,
  user_id UUID REFERENCES "user"(id),
  role VARCHAR(50),
  start_date DATE,
  end_date DATE
);
```

## 5. URL / 메뉴 / 권한

### 5-1. URL

| Before | After |
|---|---|
| `/systems` | `/projects` |
| `/systems/new` | `/projects/new` |
| `/systems/[id]` | `/projects/[id]` (탭: overview · access · deploy · runbook · edit · **add-dev(신규)**) |
| `/api/systems*` | `/api/projects*` |
| `/projects` (기존 더미) | **삭제** |
| — | `/add-dev`, `/add-dev/new`, `/add-dev/[id]` (탭: 개요 · 공수 · 매출 · 투입인력) |
| — | `/api/add-dev*` |

### 5-2. 사이드바

```
대시보드 / AI 질문 / 검색 / 위키 / Knowledge
프로젝트              ← /projects (구 systems)
추가개발              ← /add-dev (신규)
근태등록
Admin
```

### 5-3. 권한 상수 (packages/shared/constants/permissions.ts)

| Before | After |
|---|---|
| `SYSTEM_READ/CREATE/UPDATE/DELETE` | `PROJECT_READ/CREATE/UPDATE/DELETE` |
| `SYSTEM_SECRET_REVEAL` (있다면) | `PROJECT_SECRET_REVEAL` |
| `PROJECT_READ/CREATE/UPDATE/DELETE` (기존) | **삭제** 후 `ADDITIONAL_DEV_READ/CREATE/UPDATE/DELETE` 신설 |

### 5-4. i18n (apps/web/messages/ko.json)

- `Systems.*` → **`Projects.*`** (기존 `Projects.*` 네임스페이스는 덮어쓰기 전 제거)
- 신규 네임스페이스 `AdditionalDev.*` 추가 (리스트/상세/탭/폼/상태 라벨)

## 6. UI 설계

### 6-1. `/projects` 리스트 (테이블 그리드)

- 컬럼: 회사코드 / 회사명 / 시스템명 / 운영 URL / 개발 URL / 상태 / 민감도 / 담당자 / 업데이트일
- 검색: q(name/description/company_code/company_name 부분일치)
- 필터: status(active/deprecated/decommissioned), connect_type(IP/VPN/VDI/RE), has_dev(개발환경 보유)
- 정렬: 모든 컬럼
- 페이징: 50/100건 단위
- 액션: "새 프로젝트" 버튼 (권한: `PROJECT_CREATE`)
- `SystemCard.tsx` 컴포넌트 삭제, 신규 `ProjectTable.tsx` 생성

### 6-2. `/projects/[id]` 상세 탭

```
[overview] [access] [deploy] [runbook] [add-dev] [edit]
```
- overview: 기존 필드 + `prod_*` / `dev_*` 2컬럼 카드
- access: 기존 `AccessPanel` 재사용, `envType` 필터 추가 (prod/dev 탭)
- add-dev (신규): 이 프로젝트에 달린 `additional_development` 리스트, 신규 추가 버튼

### 6-3. `/add-dev` 리스트

- 컬럼: 요청년월 / 프로젝트명 / 대상 프로젝트(회사명) / 파트 / 진행상태 / 계약금액 / PM / 개발자 / 계약기간
- 검색: q(project_name/request_content)
- 필터: status, part, 대상 project(회사 선택), 요청년월 range
- 정렬: 모든 컬럼

### 6-4. `/add-dev/[id]` 상세 탭

```
[overview] [effort] [revenue] [staff] [edit]
```
- overview: 요청·계약·개발 섹션 카드 + status 배지
- effort: 월별 공수 히트맵 (테이블 형태, 12개월 × 년도)
- revenue: 월별 매출 히트맵 (테이블 형태)
- staff: 투입인력 리스트 (user + role + 기간)

## 7. 데이터 마이그레이션

### 7-1. 기존 더미 삭제

- `project` 3건, `project_task`, `project_inquiry`, `project_staff` 전부 삭제 (테이블 drop 포함)
- `system` seed 4건 (PostgreSQL/MinIO/PG Search/OpenAI) → rename 후 drop (더미라 승격 안 함)

### 7-2. TSMT001 → `project` + `project_access`

**입력**: `data/infra/records.jsonl` (392 rows, 이미 파싱됨)

**로직** (신규 스크립트 `scripts/migrate-tsmt001-to-project.ts`):
1. `(company_cd)`로 grouping → 194개 project 후보
2. 각 그룹 내 row들을 `env_type`으로 다시 grouping
3. 각 `(company, env)` 그룹의 **첫 row**(가장 정보 풍부한 것 선정 규칙: memo 길이 + 비null 필드 수) → `project.{prod|dev}_*` 컬럼 채움
4. 같은 `(company, env)`의 **2번째+ row**들 → `project_access` 자식 row로 변환:
   - `env_type`: 해당 env
   - `access_type`: URL이면 `web`, DB 정보 있으면 `db`, VPN이면 `vpn`, 기타 `api`
   - username/password는 원본 `login_info` split → `username_ref`/`password_ref`(평문 그대로, 기존 파이프라인 결정에 맞춤)
   - connection_string_ref: `db_connect_info`
   - vpn_file_ref: `vpn_file_seq`
   - notes: `src_info` + `class_info` + `memo` concat
5. `company` 테이블에 해당 `company_cd`가 없으면 upsert 생성 (`code`, `name`)

### 7-3. 엑셀 → `additional_development` + 자식 테이블

**입력**: `추가개발/*.xls` 5개 시트

**로직** (신규 `scripts/migrate-add-dev-from-xls.ts`, `xlrd` 대신 Node `xlsx` 사용):
1. **추가개발관리_1번시트** (요청 목록) → `additional_development` 본체 생성
   - 키: `(요청회사, 요청년월, 요청순번)`
2. **추가개발프로젝트관리** → 같은 키(프로젝트명+요청회사)로 매칭 후 `contract_*`/`project_name`/`contract_number`/`inspection_confirmed` 필드 채움
3. **추가개발인력관리_1번시트** → 매칭 후 `pm_id`/`developer_id`/`dev_start_date`/`dev_end_date` + `additional_development_staff` 자식
4. **추가개발관리_2번시트** (월별 공수) → `additional_development_effort` 자식 row들
5. **추가개발인력관리_2번시트** (월별 매출) → `additional_development_revenue` 자식 row들
6. `project_id` 매칭: `company` 테이블의 `code` 또는 `name`으로 lookup. 매칭 실패 건은 CSV로 리포트 (수동 해결)

## 8. Phase 구성 (subagent-driven-development)

각 Phase는 독립 builder 에이전트(sonnet)에게 디스패치. 의존성 있는 Phase끼리는 순차, 없는 것은 병렬.

| Phase | 내용 | 의존 | 병렬 가능 |
|---|---|---|---|
| **P0** | 기존 `/projects` 도메인 완전 삭제 (DB drop + 라우트/컴포넌트/i18n/테스트/권한 상수) | — | — |
| **P1-A** | `system → project` 테이블·인덱스·FK 리네임 마이그레이션 + `prod_*`/`dev_*` 컬럼 + UNIQUE 제약 | P0 | P1-B와 병렬 |
| **P1-B** | `SYSTEM_* → PROJECT_*` 권한 상수 리네임 + i18n `Systems → Projects` | P0 | P1-A와 병렬 |
| **P2-A** | `system_access → project_access` 리네임 + `env_type` 컬럼 | P1-A | P2-B와 병렬 |
| **P2-B** | `additional_development` + 자식 3테이블 스키마 + 권한 상수 + i18n | P1-B | P2-A와 병렬 |
| **P3-A** | `/projects` 라우트·쿼리·API·UI (리스트 그리드 전환 + 상세 탭 **스켈레톤**, `/systems → /projects` redirect) | P2-A | P3-B와 병렬 |
| **P3-B** | `/add-dev` 라우트·쿼리·API·UI (리스트 + 상세 탭 + 폼) | P2-B | P3-A와 병렬 |
| **P4-A** | TSMT001 → `project`+`project_access` 마이그 스크립트 작성 + 실행 + 검증 | P3-A | P4-B와 병렬 |
| **P4-B** | 엑셀 → `additional_development`+자식 마이그 스크립트 + 실행 + 검증 | P3-B | P4-A와 병렬 |
| **P5** | `/projects/[id]` 상세 "add-dev" 탭 **실제 데이터 연결**(P3-B에서 만든 API 호출) + e2e 통합 테스트 | P4-A + P4-B | — |
| **P6** | Integrator 검증 (권한/sensitivity/i18n/type/lint/e2e smoke) + Opus 최종 리뷰 | P5 | — |

**전체 순서**: P0 → (P1-A ∥ P1-B) → (P2-A ∥ P2-B) → (P3-A ∥ P3-B) → (P4-A ∥ P4-B) → P5 → P6

## 9. 검증 게이트

| Gate | 시점 | 조건 | 실패 시 |
|---|---|---|---|
| G-rename-1 | P1 완료 후 | `grep -r "system"` in src code hits 0 (외부 위키 plan 문서는 예외) | 누락 파일 보강 |
| G-schema-1 | P2 완료 후 | `drizzle-kit generate` diff clean, `pnpm tsc` 통과 | 스키마 정합성 수정 |
| G-ui-1 | P3 완료 후 | `pnpm test` 그린 + `pnpm lint` 그린 + dev 서버에서 `/projects`, `/add-dev` 404 없이 렌더 | UI 수정 |
| G-migrate-1 | P4 완료 후 | `project` count ≥ 194, `additional_development` count = 엑셀 행 수 ± 허용범위, 고아 FK 0 | 매핑 리포트 확인 후 재실행 |
| G-final | P6 | 전체 e2e smoke: `/projects/[id]/add-dev` 탭에서 관련 건 조회 가능, secret ref 해결, RBAC 적용, TypeScript 에러 0 | Opus critic 피드백 반영 |

## 10. 리스크 & 완화

| 리스크 | 영향 | 완화 |
|---|---|---|
| `system`/`Systems` 단어가 위키 infra 플랜(`docs/plan/2026-04-17-tsmt001-infra-pipeline.md`)·위키 markdown 파일에 박혀 있음 | 검색/참조 깨짐 | **문서·위키는 건드리지 않음**. 코드만 리네임. CLAUDE.md에 "DB 테이블 `project` ↔ TSMT001 infra plan의 `system` 용어" 매핑 표 추가 |
| TSMT001의 같은 `(company, env)` 중복 row 정보 손실 | 데이터 누락 | "첫 row=대표, 나머지=access 자식" 규칙 + 마이그레이션 리포트 CSV로 모든 row 추적 |
| 엑셀 매칭 실패 (회사명 표기 불일치 등) | `additional_development` row 생성 실패 | 매칭 실패 CSV 리포트 → 수동 `company_code` 대응표 후 재실행 |
| 기존 `/systems` URL 즉시 단절 | 북마크·외부 링크 | rename 이후 한 마일스톤 동안 `/systems/*` → `/projects/*` 301 redirect 라우트 추가 (P3-A에 포함) |
| `canResolveSystemSecrets` 등 RBAC 헬퍼 이름 | 참조 깨짐 | P1-B에서 헬퍼 리네임 포함(`canResolveProjectSecrets`) |

## 11. 비범위 (이번 설계에서 다루지 않음)

- TSMT001 → wiki markdown 파이프라인(`docs/plan/2026-04-17-tsmt001-infra-pipeline.md`)과의 이중 경로 정합성 재설계 — 기존 파이프라인은 그대로 둠.
- `project`/`add-dev` 대시보드 집계 화면 (월별 매출 합계 등) — 본 설계는 CRUD + 리스트/상세까지만.
- 추가개발 요청 승인 워크플로(결재) — 상태 컬럼만 두고, 결재 연동은 후속 PR.
- Next-intl 번역 영문 버전 — 한국어만 우선, 영문은 후속.

## 12. 관련 파일

- 스키마: `packages/db/schema/{system,project}.ts` (리네임 대상)
- 쿼리: `apps/web/lib/queries/{systems,projects}.ts` (리네임 대상)
- 라우트: `apps/web/app/(app)/{systems,projects}/**`, `apps/web/app/api/{systems,projects}/**`
- 권한: `packages/shared/constants/permissions.ts`, `packages/auth/rbac.ts`
- i18n: `apps/web/messages/ko.json`
- 마이그 스크립트 (신규): `scripts/migrate-tsmt001-to-project.ts`, `scripts/migrate-add-dev-from-xls.ts`
- 원본 데이터: `TSMT001.sql`, `data/infra/records.jsonl`, `추가개발/*.xls`
