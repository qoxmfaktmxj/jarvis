# Jarvis - Enterprise Internal Portal & Knowledge Platform

**Date:** 2026-04-07
**Author:** Principal Architect + Product-minded Staff Engineer
**Status:** Design Spec (Pending Implementation Plan)
**Legacy:** `qoxmfaktmxj/ssms` (Spring Boot 2.7.18 / Vue 3 / Oracle 11g XE)
**Target:** Big-bang cutover, 5000-user enterprise deployment

---

## Table of Contents

1. [Assumptions](#1-assumptions)
2. [Current Legacy Inventory](#2-current-legacy-inventory)
3. [Pain Points / Why Rewrite](#3-pain-points--why-rewrite)
4. [Product Vision](#4-product-vision)
5. [Bounded Contexts](#5-bounded-contexts)
6. [Domain Model](#6-domain-model)
7. [Target Architecture](#7-target-architecture)
8. [Monorepo Folder Structure](#8-monorepo-folder-structure)
9. [App Route Tree](#9-app-route-tree)
10. [Screen IA](#10-screen-ia)
11. [DB Schema / ERD](#11-db-schema--erd)
12. [API Contracts](#12-api-contracts)
13. [Search Design](#13-search-design)
14. [Knowledge Page Taxonomy](#14-knowledge-page-taxonomy)
15. [Secret Management Design](#15-secret-management-design)
16. [RBAC / ABAC Design](#16-rbac--abac-design)
17. [Draft / Review / Publish Flow](#17-draft--review--publish-flow)
18. [Background Job Design](#18-background-job-design)
19. [Raw Source Ingestion Flow](#19-raw-source-ingestion-flow)
20. [Ask AI Flow](#20-ask-ai-flow)
21. [Audit / Logging / Observability](#21-audit--logging--observability)
22. [Testing Strategy](#22-testing-strategy)
23. [Data Migration Strategy](#23-data-migration-strategy)
24. [Cutover Plan](#24-cutover-plan)
25. [MVP Scope](#25-mvp-scope)
26. [Phase 2 Scope](#26-phase-2-scope)
27. [Final State](#27-final-state)
28. [Risks / Unknowns / Open Questions](#28-risks--unknowns--open-questions)
29. [ADRs](#29-adrs)
30. [Product Name & Repo Slug Suggestions](#30-product-name--repo-slug-suggestions)

---

## 1. Assumptions

| # | Assumption | Impact if wrong |
|---|-----------|----------------|
| A1 | 5000명 규모 기업에 납품하는 SaaS-like 제품. 멀티테넌트(workspace_id) 격리 필요 | 단일 테넌트면 workspace 테이블과 모든 FK 제거 가능 |
| A2 | 온프레미스 Docker Compose 배포. Kubernetes는 Phase 2 이후 | K8s 필수면 Helm chart + HPA 설계 추가 |
| A3 | PostgreSQL FTS + pgvector + pg_trgm으로 시작. OpenSearch는 search adapter 추상화 뒤에 숨겨 Final에서 교체 | 초기부터 OpenSearch 필수면 Docker 서비스 추가 + 동기화 로직 필요 |
| A4 | 사내 SSO (OIDC/SAML) 제공. 구체적 IdP는 Keycloak/Azure AD/Okta 중 하나 | 자체 인증이면 password hashing + MFA 직접 구현 필요 |
| A5 | LLM은 외부 API (Claude/OpenAI). 자체 모델 서빙 없음 | 자체 모델이면 Python worker + GPU infra 추가 |
| A6 | 1명 개발자 + AI 에이전트 다수 병렬 투입. 1주 스프린트 | 팀 다수면 git branching/PR 전략 변경 |
| A7 | 레거시 Oracle 데이터는 이관 대상. 양은 수만~수십만 건 수준 | 수억 건이면 batch migration + ETL pipeline 필요 |
| A8 | 파일 첨부는 MinIO (S3 호환). 레거시 로컬 디스크 파일은 MinIO로 이관 | 기존 NAS/SAN 유지면 storage adapter 변경 |
| A9 | 한국어가 주 언어. 검색/FTS는 한국어 형태소 분석 고려 필요 | 영어만이면 PG default parser 충분 |
| A10 | Redis를 세션 스토어 + 캐시로 사용. pg-boss는 PostgreSQL 기반 유지 | Redis 없이 가면 세션을 JWT stateless로 처리 |
| A11 | secret manager는 초기에는 SOPS + .env 암호화. Vault는 Phase 2 | Vault 필수면 초기 Docker에 Vault 서비스 추가 |
| A12 | 모바일은 반응형 웹 (PWA 여지). 네이티브 앱 없음 | 네이티브 필요시 React Native 별도 앱 |

**Phase 표시 규칙:**
- **[MVP]** = 1주 스프린트에 포함
- **[P2]** = Phase 2 (MVP 이후 1-2개월)
- **[Final]** = 완성형 (3개월+)

---

## 2. Current Legacy Inventory

### 2.1 Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Backend | Spring Boot | 2.7.18 |
| Language | Java | 1.8 |
| Build | Gradle | - |
| ORM | MyBatis | XML mapper |
| DB | Oracle | 11g XE |
| Frontend | Vue.js | 3.5.13 |
| UI Library | PrimeVue | 4.3.2 |
| Build Tool | Vite | 6.1.0 |
| State | Pinia | - |
| CSS | Tailwind + PrimeFlex | - |
| Auth | JWT (cookie) | Custom |
| CI/CD | Jenkins | Pipeline |

### 2.2 Backend Domain Controllers (87+ endpoints)

| Domain | Controller | Prefix | Endpoints | Purpose |
|--------|-----------|--------|-----------|---------|
| common | LoginController | `/api/auth` | 3 | JWT login/refresh/logout |
| common | FileController | `/api/file` | 7 | File upload/download/delete |
| common | CommonController | `/api/common` | 1 | Company list |
| system | MenuController | `/api/menu` | 5 | Menu CRUD + tree |
| system | UserInfoController | `/api/user` | 6 | User CRUD + reset password |
| system | CodeController | `/api/code` | 6 | Code master + cache |
| system | QuickMenuController | `/api/quick-menu` | 3+ | Quick menu |
| develop | DevelopProjectController | `/api/develop/project` | 4 | Project CRUD |
| develop | DevelopManagementController | `/api/develop/management` | 5 | Dev request management |
| develop | DevelopInquiryController | `/api/develop/inquiry` | 4 | Inquiry CRUD |
| develop | DevelopStaffController | `/api/develop/staff` | 3+ | Staff assignment |
| manage | CompanyController | `/api/company` | 4 | Company CRUD |
| manage | AttendanceController | `/api/attendance` | 4 | Attendance CRUD |
| manage | OutManageController | `/api/out-manage` | 9 | Out-of-office + time details |
| manage | InfraManagementController | `/api/infra/management` | 8 | Infra management |
| manage | InfraPageController | `/api/infra/page` | 3+ | Infra page content |
| manage | ManagerStatusController | `/api/manager-status` | 3+ | Manager status |

### 2.3 Frontend Page Inventory (32 Vue pages)

| Category | Page | Route | Maps to Jarvis |
|----------|------|-------|---------------|
| Auth | Login.vue | `/login` | `(auth)/login` |
| Auth | NotFound.vue | `/pages/notfound` | Not found handler |
| Auth | Access.vue | `/auth/access` | RBAC denied |
| Auth | Error.vue | `/auth/error` | Error boundary |
| Develop | DevelopProject.vue | dynamic | `projects/` |
| Develop | DevelopManagement.vue | dynamic | `projects/[id]/tasks` |
| Develop | DevelopInquiry.vue | dynamic | `projects/[id]/inquiries` |
| Develop | DevelopStaff.vue | dynamic | `projects/[id]/staff` |
| Manage | Company.vue | dynamic | `admin/companies` |
| Manage | Attendance.vue | dynamic | `attendance/` |
| Manage | OutManage.vue | dynamic | `attendance/out-manage` |
| Manage | OutManageTime.vue | dynamic | (merged into out-manage) |
| Manage | InfraManagement.vue | dynamic | `systems/` |
| Manage | InfraPage.vue | dynamic | `systems/[id]` |
| Manage | InfraConfig.vue | dynamic | `systems/[id]/access` |
| Manage | InfraTable.vue | dynamic | (component) |
| Manage | InfraInfoTabs.vue | dynamic | (component) |
| Manage | ManagerStatus.vue | dynamic | `dashboard` widget |
| Manage | CompanyVisit.vue | dynamic | `attendance/out-manage` |
| Manage | PreAction.vue | dynamic | (merged) |
| Manage | HrManager.vue | dynamic | `knowledge/hr` |
| Manage | MonthlyReport.vue | dynamic | `dashboard` widget |
| System | User.vue | dynamic | `admin/users` |
| System | Menu.vue | dynamic | `admin/menus` |
| System | Code.vue | dynamic | `admin/codes` |
| System | Log.vue | dynamic | `admin/audit` |
| System | QuickMenu.vue | dynamic | `profile` |
| System | UserApproval.vue | dynamic | `admin/review-queue` |
| System | Org.vue | dynamic | `admin/organizations` |
| Common | DailyTask.vue | dynamic | `dashboard` widget |
| Common | Discussion.vue | dynamic | [P2] Discussion feature |
| - | Dashboard.vue | `/` | `dashboard` |
| - | UserProfile.vue | hardcoded | `profile` |

### 2.4 Database Tables (Oracle)

| Table | Primary Key | Purpose | Record est. |
|-------|------------|---------|-------------|
| TSYS305_NEW | ENTER_CD + SABUN | Users | ~5000 |
| TSYS301_NEW | ENTER_CD + MENU_ID | Menus | ~100 |
| TSYS005_NEW | ENTER_CD + GRCODE_CD + CODE | Code master | ~2000 |
| TCOM_FILE | ENTER_CD + FILE_SEQ | File attachments | ~10000 |
| TCOM_COMPANY | ENTER_CD + COMPANY_CD + OBJECT_DIV | Companies | ~500 |
| TDEV_PROJECT | ENTER_CD + PROJECT_ID | Projects | ~200 |
| TDEV_MANAGE | ENTER_CD + REQUEST_COMPANY_CD + REQUEST_YM + REQUEST_SEQ | Dev requests | ~5000 |
| TDEV_INQUIRY | ENTER_CD + IN_SEQ | Inquiries | ~1000 |
| TDEV_STAFF | ENTER_CD + NO | Staff assignments | ~2000 |
| TMAN_ATTENDANCE | ENTER_CD + SEQ | Attendance | ~50000 |
| TMAN_OUTMANAGE | ENTER_CD + SABUN | Out management | ~10000 |
| TMAN_OUTMANAGE_TIME | ENTER_CD + SABUN + CHKDATE | Time details | ~30000 |
| TMAN_INFRA_MANAGE | ENTER_CD + SEQ | Infra management | ~500 |
| TMAN_INFRA_PAGE | ENTER_CD + SEQ | Infra pages | ~200 |
| TSYS_LOG | LOG_ID (auto) | System logs | ~100000+ |

### 2.5 Key Identifier Mapping

| Legacy ID | Type | Business Meaning | Jarvis Mapping |
|-----------|------|-----------------|----------------|
| enterCd | varchar | Tenant/company boundary | `workspace.code` |
| sabun | varchar | Employee number | `user.employee_id` |
| roleCd | varchar | Role code | `role.code` |
| orgCd/orgNm | varchar | Organization | `organization.code/name` |
| fileSeq | int | Attachment link | `raw_source.id` → `attachment.id` |
| chkdate | date | Last modified timestamp | `updated_at` (timestamptz) |
| chkid | varchar | Last modified by | `updated_by` (FK → user) or trigger |
| menuId | long | Menu item | `menu_item.id` |
| parentMenuId | long | Menu hierarchy | `menu_item.parent_id` |
| grcodeCd | varchar | Code group | `code_group.code` |
| projectId | int | Project | `project.id` |
| requestSeq | long | Request sequence | `project_task.request_seq` |
| inSeq | int | Inquiry sequence | `project_inquiry.id` |
| taskGubunCd | varchar | Infra task category | `system.category` |
| devGbCd | varchar | Dev/Prod environment | `system.environment` |

---

## 3. Pain Points / Why Rewrite

| # | Pain Point | Severity | Evidence |
|---|-----------|----------|----------|
| P1 | **Credentials in DB** - InfraManagement에 DB 접속정보, VPN 파일, 비밀번호가 평문 저장 | Critical | `loginInfo`, `dbConnectInfo`, `dbUserInfo`, `vpnFileSeq` 필드 |
| P2 | **Dynamic routing via DB** - `/menu/tree`로 route/component path를 런타임 조립. 테스트 불가, 권한 검증 어려움 | High | `router/index.js`의 `import.meta.glob()` 동적 import |
| P3 | **Java 8 EOL** - 2019년 이후 public updates 종료. 보안 패치 없음 | High | `build.gradle`의 `sourceCompatibility = '1.8'` |
| P4 | **Oracle 11g XE** - 2021년 extended support 종료. 라이선스 비용, 제한된 기능 | High | `application.yml`의 `@localhost:1521:xe` |
| P5 | **JWT secret in config** - 서명 키가 `application.yml`에 평문 | Critical | `jwt.secret` 필드 |
| P6 | **No knowledge management** - 사내 지식이 구조화되지 않음. 위키/검색/AI 없음 | High | 기능 자체가 없음 |
| P7 | **No audit trail** - SystemLog는 있지만 minimal (action type + URL만) | Medium | `SystemLog.java` - details 없음 |
| P8 | **No review workflow** - 민감 문서(접속정보, HR)에 승인 절차 없음 | High | 직접 CRUD만 존재 |
| P9 | **Composite PK everywhere** - `enterCd + sabun + ...` 조합. JOIN 복잡, FK 관리 어려움 | Medium | 모든 테이블이 composite PK |
| P10 | **No search** - 전체 검색 기능 없음. 각 목록 페이지의 필터만 존재 | High | 검색 API 없음 |
| P11 | **File on local disk** - 파일이 서버 로컬 디스크 저장. 스케일 불가, 백업 어려움 | Medium | `file.upload.path: C:\Users\kimjh0417` |
| P12 | **No mobile support** - 반응형 부분적. 모바일 전용 뷰 없음 | Medium | PrimeVue desktop-first |
| P13 | **CORS 단일 origin** - 프론트 origin 하나만 허용. 모바일/다른 클라이언트 불가 | Low | `spring.frontend.url` 단일값 |
| P14 | **No i18n** - 한국어 하드코딩 | Low | 코드 전반 |

---

## 4. Product Vision

**한 줄 정의:** Jarvis는 사내 업무 포털 + 프로젝트 관리 + compiled knowledge wiki + grounded AI assistant를 하나의 제품으로 통합한 엔터프라이즈 인트라넷 플랫폼이다.

**핵심 가치:**
1. **Single source of truth** - 모든 사내 지식이 한 곳에서 검색 가능
2. **Grounded AI** - AI 답변은 반드시 원천 문서 근거와 함께 제공
3. **Security by design** - 비밀값은 절대 본문에 저장하지 않음 (secret_ref only)
4. **Wiki-first** - 정보는 버전 관리되는 knowledge page로 관리
5. **Draft/Review governance** - 민감 문서는 반드시 승인 후 게시

**대상 사용자:**
| Role | Needs | Jarvis Feature |
|------|-------|---------------|
| 일반 직원 | 사내 정보 검색, 온보딩, HR 문서 | Search, Knowledge, Ask AI |
| 개발자 | 시스템 접속정보, 배포 가이드, 프로젝트 관리 | Systems, Runbooks, Projects |
| PM/관리자 | 프로젝트 현황, 인력 배치, 보고서 | Dashboard, Projects, Reports |
| HR/총무 | 인사 문서 관리, 근태 관리 | HR docs, Attendance |
| 관리자 | 사용자/권한 관리, 감사 로그, 검색 품질 | Admin panel |

---

## 5. Bounded Contexts

```
┌─────────────────────────────────────────────────────────────────┐
│                        Jarvis Product                           │
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │
│  │   Identity   │  │  Project    │  │  Knowledge  │            │
│  │   & Access   │  │  Management │  │  Platform   │            │
│  │             │  │             │  │             │            │
│  │  - User     │  │  - Project  │  │  - Page     │            │
│  │  - Org      │  │  - Task     │  │  - Version  │            │
│  │  - Role     │  │  - Inquiry  │  │  - Claim    │            │
│  │  - Session  │  │  - Staff    │  │  - Source   │            │
│  │  - SSO      │  │  - Company  │  │  - MDX      │            │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘            │
│         │                │                │                    │
│  ┌──────┴──────┐  ┌──────┴──────┐  ┌──────┴──────┐            │
│  │   System    │  │  HR &       │  │  Search &   │            │
│  │   & Infra   │  │  Attendance │  │  AI         │            │
│  │             │  │             │  │             │            │
│  │  - System   │  │  - Leave    │  │  - FTS      │            │
│  │  - Access   │  │  - OutMgmt  │  │  - Vector   │            │
│  │  - Runbook  │  │  - HR Policy│  │  - Hybrid   │            │
│  │  - Deploy   │  │             │  │  - Ask AI   │            │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘            │
│         │                │                │                    │
│  ┌──────┴────────────────┴────────────────┴──────┐             │
│  │              Governance & Ops                  │             │
│  │  - Audit log  - Review/Approval  - Freshness  │             │
│  │  - Secret ref - Menu config      - Observability│            │
│  └────────────────────────────────────────────────┘             │
└─────────────────────────────────────────────────────────────────┘
```

| Bounded Context | Core Entities | Phase |
|----------------|--------------|-------|
| Identity & Access | workspace, user, organization, role, permission, session | [MVP] |
| Project Management | project, project_task, project_inquiry, project_staff, company | [MVP] |
| Knowledge Platform | knowledge_page, page_version, claim, raw_source, attachment | [MVP] |
| System & Infra | system, system_access, deploy guide, runbook | [MVP] |
| HR & Attendance | attendance, out_manage, HR policy pages | [MVP] |
| Search & AI | search index, synonym, embedding, ask AI, search log | [MVP] |
| Governance & Ops | audit_log, review_request, menu_item, code_master, freshness | [MVP] |

---

## 6. Domain Model

### 6.1 Entity Relationship Overview

```
workspace ─────────< organization ─────────< user
    │                                         │
    │                                    user_role >───── role ─────< role_permission >───── permission
    │                                         │
    ├──< project ─────< project_task          │
    │       │          project_inquiry        │
    │       │          project_staff >─────────┘
    │       └──< attachment >──── raw_source
    │
    ├──< system ─────< system_access
    │
    ├──< knowledge_page ─────< knowledge_page_version
    │       │                  knowledge_claim >──── raw_source
    │       │                  knowledge_page_owner >── user
    │       │                  knowledge_page_tag
    │       └──< review_request
    │
    ├──< attendance
    ├──< out_manage ─────< out_manage_detail
    │
    ├──< company
    ├──< code_group ─────< code_item
    ├──< menu_item (self-referential)
    │
    ├──< search_log
    ├──< search_synonym
    ├──< popular_search
    │
    └──< audit_log
```

### 6.2 Aggregate Boundaries

| Aggregate Root | Children | Invariants |
|---------------|----------|-----------|
| `workspace` | orgs, users, menus, codes | tenant isolation boundary |
| `project` | tasks, inquiries, staff, attachments | project lifecycle |
| `knowledge_page` | versions, claims, owners, tags, reviews | version consistency, review state |
| `system` | system_access entries | access info + secret_ref integrity |
| `user` | user_roles | role assignment consistency |
| `out_manage` | out_manage_details | parent-child time records |

---

## 7. Target Architecture

### 7.1 System Architecture Diagram

```
                              ┌──────────────────┐
                              │   Load Balancer   │
                              │   (nginx/traefik) │
                              └────────┬─────────┘
                                       │
                    ┌──────────────────▼──────────────────┐
                    │         Next.js App Router           │
                    │         (apps/web)                    │
                    │                                      │
                    │  ┌──────────┐ ┌──────────┐ ┌──────┐ │
                    │  │  Server  │ │  Route   │ │Server│ │
                    │  │Components│ │ Handlers │ │Action│ │
                    │  └──────────┘ └──────────┘ └──────┘ │
                    │                                      │
                    │  ┌──────────┐ ┌──────────┐ ┌──────┐ │
                    │  │   RBAC   │ │   MDX    │ │ SSO  │ │
                    │  │Middleware│ │ Renderer │ │Client│ │
                    │  └──────────┘ └──────────┘ └──────┘ │
                    └───┬────────┬────────┬────────┬──────┘
                        │        │        │        │
          ┌─────────────┘        │        │        └───────────┐
          ▼                      ▼        ▼                    ▼
┌──────────────────┐   ┌────────────┐ ┌─────────┐   ┌──────────────┐
│   PostgreSQL 16  │   │  pg-boss   │ │  MinIO  │   │  Corp SSO    │
│                  │   │  Worker    │ │         │   │  (OIDC/SAML) │
│  Transactional   │   │  (apps/    │ │  Raw    │   └──────────────┘
│  Knowledge pages │   │   worker)  │ │  files  │
│  pgvector        │   │            │ │  Attach │
│  pg_trgm         │   │  - ingest  │ └─────────┘
│  tsvector/FTS    │   │  - compile │
│  Audit logs      │   │  - embed   │
│  Job queue       │   │  - stale   │
│  (pg-boss)       │   │  - digest  │
└──────────────────┘   └────────────┘
          │
┌─────────▼────────┐   ┌──────────────────┐
│     Redis 7      │   │  Secret Manager  │
│                  │   │  (SOPS/.env)     │
│  Session store   │   │                  │
│  Code cache      │   │  → Vault [P2]    │
│  Rate limiting   │   └──────────────────┘
└──────────────────┘
                        ┌──────────────────┐
                        │  LLM Gateway     │
                        │  (Claude API)    │
                        └──────────────────┘
```

### 7.2 Docker Compose Services [MVP]

```yaml
# docker-compose.yml (production)
services:
  web:
    build: { context: ., dockerfile: docker/Dockerfile.web }
    ports: ["3000:3000"]
    env_file: .env
    depends_on: [postgres, redis, minio]
    restart: unless-stopped

  worker:
    build: { context: ., dockerfile: docker/Dockerfile.worker }
    env_file: .env
    depends_on: [postgres, minio, redis]
    restart: unless-stopped

  postgres:
    image: pgvector/pgvector:pg16
    volumes: ["pgdata:/var/lib/postgresql/data", "./docker/init-db:/docker-entrypoint-initdb.d"]
    environment:
      POSTGRES_DB: jarvis
      POSTGRES_USER: jarvis
      POSTGRES_PASSWORD_FILE: /run/secrets/pg_password
    ports: ["5432:5432"]
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    volumes: ["redisdata:/data"]
    ports: ["6379:6379"]
    restart: unless-stopped

  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    volumes: ["miniodata:/data"]
    ports: ["9000:9000", "9001:9001"]
    environment:
      MINIO_ROOT_USER_FILE: /run/secrets/minio_user
      MINIO_ROOT_PASSWORD_FILE: /run/secrets/minio_password
    restart: unless-stopped

volumes:
  pgdata:
  redisdata:
  miniodata:
```

### 7.3 Tech Stack Decision Matrix

| Concern | Choice | Why this over alternatives |
|---------|--------|--------------------------|
| Runtime | Next.js App Router | SSR + API + MDX in one process. Remix는 MDX 지원 약함. SvelteKit은 생태계 작음 |
| Language | TypeScript | 프론트/백엔드 타입 공유. Java/Python 런타임 분리 제거 |
| DB | PostgreSQL 16 | FTS + pgvector + pg_trgm 내장. Oracle 대비 라이선스 프리, 기능 우위 |
| ORM | Drizzle | Type-safe, zero-overhead SQL. Prisma 대비 raw SQL 접근 용이, migration 제어 가능 |
| Search | PG FTS + pgvector | 별도 서비스 불필요. 5000명 + 10만 문서 규모에서 충분. 추상화 뒤에 숨겨 OpenSearch 교체 가능 |
| Job Queue | pg-boss | PostgreSQL 기반 exactly-once. BullMQ는 Redis 의존, 별도 서비스 |
| Object Storage | MinIO | S3 호환, 온프레미스, 단일 바이너리. Ceph는 과잉 |
| UI | shadcn/ui + Tailwind | 커스텀 자유도 높음, 번들 최소. PrimeVue/MUI 대비 가벼움 |
| Table | TanStack Table | Headless, 서버 사이드 페이지네이션/정렬 지원. AG Grid는 라이선스 비용 |
| Form | React Hook Form + Zod | Uncontrolled for performance. Formik 대비 리렌더 최소 |
| Monorepo | pnpm + Turborepo | Fast install, strict hoisting, parallel build. Nx는 설정 무거움 |
| Test | Vitest + Playwright | Vitest는 Vite 네이티브. Jest 대비 빠름. Playwright는 cross-browser |
| Observability | OpenTelemetry | Vendor-neutral. Next.js 공식 지원 |
| Deploy | Docker Compose | 온프레미스 단일 서버. K8s는 과잉 (Phase 2) |

---

## 8. Monorepo Folder Structure

```
jarvis/
├── apps/
│   ├── web/                          # Next.js App Router
│   │   ├── app/                      # File-system routes (Section 9)
│   │   ├── components/
│   │   │   ├── ui/                   # shadcn/ui primitives (Button, Input, Dialog, etc.)
│   │   │   ├── layout/              # AppShell, Sidebar, Topbar, MobileNav, Breadcrumb
│   │   │   ├── dashboard/           # StatCard, RecentActivity, QuickLinks, ChartWidget
│   │   │   ├── knowledge/           # PageEditor, PageViewer, VersionDiff, ReviewPanel
│   │   │   ├── project/             # ProjectForm, TaskTable, StaffTable, InquiryTable
│   │   │   ├── system/              # SystemCard, AccessPanel, RunbookViewer
│   │   │   ├── search/              # SearchBar, FilterPanel, ResultCard, Highlight, Facets
│   │   │   ├── ai/                  # AskPanel, SourceRefCard, ClaimBadge
│   │   │   ├── attendance/          # AttendanceTable, OutManageForm, TimeDetailSheet
│   │   │   └── admin/               # UserTable, OrgTree, MenuEditor, CodeTable, AuditTable
│   │   ├── lib/
│   │   │   ├── auth/                # SSO helpers, session cookie, middleware
│   │   │   ├── search/              # Client-side search query builder
│   │   │   ├── ai/                  # Ask AI client hooks
│   │   │   ├── upload/              # File upload with presigned URL
│   │   │   └── utils/               # Date format, number format, etc.
│   │   ├── hooks/                   # useSearch, useDebounce, useInfiniteScroll, etc.
│   │   ├── styles/
│   │   │   ├── globals.css          # Tailwind base + custom tokens
│   │   │   └── mdx.css              # Knowledge page MDX styling
│   │   ├── public/                  # Static assets
│   │   ├── middleware.ts            # Auth + RBAC + workspace routing
│   │   ├── next.config.ts
│   │   ├── tailwind.config.ts
│   │   └── package.json
│   │
│   └── worker/                      # pg-boss worker process
│       ├── jobs/
│       │   ├── ingest.ts            # Raw source → parsed content
│       │   ├── compile.ts           # Sources → compiled wiki page
│       │   ├── embed.ts             # Content → pgvector embeddings
│       │   ├── stale-check.ts       # Freshness SLA enforcement
│       │   ├── digest.ts            # Change digest generation [P2]
│       │   └── index-sync.ts        # PG → OpenSearch sync [Final]
│       ├── index.ts                 # Worker bootstrap + pg-boss init
│       ├── tsconfig.json
│       └── package.json
│
├── packages/
│   ├── db/                          # Drizzle schema + migrations
│   │   ├── schema/
│   │   │   ├── tenant.ts            # workspace, organization
│   │   │   ├── user.ts              # user, role, permission, user_role, role_permission
│   │   │   ├── project.ts           # project, project_task, project_inquiry, project_staff
│   │   │   ├── knowledge.ts         # knowledge_page, page_version, claim, owner, tag
│   │   │   ├── system.ts            # system, system_access
│   │   │   ├── company.ts           # company
│   │   │   ├── attendance.ts        # attendance, out_manage, out_manage_detail
│   │   │   ├── file.ts              # raw_source, attachment
│   │   │   ├── menu.ts              # menu_item
│   │   │   ├── code.ts              # code_group, code_item
│   │   │   ├── search.ts            # search_log, search_synonym, popular_search
│   │   │   ├── audit.ts             # audit_log
│   │   │   ├── review.ts            # review_request
│   │   │   └── index.ts             # Re-exports all schemas
│   │   ├── migrations/              # drizzle-kit generated
│   │   ├── seed/
│   │   │   ├── dev.ts               # Development seed data
│   │   │   └── demo.ts              # Demo/presentation data
│   │   ├── client.ts                # Drizzle client singleton
│   │   ├── drizzle.config.ts
│   │   └── package.json
│   │
│   ├── search/                      # Search adapter abstraction
│   │   ├── types.ts                 # SearchQuery, SearchResult, SearchOptions, Facets
│   │   ├── adapter.ts               # SearchAdapter interface
│   │   ├── pg-search.ts             # PostgreSQL FTS + pgvector + pg_trgm implementation
│   │   ├── hybrid-ranker.ts         # Keyword + vector + trgm + freshness score fusion
│   │   ├── query-parser.ts          # websearch_to_tsquery, phrase, prefix
│   │   ├── highlighter.ts           # ts_headline wrapper
│   │   ├── synonym-resolver.ts      # Synonym dictionary lookup
│   │   ├── fallback-chain.ts        # FTS → trgm → synonym → vector → popular
│   │   ├── facet-counter.ts         # GROUP BY page_type/sensitivity facets
│   │   ├── explain.ts               # Score breakdown for admin debug
│   │   ├── os-search.ts             # OpenSearch implementation [Final]
│   │   └── package.json
│   │
│   ├── ai/                          # AI/LLM integration
│   │   ├── types.ts                 # Claim, SourceRef, Confidence, AskResult
│   │   ├── ask.ts                   # Grounded Q&A: query → retrieve → generate → cite
│   │   ├── embed.ts                 # Embedding generation (OpenAI/Claude)
│   │   ├── draft.ts                 # AI draft page generation
│   │   ├── summarize.ts             # Page summarization
│   │   └── package.json
│   │
│   ├── auth/                        # Authentication & authorization
│   │   ├── types.ts                 # Session, User, Permission types
│   │   ├── sso.ts                   # OIDC/SAML client (openid-client)
│   │   ├── session.ts               # Redis session management
│   │   ├── rbac.ts                  # Role/permission checking
│   │   ├── middleware.ts            # Next.js middleware helpers
│   │   └── package.json
│   │
│   ├── secret/                      # Secret management
│   │   ├── types.ts                 # SecretRef, ResolvedSecret
│   │   ├── resolver.ts              # secret_ref → value resolution
│   │   ├── sops.ts                  # SOPS adapter [MVP]
│   │   ├── vault.ts                 # HashiCorp Vault adapter [P2]
│   │   └── package.json
│   │
│   └── shared/                      # Shared utilities
│       ├── types/
│       │   ├── api.ts               # ApiResponse, PaginatedResponse, ErrorResponse
│       │   ├── page.ts              # PageType, Sensitivity, ReviewStatus enums
│       │   └── common.ts            # ID types, date types
│       ├── validation/
│       │   ├── project.ts           # Zod schemas for project domain
│       │   ├── knowledge.ts         # Zod schemas for knowledge domain
│       │   ├── user.ts              # Zod schemas for user domain
│       │   └── search.ts            # Zod schemas for search queries
│       ├── constants/
│       │   ├── page-types.ts        # Page type constants
│       │   ├── sensitivity.ts       # Sensitivity levels
│       │   └── permissions.ts       # Permission constants
│       ├── utils/
│       │   ├── date.ts              # Date formatting (Korean locale)
│       │   ├── slug.ts              # Slug generation
│       │   └── pagination.ts        # Pagination helpers
│       └── package.json
│
├── docker/
│   ├── docker-compose.yml           # Production
│   ├── docker-compose.dev.yml       # Development (with hot reload)
│   ├── Dockerfile.web               # Next.js standalone build
│   ├── Dockerfile.worker            # Worker process
│   ├── nginx.conf                   # Reverse proxy config
│   └── init-db/
│       ├── 01-extensions.sql        # CREATE EXTENSION pgvector, pg_trgm, unaccent
│       └── 02-init.sql              # Initial schema setup
│
├── scripts/
│   ├── migrate-legacy.ts            # Oracle → PostgreSQL data migration
│   ├── seed-dev.ts                  # Development seed runner
│   ├── health-check.ts             # Service health verification
│   └── generate-embeddings.ts       # Batch embedding generation
│
├── docs/
│   ├── superpowers/specs/           # Design specs
│   ├── adr/                         # Architecture Decision Records
│   └── migration/                   # Legacy migration documentation
│
├── turbo.json                       # Turborepo pipeline config
├── pnpm-workspace.yaml              # Workspace definition
├── package.json                     # Root package.json
├── tsconfig.json                    # Base TypeScript config
├── .env.example                     # Environment variables template
├── .gitignore
└── CLAUDE.md                        # AI assistant instructions
```

---

## 9. App Route Tree

```
app/
├── layout.tsx                           # Root: providers, fonts, metadata
├── not-found.tsx                        # 404 page
├── error.tsx                            # Global error boundary
│
├── (auth)/                              # Auth group (no sidebar, centered layout)
│   ├── layout.tsx                       # Auth layout
│   ├── login/page.tsx                   # SSO login entry
│   ├── callback/page.tsx                # OIDC callback handler
│   └── error/page.tsx                   # Auth error display
│
├── (app)/                               # Main app group (sidebar + topbar)
│   ├── layout.tsx                       # AppShell: Sidebar + Topbar + MobileNav
│   │
│   ├── dashboard/
│   │   └── page.tsx                     # [MVP] Dashboard: widgets, recent, stats
│   │
│   ├── projects/
│   │   ├── page.tsx                     # [MVP] Project list (filterable table)
│   │   ├── new/page.tsx                 # [MVP] Create project form
│   │   └── [projectId]/
│   │       ├── layout.tsx               # Project detail layout (tabs)
│   │       ├── page.tsx                 # [MVP] Project overview
│   │       ├── tasks/page.tsx           # [MVP] Task management (DevelopManagement)
│   │       ├── staff/page.tsx           # [MVP] Staff assignment
│   │       ├── inquiries/page.tsx       # [MVP] Inquiries (DevelopInquiry)
│   │       └── settings/page.tsx        # [MVP] Project settings
│   │
│   ├── systems/
│   │   ├── page.tsx                     # [MVP] System list (cards/table)
│   │   ├── new/page.tsx                 # [MVP] Register new system
│   │   └── [systemId]/
│   │       ├── layout.tsx               # System detail layout (tabs)
│   │       ├── page.tsx                 # [MVP] System overview
│   │       ├── access/page.tsx          # [MVP] Access guide (secret_ref)
│   │       ├── deploy/page.tsx          # [MVP] Deploy/rollback guide
│   │       └── runbook/page.tsx         # [MVP] Runbook (knowledge page)
│   │
│   ├── knowledge/
│   │   ├── page.tsx                     # [MVP] Knowledge home (categorized)
│   │   ├── new/page.tsx                 # [MVP] Create page (MDX editor)
│   │   ├── [pageId]/
│   │   │   ├── page.tsx                 # [MVP] Page viewer (MDX rendered)
│   │   │   ├── edit/page.tsx            # [MVP] Page editor
│   │   │   ├── history/page.tsx         # [MVP] Version history + diff
│   │   │   └── review/page.tsx          # [MVP] Review interface
│   │   ├── onboarding/page.tsx          # [MVP] Onboarding hub
│   │   ├── hr/page.tsx                  # [MVP] HR documents hub
│   │   ├── tools/page.tsx               # [MVP] Remote tools guide
│   │   ├── faq/page.tsx                 # [MVP] FAQ page
│   │   └── glossary/page.tsx            # [MVP] Glossary
│   │
│   ├── search/
│   │   └── page.tsx                     # [MVP] Unified search
│   │
│   ├── ask/
│   │   └── page.tsx                     # [MVP] Ask AI (chat-like)
│   │
│   ├── attendance/
│   │   ├── page.tsx                     # [MVP] My attendance
│   │   └── out-manage/page.tsx          # [MVP] Out-of-office management
│   │
│   ├── profile/
│   │   └── page.tsx                     # [MVP] User profile + quick menu
│   │
│   └── admin/
│       ├── layout.tsx                   # [MVP] Admin layout (role gate)
│       ├── users/page.tsx               # [MVP] User management
│       ├── organizations/page.tsx       # [MVP] Organization tree
│       ├── menus/page.tsx               # [MVP] Menu display config
│       ├── codes/page.tsx               # [MVP] Code master management
│       ├── companies/page.tsx           # [MVP] Company management
│       ├── review-queue/page.tsx        # [MVP] Draft review queue
│       ├── audit/page.tsx               # [MVP] Audit log viewer
│       ├── search-analytics/page.tsx    # [MVP] Search quality dashboard
│       └── settings/page.tsx            # [MVP] System settings
│
└── api/                                 # Route Handlers
    ├── auth/
    │   ├── login/route.ts               # POST: initiate SSO
    │   ├── callback/route.ts            # GET: OIDC callback
    │   ├── refresh/route.ts             # POST: refresh session
    │   └── logout/route.ts              # POST: destroy session
    ├── projects/
    │   ├── route.ts                     # GET: list, POST: create
    │   └── [projectId]/
    │       ├── route.ts                 # GET: detail, PUT: update, DELETE: delete
    │       ├── tasks/route.ts           # GET: list, POST: create
    │       ├── staff/route.ts           # GET: list, POST: assign
    │       └── inquiries/route.ts       # GET: list, POST: create
    ├── systems/
    │   ├── route.ts                     # GET: list, POST: create
    │   └── [systemId]/
    │       ├── route.ts                 # GET, PUT, DELETE
    │       └── access/route.ts          # GET: access with secret_ref resolution
    ├── knowledge/
    │   ├── route.ts                     # GET: list, POST: create
    │   └── [pageId]/
    │       ├── route.ts                 # GET, PUT, DELETE
    │       ├── versions/route.ts        # GET: version history
    │       └── review/route.ts          # POST: submit/approve/reject
    ├── search/route.ts                  # POST: unified search
    ├── ask/route.ts                     # POST: Ask AI
    ├── upload/
    │   ├── route.ts                     # POST: file upload
    │   └── presign/route.ts             # POST: get presigned URL
    ├── attendance/
    │   ├── route.ts                     # GET, POST
    │   └── out-manage/route.ts          # GET, POST, PUT, DELETE
    ├── admin/
    │   ├── users/route.ts               # CRUD
    │   ├── organizations/route.ts       # CRUD
    │   ├── menus/route.ts               # CRUD
    │   ├── codes/route.ts               # CRUD
    │   ├── companies/route.ts           # CRUD
    │   └── audit/route.ts               # GET: audit log query
    └── health/route.ts                  # GET: health check
```

**Total: ~32 pages + ~25 API route handlers**

---

## 10. Screen IA

### 10.1 Navigation Structure

```
Jarvis
├── Dashboard                     # 첫 화면. 요약 위젯, 최근 활동, 빠른 링크
│
├── Projects                      # 프로젝트 관리
│   ├── [List]                    # 테이블: 검색, 필터, 정렬
│   ├── [New]                     # 생성 폼
│   └── [Detail]                  # 탭: 개요 | 작업 | 인력 | 문의 | 설정
│
├── Systems                       # 시스템/인프라
│   ├── [List]                    # 카드 또는 테이블
│   ├── [New]                     # 등록 폼
│   └── [Detail]                  # 탭: 개요 | 접속정보 | 배포 | 런북
│
├── Knowledge                     # 지식 플랫폼
│   ├── [Home]                    # 카테고리별 허브
│   ├── [New]                     # MDX 에디터 (markdown + frontmatter)
│   ├── [View]                    # MDX 렌더링 + 메타데이터 사이드바
│   ├── [Edit]                    # 인라인 에디터
│   ├── [History]                 # 버전 목록 + diff 뷰
│   ├── [Review]                  # 리뷰 인터페이스
│   ├── Onboarding                # 온보딩 허브 (체크리스트 형태)
│   ├── HR                        # HR 문서 카테고리
│   ├── Tools                     # 업무도구 가이드
│   ├── FAQ                       # FAQ 아코디언
│   └── Glossary                  # 용어 사전 (알파벳/가나다순)
│
├── Search                        # 통합 검색
│   └── [Results]                 # 필터 패널 + 결과 카드 + 하이라이트 + 파셋
│
├── Ask AI                        # AI 질문
│   └── [Chat]                    # 채팅 UI + 근거 표시 카드
│
├── Attendance                    # 근태
│   ├── [My]                      # 내 근태 현황 + 신청
│   └── [Out-Manage]              # 외근 관리
│
├── Profile                       # 프로필
│   └── [My Profile]              # 개인정보 + 퀵메뉴 설정
│
└── Admin (role: ADMIN)           # 관리자
    ├── Users                     # 사용자 CRUD
    ├── Organizations             # 조직 트리 CRUD
    ├── Menus                     # 메뉴 순서/표시 설정
    ├── Codes                     # 코드 마스터 관리
    ├── Companies                 # 업체 관리
    ├── Review Queue              # 대기 중인 리뷰 목록
    ├── Audit                     # 감사 로그 뷰어
    ├── Search Analytics          # 검색 품질 대시보드
    └── Settings                  # 시스템 설정
```

### 10.2 Dashboard Widgets [MVP]

| Widget | Data Source | Size |
|--------|-----------|------|
| Quick Links | menu_item (pinned) | 1/3 width |
| Recent Activity | audit_log (last 20) | 1/3 width |
| My Tasks | project_task (assigned to me) | 1/3 width |
| Project Stats | project (active count, by status) | 1/4 width |
| Stale Pages | knowledge_page (past SLA) | 1/4 width |
| Search Trends | popular_search (this week) | 1/4 width |
| Attendance Summary | attendance (this month) | 1/4 width |

### 10.3 Mobile Responsive Breakpoints

| Breakpoint | Width | Layout Change |
|-----------|-------|--------------|
| `sm` | < 640px | Sidebar collapses to bottom nav, single column |
| `md` | 640-1024px | Sidebar collapsible drawer, 2-column |
| `lg` | > 1024px | Sidebar persistent, full layout |

---

## 11. DB Schema / ERD

### 11.1 Complete Schema

*(All tables have `created_at timestamptz DEFAULT now()` and `updated_at timestamptz DEFAULT now()` unless noted)*

#### Tenant & Organization

```sql
CREATE TABLE workspace (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        varchar(50) NOT NULL UNIQUE,    -- legacy enterCd
  name        varchar(200) NOT NULL,
  settings    jsonb DEFAULT '{}',
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

CREATE TABLE organization (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace(id),
  code          varchar(50) NOT NULL,           -- legacy orgCd
  name          varchar(200) NOT NULL,          -- legacy orgNm
  parent_id     uuid REFERENCES organization(id),
  sort_order    int DEFAULT 0,
  is_active     boolean DEFAULT true,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),
  UNIQUE(workspace_id, code)
);
```

#### User & Auth

```sql
CREATE TABLE "user" (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace(id),
  employee_id   varchar(50) NOT NULL,           -- legacy sabun
  name          varchar(100) NOT NULL,
  email         varchar(255),
  phone         varchar(50),
  org_id        uuid REFERENCES organization(id),
  position      varchar(100),                   -- legacy jikweeNm
  is_active     boolean DEFAULT true,
  sso_subject   varchar(255),                   -- OIDC sub claim
  avatar_url    varchar(500),
  preferences   jsonb DEFAULT '{}',             -- quick menu, theme, etc.
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),
  UNIQUE(workspace_id, employee_id)
);

CREATE TABLE role (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace(id),
  code          varchar(50) NOT NULL,           -- legacy roleCd
  name          varchar(100) NOT NULL,
  description   text,
  is_system     boolean DEFAULT false,          -- built-in roles can't be deleted
  created_at    timestamptz DEFAULT now(),
  UNIQUE(workspace_id, code)
);

CREATE TABLE permission (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource  varchar(100) NOT NULL,              -- e.g. 'knowledge.page', 'project'
  action    varchar(50) NOT NULL,               -- e.g. 'read', 'write', 'review', 'admin'
  UNIQUE(resource, action)
);

CREATE TABLE user_role (
  user_id   uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  role_id   uuid NOT NULL REFERENCES role(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE role_permission (
  role_id       uuid NOT NULL REFERENCES role(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES permission(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);
```

#### Project Domain

```sql
CREATE TABLE project (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        uuid NOT NULL REFERENCES workspace(id),
  name                varchar(300) NOT NULL,
  client_company_id   uuid REFERENCES company(id),
  part_code           varchar(50),
  part_name           varchar(200),
  headcount           int,
  contract_start      date,
  contract_end        date,
  dev_start           date,
  dev_end             date,
  inspection_done     boolean DEFAULT false,
  contract_price      numeric(15,2),
  tax_invoice_done    boolean DEFAULT false,
  remark              text,
  status              varchar(30) DEFAULT 'active'
                      CHECK (status IN ('active','completed','archived')),
  created_by          uuid REFERENCES "user"(id),
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);
CREATE INDEX idx_project_ws ON project(workspace_id, status);

CREATE TABLE project_task (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  workspace_id      uuid NOT NULL REFERENCES workspace(id),
  request_seq       int,
  title             varchar(500) NOT NULL,
  content           text,
  status            varchar(30) DEFAULT 'requested'
                    CHECK (status IN ('requested','in_progress','done','paid','cancelled')),
  manager_id        uuid REFERENCES "user"(id),
  developer_id      uuid REFERENCES "user"(id),
  is_outsourced     boolean DEFAULT false,
  is_paid           boolean DEFAULT false,
  paid_content      text,
  start_date        date,
  end_date          date,
  estimated_mm      numeric(5,2),
  actual_mm         numeric(5,2),
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);
CREATE INDEX idx_task_project ON project_task(project_id, status);

CREATE TABLE project_inquiry (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        uuid NOT NULL REFERENCES workspace(id),
  project_id          uuid REFERENCES project(id) ON DELETE SET NULL,
  client_company_id   uuid REFERENCES company(id),
  content             text NOT NULL,
  desired_date        date,
  estimated_mm        numeric(5,2),
  status              varchar(30) DEFAULT 'pending'
                      CHECK (status IN ('pending','confirmed','rejected','converted')),
  sales_person        varchar(100),
  charge_person       varchar(100),
  confirmed           boolean DEFAULT false,
  project_name        varchar(300),
  remark              text,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

CREATE TABLE project_staff (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES "user"(id),
  role        varchar(100),
  start_date  date,
  end_date    date,
  UNIQUE(project_id, user_id)
);
```

#### Knowledge Domain

```sql
CREATE TABLE knowledge_page (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        uuid NOT NULL REFERENCES workspace(id),
  page_type           varchar(50) NOT NULL
                      CHECK (page_type IN (
                        'project','system','access','runbook','onboarding',
                        'hr-policy','tool-guide','faq','decision','incident',
                        'analysis','glossary'
                      )),
  title               varchar(500) NOT NULL,
  slug                varchar(500) NOT NULL,
  body                text NOT NULL DEFAULT '',           -- markdown/MDX
  summary             text,                               -- AI or manual
  sensitivity         varchar(30) DEFAULT 'INTERNAL'
                      CHECK (sensitivity IN ('PUBLIC','INTERNAL','RESTRICTED','SECRET_REF_ONLY')),
  freshness_sla_days  int DEFAULT 90,            -- 0 = never stale (e.g. incidents)
  last_verified_at    timestamptz,
  review_status       varchar(30) DEFAULT 'draft'
                      CHECK (review_status IN ('draft','in_review','published','archived')),
  published_at        timestamptz,
  created_by          uuid REFERENCES "user"(id),
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),
  -- Search columns
  search_vector       tsvector,                           -- auto-maintained by trigger
  embedding           vector(1536),                       -- pgvector
  UNIQUE(workspace_id, slug)
);

-- FTS index
CREATE INDEX idx_kp_search ON knowledge_page USING GIN(search_vector);
-- Vector similarity (HNSW)
CREATE INDEX idx_kp_embedding ON knowledge_page USING hnsw(embedding vector_cosine_ops);
-- Trigram similarity
CREATE INDEX idx_kp_title_trgm ON knowledge_page USING GIN(title gin_trgm_ops);
CREATE INDEX idx_kp_body_trgm ON knowledge_page USING GIN(body gin_trgm_ops);
-- Filter indexes
CREATE INDEX idx_kp_ws_type ON knowledge_page(workspace_id, page_type, review_status);
CREATE INDEX idx_kp_ws_sensitivity ON knowledge_page(workspace_id, sensitivity);
CREATE INDEX idx_kp_ws_updated ON knowledge_page(workspace_id, updated_at DESC);

-- Auto-update search_vector on insert/update
CREATE OR REPLACE FUNCTION update_search_vector() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('simple', COALESCE(NEW.title, '')), 'A') ||
    setweight(to_tsvector('simple', COALESCE(NEW.summary, '')), 'B') ||
    setweight(to_tsvector('simple', COALESCE(NEW.body, '')), 'D');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_kp_search_vector
  BEFORE INSERT OR UPDATE OF title, summary, body
  ON knowledge_page
  FOR EACH ROW EXECUTE FUNCTION update_search_vector();

CREATE TABLE knowledge_page_version (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id       uuid NOT NULL REFERENCES knowledge_page(id) ON DELETE CASCADE,
  version       int NOT NULL,
  title         varchar(500) NOT NULL,
  body          text NOT NULL,
  diff_summary  text,
  created_by    uuid REFERENCES "user"(id),
  created_at    timestamptz DEFAULT now(),
  UNIQUE(page_id, version)
);

CREATE TABLE knowledge_claim (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id         uuid NOT NULL REFERENCES knowledge_page(id) ON DELETE CASCADE,
  claim_text      text NOT NULL,
  source_ref_id   uuid REFERENCES raw_source(id),
  confidence      numeric(3,2) CHECK (confidence >= 0 AND confidence <= 1),
  verified        boolean DEFAULT false,
  verified_by     uuid REFERENCES "user"(id),
  created_at      timestamptz DEFAULT now()
);

CREATE TABLE knowledge_page_owner (
  page_id   uuid NOT NULL REFERENCES knowledge_page(id) ON DELETE CASCADE,
  user_id   uuid NOT NULL REFERENCES "user"(id),
  PRIMARY KEY (page_id, user_id)
);

CREATE TABLE knowledge_page_tag (
  page_id   uuid NOT NULL REFERENCES knowledge_page(id) ON DELETE CASCADE,
  tag       varchar(100) NOT NULL,
  PRIMARY KEY (page_id, tag)
);
CREATE INDEX idx_kp_tag ON knowledge_page_tag(tag);
```

#### Raw Source & Attachment

```sql
CREATE TABLE raw_source (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspace(id),
  source_type     varchar(30) NOT NULL
                  CHECK (source_type IN ('file','url','manual','legacy_import')),
  original_name   varchar(500),
  storage_key     varchar(1000),               -- MinIO object key
  mime_type       varchar(200),
  size_bytes      bigint,
  checksum        varchar(128),                -- SHA-256
  parsed_text     text,                        -- extracted text for search
  metadata        jsonb DEFAULT '{}',
  created_by      uuid REFERENCES "user"(id),
  created_at      timestamptz DEFAULT now()
);

CREATE TABLE attachment (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspace(id),
  entity_type     varchar(50) NOT NULL,        -- 'project', 'page', 'inquiry', etc.
  entity_id       uuid NOT NULL,
  raw_source_id   uuid NOT NULL REFERENCES raw_source(id),
  sort_order      int DEFAULT 0,
  created_at      timestamptz DEFAULT now()
);
CREATE INDEX idx_attach_entity ON attachment(entity_type, entity_id);
```

#### System & Infra

```sql
CREATE TABLE "system" (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspace(id),
  name            varchar(300) NOT NULL,
  company_id      uuid REFERENCES company(id),
  category        varchar(50),                 -- web/api/db/infra/tool
  environment     varchar(30),                 -- dev/staging/prod
  status          varchar(30) DEFAULT 'active'
                  CHECK (status IN ('active','deprecated','decommissioned')),
  description     text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE TABLE system_access (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  system_id       uuid NOT NULL REFERENCES "system"(id) ON DELETE CASCADE,
  access_type     varchar(50) NOT NULL,        -- vpn/ssh/web/db/svn/rdp
  endpoint        varchar(500),                -- URL/IP (non-secret)
  login_guide     text,                        -- how-to (no actual secrets)
  secret_ref      varchar(500),                -- vault://jarvis/systems/{id}/credentials
  sort_order      int DEFAULT 0,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);
```

#### Company

```sql
CREATE TABLE company (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspace(id),
  code            varchar(50) NOT NULL,        -- legacy companyCd
  name            varchar(300) NOT NULL,
  group_code      varchar(50),
  category        varchar(50),
  representative  varchar(100),
  start_date      date,
  industry_code   varchar(50),
  address         text,
  homepage        varchar(500),
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  UNIQUE(workspace_id, code)
);
```

#### Attendance & HR

```sql
CREATE TABLE attendance (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspace(id),
  user_id         uuid NOT NULL REFERENCES "user"(id),
  start_date      date NOT NULL,
  end_date        date NOT NULL,
  leave_type      varchar(50) NOT NULL,        -- annual/sick/special/etc.
  status          varchar(30) DEFAULT 'pending'
                  CHECK (status IN ('pending','approved','rejected','cancelled')),
  note            text,
  applied_at      timestamptz DEFAULT now(),
  approved_by     uuid REFERENCES "user"(id),
  approved_at     timestamptz,
  created_at      timestamptz DEFAULT now()
);
CREATE INDEX idx_attend_user ON attendance(workspace_id, user_id, start_date);

CREATE TABLE out_manage (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspace(id),
  user_id         uuid NOT NULL REFERENCES "user"(id),
  date            date NOT NULL,
  service_count   int DEFAULT 0,
  total_count     int DEFAULT 0,
  note            text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  UNIQUE(workspace_id, user_id, date)
);

CREATE TABLE out_manage_detail (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  out_manage_id   uuid NOT NULL REFERENCES out_manage(id) ON DELETE CASCADE,
  start_time      timestamptz NOT NULL,
  end_time        timestamptz,
  description     text,
  created_at      timestamptz DEFAULT now()
);
```

#### Menu & Code Master

```sql
CREATE TABLE menu_item (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspace(id),
  parent_id       uuid REFERENCES menu_item(id),
  label           varchar(200) NOT NULL,
  icon            varchar(100),
  route_path      varchar(300),                -- matches file-system route (e.g. /dashboard)
  sort_order      int DEFAULT 0,
  is_visible      boolean DEFAULT true,
  required_role   varchar(50),                 -- role code for visibility gating
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);
CREATE INDEX idx_menu_ws ON menu_item(workspace_id, parent_id, sort_order);

CREATE TABLE code_group (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspace(id),
  code            varchar(50) NOT NULL,        -- legacy grcodeCd
  name            varchar(200) NOT NULL,
  is_active       boolean DEFAULT true,
  UNIQUE(workspace_id, code)
);

CREATE TABLE code_item (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id        uuid NOT NULL REFERENCES code_group(id) ON DELETE CASCADE,
  code            varchar(50) NOT NULL,
  name            varchar(200) NOT NULL,
  name_en         varchar(200),
  sort_order      int DEFAULT 0,
  is_active       boolean DEFAULT true,
  metadata        jsonb DEFAULT '{}',          -- legacy note1-4, numNote
  UNIQUE(group_id, code)
);
```

#### Search & Analytics

```sql
CREATE TABLE search_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspace(id),
  user_id         uuid REFERENCES "user"(id),
  query           text NOT NULL,
  filters         jsonb,
  result_count    int,
  clicked_page_id uuid,
  clicked_rank    int,
  response_ms     int,
  created_at      timestamptz DEFAULT now()
);
CREATE INDEX idx_search_log_ws ON search_log(workspace_id, created_at DESC);

CREATE TABLE search_synonym (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspace(id),
  term            varchar(200) NOT NULL,
  synonyms        varchar[] NOT NULL,          -- e.g. {'연차', 'leave', 'annual'}
  UNIQUE(workspace_id, term)
);

CREATE TABLE popular_search (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspace(id),
  query           varchar(500) NOT NULL,
  count           int DEFAULT 0,
  period          date NOT NULL,               -- daily aggregation
  UNIQUE(workspace_id, query, period)
);
```

#### Audit Log

```sql
CREATE TABLE audit_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspace(id),
  user_id         uuid REFERENCES "user"(id),
  action          varchar(50) NOT NULL,        -- CREATE/READ/UPDATE/DELETE/LOGIN/SEARCH/EXPORT
  resource_type   varchar(100) NOT NULL,       -- 'project', 'knowledge_page', 'user', etc.
  resource_id     uuid,
  ip_address      inet,
  user_agent      text,
  details         jsonb DEFAULT '{}',          -- changed fields, old/new values
  success         boolean DEFAULT true,
  error_message   text,
  created_at      timestamptz DEFAULT now()
);
CREATE INDEX idx_audit_ws ON audit_log(workspace_id, created_at DESC);
CREATE INDEX idx_audit_user ON audit_log(workspace_id, user_id, created_at DESC);
CREATE INDEX idx_audit_resource ON audit_log(resource_type, resource_id);
-- FTS on audit for admin search
ALTER TABLE audit_log ADD COLUMN search_vector tsvector;
CREATE INDEX idx_audit_search ON audit_log USING GIN(search_vector);

-- Auto-update audit search_vector
CREATE OR REPLACE FUNCTION update_audit_search_vector() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    to_tsvector('simple', COALESCE(NEW.action, '') || ' ' ||
                          COALESCE(NEW.resource_type, '') || ' ' ||
                          COALESCE(NEW.error_message, '') || ' ' ||
                          COALESCE(NEW.details::text, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_search_vector
  BEFORE INSERT ON audit_log
  FOR EACH ROW EXECUTE FUNCTION update_audit_search_vector();
```

#### Review & Governance

```sql
CREATE TABLE review_request (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspace(id),
  page_id         uuid NOT NULL REFERENCES knowledge_page(id) ON DELETE SET NULL,
                  -- Review history survives page deletion for audit trail
  requested_by    uuid NOT NULL REFERENCES "user"(id),
  reviewer_id     uuid REFERENCES "user"(id),
  status          varchar(30) DEFAULT 'pending'
                  CHECK (status IN ('pending','approved','rejected','changes_requested')),
  comment         text,
  created_at      timestamptz DEFAULT now(),
  resolved_at     timestamptz
);
CREATE INDEX idx_review_ws ON review_request(workspace_id, status, created_at DESC);
```

### 11.2 ERD Summary

**Total tables: 32**

| Domain | Tables | Count |
|--------|--------|-------|
| Tenant | workspace, organization | 2 |
| User/Auth | user, role, permission, user_role, role_permission | 5 |
| Project | project, project_task, project_inquiry, project_staff | 4 |
| Knowledge | knowledge_page, knowledge_page_version, knowledge_claim, knowledge_page_owner, knowledge_page_tag | 5 |
| File | raw_source, attachment | 2 |
| System | system, system_access | 2 |
| Company | company | 1 |
| Attendance | attendance, out_manage, out_manage_detail | 3 |
| Menu/Code | menu_item, code_group, code_item | 3 |
| Search | search_log, search_synonym, popular_search | 3 |
| Audit | audit_log | 1 |
| Review | review_request | 1 |

**Note:** Sessions are managed in Redis (not a PostgreSQL table). See `packages/auth/session.ts` and ADR-008.

---

## 12. API Contracts

### 12.1 Common Patterns

**Response envelope:**
```typescript
interface ApiResponse<T> {
  data: T;
  meta?: {
    total: number;
    page: number;       // 1-indexed (page=1 is first page)
    pageSize: number;
    totalPages: number;
  };
}

interface ApiError {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
}

type ErrorCode =
  | 'UNAUTHORIZED'       // 401: not logged in
  | 'FORBIDDEN'          // 403: insufficient permissions
  | 'NOT_FOUND'          // 404: resource not found
  | 'VALIDATION_ERROR'   // 422: invalid request body/params
  | 'CONFLICT'           // 409: duplicate, version conflict
  | 'RATE_LIMITED'       // 429: too many requests
  | 'INTERNAL_ERROR';    // 500: unexpected server error
```

**Pagination query (1-indexed):**
```
GET /api/projects?page=1&pageSize=20&sort=created_at:desc&status=active
```

### 12.2 Key API Examples

#### Search API [MVP]

```
POST /api/search
Content-Type: application/json

Request:
{
  "query": "배포 절차 vpn",
  "filters": {
    "page_type": ["runbook", "system"],
    "sensitivity": ["PUBLIC", "INTERNAL"],
    "date_range": {
      "from": "2025-01-01",
      "to": "2026-04-07"
    }
  },
  "sort": "relevance",         // relevance | newest | freshness | hybrid
  "page": 1,
  "pageSize": 20,
  "explain": false,            // admin: show score breakdown
  "highlight": true
}

Response:
{
  "data": [
    {
      "id": "uuid",
      "page_type": "runbook",
      "title": "프로덕션 <mark>배포</mark> <mark>절차</mark>",
      "snippet": "...<mark>VPN</mark> 연결 후 Jenkins에서 <mark>배포</mark> 파이프라인을 실행합니다...",
      "sensitivity": "INTERNAL",
      "score": 0.87,
      "scores": {                // only if explain=true
        "keyword": 0.92,
        "vector": 0.78,
        "trgm": 0.65,
        "freshness": 0.95,
        "final": 0.87
      },
      "updated_at": "2026-03-15T09:00:00Z",
      "owners": ["김철수"],
      "tags": ["배포", "운영", "VPN"]
    }
  ],
  "meta": {
    "total": 45,
    "page": 1,
    "pageSize": 20,
    "totalPages": 3
  },
  "facets": {
    "page_type": { "runbook": 12, "system": 8, "faq": 15, "hr-policy": 10 },
    "sensitivity": { "PUBLIC": 20, "INTERNAL": 25 }
  },
  "suggestions": ["배포 롤백", "배포 체크리스트"]
}
```

#### Ask AI API [MVP]

```
POST /api/ask
Content-Type: application/json

Request:
{
  "question": "스테이징 서버에 배포하는 방법이 뭐야?",
  "context": {
    "current_page_id": "uuid"    // optional: user is reading this page
  }
}

Response:
{
  "data": {
    "answer": "스테이징 서버 배포는 Jenkins를 통해 진행합니다. ...",
    "claims": [
      {
        "text": "Jenkins에서 staging-deploy 파이프라인을 실행합니다",
        "source": {
          "page_id": "uuid",
          "page_title": "스테이징 배포 가이드",
          "page_type": "runbook",
          "relevance": 0.95
        },
        "confidence": 0.92
      },
      {
        "text": "배포 전 VPN 연결이 필요합니다",
        "source": {
          "page_id": "uuid2",
          "page_title": "VPN 접속 가이드",
          "page_type": "access",
          "relevance": 0.88
        },
        "confidence": 0.89
      }
    ],
    "related_pages": [
      { "id": "uuid3", "title": "프로덕션 배포 절차", "relevance": 0.75 }
    ]
  }
}
```

#### Knowledge Page CRUD [MVP]

```
POST /api/knowledge
Content-Type: application/json

Request:
{
  "page_type": "runbook",
  "title": "Redis 장애 대응 런북",
  "slug": "redis-incident-runbook",
  "body": "# Redis 장애 대응\n\n## 1. 상태 확인\n...",
  "sensitivity": "INTERNAL",
  "freshness_sla_days": 90,
  "tags": ["redis", "장애대응", "운영"],
  "source_refs": ["uuid-raw-source"],
  "secret_refs": ["vault://jarvis/redis/prod/credentials"]
}

Response:
{
  "data": {
    "id": "uuid",
    "review_status": "draft",    // auto-draft for RESTRICTED/SECRET_REF_ONLY
    "created_at": "2026-04-07T12:00:00Z"
  }
}
```

#### File Upload [MVP]

```
POST /api/upload
Content-Type: multipart/form-data

Fields:
  - file: (binary)
  - entity_type: "page"
  - entity_id: "uuid"

Response:
{
  "data": {
    "attachment_id": "uuid",
    "raw_source_id": "uuid",
    "original_name": "architecture-diagram.png",
    "size_bytes": 2048000,
    "mime_type": "image/png",
    "storage_key": "ws-001/attachments/2026/04/uuid.png"
  }
}
```

---

## 13. Search Design

### 13.1 18-Feature Search Engine (PostgreSQL-only)

| # | Feature | Implementation | Phase |
|---|---------|---------------|-------|
| # | Feature | Implementation | Phase |
|---|---------|---------------|-------|
| 1 | Weighted ranking | `setweight(A:title, B:tags, C:summary, D:body)` + `ts_rank_cd()` | [MVP-Core] |
| 2 | Highlighting | `ts_headline()` with `<mark>` tags | [MVP-Core] |
| 3 | Phrase search | `phraseto_tsquery()` for exact phrase | [MVP-Core] |
| 4 | Web-style query | `websearch_to_tsquery()` for `OR`, `-` operators | [MVP-Core] |
| 5 | Prefix search | `to_tsquery()` with `*` suffix for autocomplete | [MVP-Core] |
| 6 | Fuzzy search | `pg_trgm` + `similarity()` / `word_similarity()` | [MVP-Core] |
| 9 | Filter search | WHERE clauses on `page_type`, `sensitivity`, `workspace_id`, etc. | [MVP-Core] |
| 11 | Permission filter | JOIN `user_role` + `sensitivity` check in WHERE | [MVP-Core] |
| 13 | Facet counts | `SELECT page_type, COUNT(*) GROUP BY page_type` | [MVP-Core] |
| 18 | Quality measurement | `search_log` table + click tracking + zero-result tracking | [MVP-Core] |
| 7 | Similar docs | `pgvector` cosine similarity + `pg_trgm` title match | [MVP-Enhanced] |
| 8 | Hybrid search | App-layer fusion: `0.4*kw + 0.3*vec + 0.15*trgm + 0.15*fresh` | [MVP-Enhanced] |
| 10 | Mixed sorting | `relevance * 0.8 + freshness * 0.2` configurable weights | [MVP-Enhanced] |
| 12 | Result grouping | `GROUP BY page_type` in sub-query | [MVP-Enhanced] |
| 14 | Autocomplete | Prefix search + `popular_search` table + alias dictionary | [MVP-Enhanced] |
| 15 | Synonym search | `search_synonym` table lookup → expanded query | [MVP-Enhanced] |
| 16 | Search explain | Score breakdown object in response (admin mode) | [MVP-Enhanced] |
| 17 | Zero-result fallback | FTS → trigram → synonym re-query → vector → popular docs | [MVP-Enhanced] |

**MVP-Core** (10 features): Must ship. Basic FTS + fuzzy + permissions + facets + logging.
**MVP-Enhanced** (8 features): Ship if time allows (Day 4 assessment). Vector/hybrid/synonym/explain/fallback.

### 13.2 Search Query Pipeline

```
User Input: "배포 절차 vpn"
       │
       ▼
┌─────────────────┐
│  Query Parser    │
│  websearch_to_  │
│  tsquery()      │──→ tsquery: '배포' & '절차' & 'vpn'
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Synonym Resolver │──→ 'vpn' expands to 'vpn' | '외부접속' | '원격접속'
│ (DB lookup)      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│ PostgreSQL FTS   │     │ pgvector Search │
│ ts_rank_cd()     │     │ cosine distance │
│ with weights     │     │ (embedding)     │
└────────┬────────┘     └────────┬────────┘
         │                       │
         ▼                       ▼
┌──────────────────────────────────────┐
│         Hybrid Ranker                 │
│  score = 0.40 * fts_score             │
│        + 0.30 * vector_score          │
│        + 0.15 * trgm_score            │
│        + 0.15 * freshness_score       │
└────────┬─────────────────────────────┘
         │
         ▼
┌─────────────────┐
│ Permission      │──→ Filter by workspace_id + user roles + sensitivity
│ Filter          │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Result Builder  │──→ Highlight, facets, suggestions, explain
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Fallback Chain  │──→ If 0 results: trigram → synonym → vector → popular
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Search Logger   │──→ Log query, result_count, latency to search_log
└─────────────────┘
```

### 13.3 Korean Text Search Strategy

PostgreSQL의 기본 `simple` dictionary는 한국어 형태소 분석을 하지 않는다. 대안:

| Strategy | Pros | Cons | Phase |
|----------|------|------|-------|
| `simple` parser + pg_trgm 보완 | 설치 불필요, trigram이 부분 매칭 처리 | 형태소 분석 없음, "배포했다"→"배포" 불가 | [MVP] |
| `pgroonga` extension | 한국어 형태소 분석 지원, FTS 직접 대체 | 별도 extension 설치 필요 | [P2] |
| App-layer 전처리 | 검색 시 형태소 분석 후 토큰 전달 | App 복잡도 증가 | [P2] |

**MVP 전략:** `simple` parser + `pg_trgm` 조합. 한국어는 trigram이 형태소 분석 없이도 부분 매칭을 잘 처리한다. 정확도가 부족하면 Phase 2에서 `pgroonga` 또는 OpenSearch의 `nori` analyzer로 교체.

---

## 14. Knowledge Page Taxonomy

### 14.1 Page Types

| Type | Purpose | Sensitivity Default | SLA Default | Source |
|------|---------|-------------------|-------------|--------|
| `project` | 프로젝트 관련 문서 | INTERNAL | 30d | manual / legacy import |
| `system` | 시스템 개요 | INTERNAL | 90d | manual |
| `access` | 시스템 접속 가이드 | RESTRICTED | 30d | manual + secret_ref |
| `runbook` | 운영 런북 (장애/배포/롤백) | INTERNAL | 60d | manual |
| `onboarding` | 신규입사자 가이드 | PUBLIC | 90d | manual |
| `hr-policy` | HR 규정 (휴가/복지/교육/평가/증명서) | INTERNAL | 180d | file upload |
| `tool-guide` | 업무도구/리모트툴 가이드 | PUBLIC | 120d | manual |
| `faq` | FAQ | PUBLIC | 60d | manual / AI generated |
| `decision` | 의사결정 기록 | INTERNAL | 365d | manual |
| `incident` | 장애 보고서 | INTERNAL | 0 (never stale) | manual |
| `analysis` | 분석 문서 | INTERNAL | 180d | manual |
| `glossary` | 용어 정의 | PUBLIC | 365d | manual |

### 14.2 Page Frontmatter Example

```yaml
---
page_type: runbook
title: "프로덕션 배포 절차"
slug: production-deploy-runbook
sensitivity: INTERNAL
freshness_sla_days: 60
owners: ["김개발", "이운영"]
tags: ["배포", "프로덕션", "Jenkins"]
source_refs:
  - id: "uuid-of-raw-source"
    name: "배포 매뉴얼 v3.2.pdf"
secret_refs:
  - ref: "vault://jarvis/systems/jenkins-prod/credentials"
    label: "Jenkins 프로덕션 접속정보"
last_verified_at: "2026-03-15"
review_status: published
---
```

### 14.3 Page Lifecycle

```
                    ┌─────┐
                    │ New │
                    └──┬──┘
                       │ create
                       ▼
                    ┌───────┐
              ┌─────│ Draft │◄────────────────┐
              │     └───┬───┘                 │
              │         │ submit for review   │ changes_requested
              │         ▼                     │
              │     ┌──────────┐              │
              │     │In Review │──────────────┘
              │     └────┬─────┘
              │          │ approve
              │          ▼
              │     ┌──────────┐
              │     │Published │◄──── verify (resets SLA timer)
              │     └────┬─────┘
              │          │ archive
              │          ▼
              │     ┌──────────┐
              └────►│ Archived │
                    └──────────┘
```

---

## 15. Secret Management Design

### 15.1 Principle

**절대 규칙:** 실제 비밀번호, 토큰, DB 접속값, private key, API key는 어떤 상황에서도 다음에 저장하지 않는다:
- knowledge_page.body (본문)
- knowledge_page.search_vector (검색 인덱스)
- knowledge_page.embedding (벡터 인덱스)
- system_access의 login_guide (접속 가이드 텍스트)
- 검색 결과 snippet

### 15.2 Secret Reference Format

```
vault://jarvis/{workspace}/{system}/{credential_name}
```

Examples:
- `vault://jarvis/ws-001/jenkins-prod/admin-password`
- `vault://jarvis/ws-001/postgres-main/connection-string`
- `vault://jarvis/ws-001/vpn/ovpn-config`

### 15.3 Resolution Flow [MVP]

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ User clicks  │────►│ Server checks│────►│ SOPS decrypt │
│ "접속정보 보기"│     │ RBAC + audit │     │ .enc.yaml    │
└──────────────┘     └──────────────┘     └──────┬───────┘
                                                  │
                                           ┌──────▼───────┐
                                           │ Return value │
                                           │ (never cached│
                                           │  in browser) │
                                           └──────────────┘
```

- **MVP:** SOPS-encrypted YAML files. `secret_ref` maps to file path + key.
- **Phase 2:** HashiCorp Vault with lease-based access, auto-rotation.
- **Caching:** Resolved secrets are **never cached in the browser/client**. Server-side Redis cache with **5-minute TTL** is allowed to reduce SOPS decryption overhead. Cache key: `secret:{secret_ref}`, evicted on secret rotation.
- **Audit:** Every secret resolution is logged to `audit_log` with action `SECRET_ACCESS`.

### 15.4 Sensitivity Classification & Access Rules

| Level | Description | Who can read | Review required | Secret resolution |
|-------|------------|-------------|----------------|------------------|
| PUBLIC | 누구나 볼 수 있음 | All authenticated | No | N/A |
| INTERNAL | 사내 직원만 | All workspace members | Optional | N/A |
| RESTRICTED | 특정 역할만 | Specific roles (via RBAC) | Required | N/A |
| SECRET_REF_ONLY | 비밀값 포함 문서 | RBAC + explicit grant | Required | Via secret_ref only |

---

## 16. RBAC / ABAC Design

### 16.1 Role Hierarchy [MVP]

| Role Code | Name | Permissions |
|-----------|------|------------|
| `ADMIN` | 시스템 관리자 | All permissions |
| `MANAGER` | 팀장/관리자 | Project CRUD, review approve, user management (own org) |
| `DEVELOPER` | 개발자 | Project read/write, knowledge write, system read, search |
| `HR` | 인사담당 | HR docs write, attendance manage, user read |
| `VIEWER` | 일반 열람자 | Knowledge read (PUBLIC/INTERNAL), search, ask AI |

### 16.2 Permission Model

```typescript
type Permission = {
  resource: string;  // 'knowledge.page' | 'project' | 'system' | 'user' | 'admin' | ...
  action: string;    // 'read' | 'write' | 'delete' | 'review' | 'admin'
};

// Examples:
'knowledge.page:read'     // Read published pages
'knowledge.page:write'    // Create/edit pages
'knowledge.page:review'   // Approve/reject reviews
'project:write'           // Create/edit projects
'system.access:read'      // View access info (non-secret)
'system.access:secret'    // Resolve secret_ref
'admin:users'             // Manage users
'admin:audit'             // View audit logs
```

### 16.3 ABAC Extensions [P2]

Attribute-based rules for finer control:
- `knowledge.page:read` WHERE `page.sensitivity <= user.clearance_level`
- `system.access:secret` WHERE `user.org_id == system.owning_org_id`
- `project:write` WHERE `user.id IN project_staff`

### 16.4 RBAC vs Ownership Interaction

| Scenario | RBAC Permission | Ownership | Result |
|----------|----------------|-----------|--------|
| Edit a page | `knowledge.page:write` required | Owner | Edit + self-publish (if auto-review not required) |
| Edit a page | `knowledge.page:write` required | Non-owner | Edit allowed, but **review always required** before publish |
| View RESTRICTED page | `knowledge.page:read` required | Any | Only if role has RESTRICTED clearance |
| View SECRET_REF_ONLY page | `knowledge.page:read` + `system.access:secret` | Must be in `knowledge_page_owner` | Owner-only access, "explicit grant" = page_owner membership |
| No owners on a page | `knowledge.page:write` | N/A (empty) | All edits require review (treat as "no self-publish") |

**Rule:** RBAC grants the _ability_ to perform an action. Ownership determines whether that action can bypass the review gate.

### 16.5 Security Hardening [MVP]

| Concern | Implementation |
|---------|---------------|
| **CORS** | Allow only configured frontend origin(s). Configurable via `CORS_ORIGINS` env var. |
| **CSRF** | SameSite=Lax cookies for session. Server Actions use built-in CSRF token from Next.js. Route Handlers require `Origin`/`Referer` validation. |
| **CSP** | `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: ${MINIO_URL}; connect-src 'self' ${LLM_API_URL}` |
| **XSS / MDX** | MDX is compiled at **build/save time only** (via `@next/mdx` + `rehype-sanitize`). Raw HTML in user-authored MDX is stripped. No runtime `dangerouslySetInnerHTML`. |
| **Rate Limiting** | Redis-backed sliding window. `/api/ask`: 20 req/user/hour. `/api/search`: 120 req/user/min. `/api/auth/login`: 5 req/IP/min. |
| **File Upload** | Max file size: 50MB. Allowed MIME types: `application/pdf, application/vnd.openxmlformats-officedocument.*, text/plain, text/markdown, image/png, image/jpeg, image/gif, application/vnd.ms-excel`. Per-workspace storage quota: 10GB (configurable). |
| **Headers** | `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Strict-Transport-Security` (if HTTPS), `Referrer-Policy: strict-origin-when-cross-origin` |

### 16.6 Backup & Disaster Recovery [MVP]

| Component | Strategy | Schedule | RTO | RPO |
|-----------|----------|----------|-----|-----|
| PostgreSQL | `pg_dump --format=custom` to MinIO backup bucket | Daily 2:00 AM + before cutover | 1 hour | 24 hours |
| MinIO | Rsync to secondary storage / NAS | Daily 3:00 AM | 2 hours | 24 hours |
| Redis | AOF persistence + RDB snapshots | Continuous AOF, RDB every 15 min | 5 min (session re-login) | 15 min |
| Docker Compose | `docker-compose.yml` + `.env` in git | On every change | 30 min (rebuild) | 0 (in git) |

**Recovery procedure:**
1. PG: `pg_restore --dbname=jarvis backup.dump`
2. MinIO: Rsync from backup NAS
3. Redis: Restart with AOF replay (sessions regenerate on next login)

### 16.7 Middleware Implementation [MVP]

```typescript
// packages/auth/middleware.ts
export function requirePermission(resource: string, action: string) {
  return async (req: NextRequest) => {
    const session = await getSession(req);
    if (!session) return redirect('/login');

    const hasPermission = await checkPermission(
      session.userId,
      resource,
      action,
      { workspaceId: session.workspaceId }
    );

    if (!hasPermission) {
      return new Response('Forbidden', { status: 403 });
    }
  };
}

// Usage in route handler:
export async function GET(req: NextRequest) {
  await requirePermission('project', 'read')(req);
  // ... handler logic
}
```

---

## 17. Draft / Review / Publish Flow

### 17.1 Auto-Review Rules

| Condition | Auto-review required? |
|-----------|---------------------|
| sensitivity = RESTRICTED | Yes, always |
| sensitivity = SECRET_REF_ONLY | Yes, always |
| page_type = access | Yes, always |
| page_type = hr-policy | Yes, always |
| Edited by non-owner | Yes |
| Otherwise | Optional (author can self-publish) |

### 17.2 Review API

```
POST /api/knowledge/{pageId}/review
{
  "action": "submit"    // submit | approve | reject | request_changes
  "reviewer_id": "uuid" // for submit
  "comment": "..."      // for reject/request_changes
}
```

### 17.3 State Machine

```typescript
const transitions: Record<ReviewStatus, Record<string, ReviewStatus>> = {
  draft: {
    submit: 'in_review',
    publish: 'published',  // only if auto-review not required
  },
  in_review: {
    approve: 'published',
    reject: 'draft',
    request_changes: 'draft',
  },
  published: {
    edit: 'draft',        // creates new version, page stays published until new version approved
    archive: 'archived',
  },
  archived: {
    restore: 'draft',
  },
};
```

---

## 18. Background Job Design (pg-boss)

### 18.1 Job Types [MVP]

| Job Name | Trigger | Input | Output | Schedule |
|----------|---------|-------|--------|----------|
| `ingest-source` | File upload | `{raw_source_id}` | Parsed text saved | Event-driven |
| `generate-embedding` | Page create/update | `{page_id}` | Embedding vector saved | Event-driven |
| `compile-page` | Source update + template | `{page_id, source_ids[]}` | Updated page body | Event-driven |
| `check-freshness` | Cron | `{workspace_id}` | Flags stale pages (dashboard widget + `is_stale` field). No push notifications in MVP. | Daily 9:00 AM |
| `aggregate-popular` | Cron | `{workspace_id, date}` | popular_search updated | Daily 1:00 AM |
| `cleanup-old-logs` | Cron | `{retention_days}` | Old audit/search logs deleted | Weekly |

### 18.2 Worker Architecture

```typescript
// apps/worker/index.ts
import PgBoss from 'pg-boss';

const boss = new PgBoss({
  connectionString: process.env.DATABASE_URL,
  retryLimit: 3,
  retryDelay: 60,        // 1 minute
  expireInHours: 24,
  archiveCompletedAfterSeconds: 86400,
});

await boss.start();

// Register handlers
await boss.work('ingest-source', { teamSize: 2 }, handleIngest);
await boss.work('generate-embedding', { teamSize: 4 }, handleEmbed);
await boss.work('compile-page', { teamSize: 2 }, handleCompile);

// Schedule recurring jobs
await boss.schedule('check-freshness', '0 9 * * *', { workspace_id: 'all' });
await boss.schedule('aggregate-popular', '0 1 * * *', { workspace_id: 'all' });
await boss.schedule('cleanup-old-logs', '0 3 * * 0', { retention_days: 365 });
```

### 18.3 Job Chain Pattern

```
File Upload
    │
    ▼
[ingest-source]  ──→  Parse text, save to raw_source.parsed_text
    │
    ▼
[generate-embedding]  ──→  Generate embedding, save to knowledge_page.embedding
    │
    ▼
[compile-page] (optional)  ──→  Update knowledge_page.body from sources
```

---

## 19. Raw Source Ingestion Flow

### 19.1 Flow Diagram

```
┌──────────┐     ┌──────────────┐     ┌──────────────┐
│ User     │────►│ Upload API   │────►│ MinIO        │
│ uploads  │     │ (Route       │     │ (store raw)  │
│ file     │     │  Handler)    │     └──────┬───────┘
└──────────┘     └──────┬───────┘            │
                        │                    │
                        ▼                    │
                 ┌──────────────┐            │
                 │ DB: create   │            │
                 │ raw_source   │◄───────────┘
                 │ + attachment │   storage_key
                 └──────┬───────┘
                        │ enqueue
                        ▼
                 ┌──────────────┐
                 │ pg-boss:     │
                 │ ingest-source│
                 └──────┬───────┘
                        │
                        ▼
                 ┌──────────────┐
                 │ Parse text   │
                 │ (PDF/DOCX/   │
                 │  TXT/MD)     │
                 └──────┬───────┘
                        │
                        ▼
                 ┌──────────────┐
                 │ Save parsed  │
                 │ text to      │
                 │ raw_source   │
                 └──────┬───────┘
                        │ enqueue
                        ▼
                 ┌──────────────┐
                 │ pg-boss:     │
                 │ generate-    │
                 │ embedding    │
                 └──────────────┘
```

### 19.2 Supported Formats [MVP]

| Format | Parser | Library |
|--------|--------|---------|
| PDF | Text extraction | `pdf-parse` (Node) |
| DOCX | XML parsing | `mammoth` |
| TXT/MD | Direct read | Built-in |
| XLSX | Tabular extraction | `xlsx` (SheetJS) |
| Images | OCR | [P2] Tesseract.js or Python worker |

### 19.3 Storage Key Convention

```
{workspace_code}/raw-sources/{year}/{month}/{uuid}.{ext}
{workspace_code}/attachments/{year}/{month}/{uuid}.{ext}
```

---

## 20. Ask AI Flow

### 20.1 RAG Pipeline

```
User Question: "스테이징 서버 배포 방법?"
       │
       ▼
┌─────────────────┐
│ 1. Embed Query  │  ──→  query_embedding = embed("스테이징 서버 배포 방법?")
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 2. Retrieve     │  ──→  Top-K pages by hybrid search
│    (Hybrid)     │       - vector similarity (pgvector)
│                 │       - keyword match (FTS)
│                 │       - permission filter
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 3. Rerank       │  ──→  Score by relevance + freshness + sensitivity
│    + Filter     │       Remove pages user can't access
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│ 4. Generate Answer (LLM)                │
│                                         │
│ System prompt:                          │
│   "You are Jarvis, an internal          │
│    knowledge assistant. Answer ONLY     │
│    based on the provided context.       │
│    Cite sources using [1], [2], etc.    │
│    If unsure, say so. Never invent."    │
│                                         │
│ Context: [retrieved page excerpts]      │
│ Question: "스테이징 서버 배포 방법?"       │
└────────┬────────────────────────────────┘
         │
         ▼
┌─────────────────┐
│ 5. Extract      │  ──→  Parse citations [1], [2] from response
│    Claims       │       Map to source pages
│                 │       Calculate confidence per claim
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 6. Log + Return │  ──→  Log to audit_log
│                 │       Return answer + claims + sources
└─────────────────┘
```

### 20.2 Streaming Response

`/api/ask`는 **Server-Sent Events (SSE)** 로 스트리밍 응답:

```
POST /api/ask
Accept: text/event-stream

event: source
data: {"page_id":"uuid","title":"스테이징 배포 가이드","relevance":0.95}

event: chunk
data: {"text":"스테이징 서버 배포는 "}

event: chunk
data: {"text":"Jenkins를 통해 진행합니다. "}

event: claim
data: {"text":"Jenkins에서 staging-deploy 파이프라인을 실행","source_page_id":"uuid","confidence":0.92}

event: done
data: {"total_tokens":450,"response_ms":3200}
```

클라이언트는 EventSource 또는 fetch + ReadableStream으로 소비. Non-streaming JSON fallback: `Accept: application/json` 헤더 시 전체 응답 대기 후 반환.

### 20.3 Grounding Rules

1. **No hallucination**: AI는 제공된 context 외의 정보를 생성하지 않는다
2. **Citation required**: 모든 사실적 주장에 source reference 첨부
3. **Confidence scoring**: claim당 confidence (0-1) 표시
4. **Secret masking**: context에 secret_ref가 포함된 페이지가 있으면, 해당 secret_ref 값은 마스킹
5. **Sensitivity check**: 사용자 권한으로 접근 불가한 페이지는 context에서 제외

---

## 21. Audit / Logging / Observability

### 21.1 Audit Log Schema

모든 mutation은 `audit_log`에 기록:

| Action | Resource Type | Details (jsonb) |
|--------|-------------|----------------|
| CREATE | knowledge_page | `{page_type, title, sensitivity}` |
| UPDATE | knowledge_page | `{changed_fields: ["body","title"], old_values: {...}}` |
| DELETE | project | `{project_name}` |
| LOGIN | session | `{method: "sso", ip}` |
| LOGOUT | session | `{reason: "user_initiated"}` |
| SEARCH | search | `{query, result_count, response_ms}` |
| SECRET_ACCESS | system_access | `{system_name, access_type, secret_ref}` |
| REVIEW_APPROVE | review_request | `{page_id, reviewer_comment}` |
| EXPORT | report | `{format, filters}` |

### 21.2 OpenTelemetry Setup [MVP]

```typescript
// next.config.ts
experimental: {
  instrumentationHook: true,
}

// instrumentation.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

export function register() {
  const sdk = new NodeSDK({
    traceExporter: new OTLPTraceExporter({
      url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
    }),
    instrumentations: [
      // auto-instrument http, pg, redis
    ],
  });
  sdk.start();
}
```

### 21.3 Log Levels

| Level | Use |
|-------|-----|
| ERROR | Unhandled exceptions, failed jobs, auth failures |
| WARN | Rate limit hits, stale pages detected, deprecated API usage |
| INFO | Request/response summary, job completion, deployment events |
| DEBUG | SQL queries (dev only), search scoring details |

---

## 22. Testing Strategy

### 22.1 Test Pyramid

| Layer | Tool | Scope | Coverage Target | Phase |
|-------|------|-------|----------------|-------|
| Unit | Vitest | Pure functions, utils, search logic | 80%+ | [MVP] |
| Integration | Vitest + testcontainers | DB queries, search adapter, auth flow | Key paths | [MVP] |
| API | Vitest | Route handlers, request/response | All endpoints | [MVP] |
| E2E | Playwright | Critical user flows | 10 core flows | [MVP] |
| Visual | Playwright screenshots | UI regression | Key screens | [P2] |
| Load | k6 | Search, API performance | 5000 concurrent | [P2] |

### 22.2 Critical E2E Flows [MVP]

1. Login → Dashboard → Quick links
2. Create project → Add task → Assign staff
3. Create knowledge page → Submit review → Approve → Published
4. Search → Filter → Click result → View page
5. Ask AI → See answer with sources → Click source
6. Upload file → See attachment on page
7. Admin: Create user → Assign role → User can access
8. System access → Resolve secret_ref (mock)
9. Attendance: Submit leave → Approve
10. Mobile: Same flows on viewport 375px

### 22.3 Test Database

```typescript
// Integration tests use testcontainers
import { PostgreSqlContainer } from '@testcontainers/postgresql';

const container = await new PostgreSqlContainer('pgvector/pgvector:pg16')
  .withDatabase('jarvis_test')
  .start();
```

---

## 23. Data Migration Strategy

### 23.1 Migration Mapping

| Legacy Table | Jarvis Table | Transform |
|-------------|-------------|-----------|
| TSYS305_NEW | user + workspace | Split enterCd → workspace.code, sabun → employee_id |
| TSYS301_NEW | menu_item | Flatten tree, add route_path from legacy menuPath |
| TSYS005_NEW | code_group + code_item | Split grcodeCd → group, code → item |
| TCOM_FILE | raw_source + attachment | Move files to MinIO, update storage_key |
| TCOM_COMPANY | company | Direct mapping, companyCd → code |
| TDEV_PROJECT | project | projectId → uuid, composite FK → uuid FK |
| TDEV_MANAGE | project_task | Composite PK → uuid PK, requestCompanyCd → company FK |
| TDEV_INQUIRY | project_inquiry | inSeq → uuid |
| TDEV_STAFF | project_staff | NO → uuid, user lookup by sabun |
| TMAN_ATTENDANCE | attendance | SEQ → uuid, sabun → user.id lookup |
| TMAN_OUTMANAGE | out_manage | sabun → user.id lookup |
| TMAN_OUTMANAGE_TIME | out_manage_detail | Parent FK update |
| TMAN_INFRA_MANAGE | system + system_access | **Critical: extract credentials → secret_ref** |
| TMAN_INFRA_PAGE | knowledge_page (type: system) | Content → markdown page |
| TSYS_LOG | audit_log | Direct mapping + enrichment |

### 23.2 Critical: Infra Credential Migration

```
Legacy TMAN_INFRA_MANAGE:
  loginInfo      ──→  system_access.login_guide (방법만) + secret_ref (비밀값)
  dbConnectInfo  ──→  system_access (type: db) + secret_ref
  dbUserInfo     ──→  system_access + secret_ref
  vpnFileSeq     ──→  system_access (type: vpn) + secret_ref

Process:
1. Extract credential fields from TMAN_INFRA_MANAGE
2. Create SOPS-encrypted secret files
3. Generate secret_ref URIs
4. Create system_access rows with secret_ref only
5. Verify: no plain credentials in any searchable field
```

### 23.3 Migration Script Structure

```typescript
// scripts/migrate-legacy.ts
async function migrateLegacy() {
  // Phase 1: Read Oracle data (via oracledb driver or exported CSV)
  // Phase 2: Transform with mapping rules
  // Phase 3: Load into PostgreSQL via Drizzle
  // Phase 4: Move files to MinIO
  // Phase 5: Generate embeddings for knowledge pages
  // Phase 6: Validate counts and integrity
}
```

### 23.4 Validation Checklist

- [ ] User count matches (TSYS305_NEW vs user)
- [ ] Project count matches
- [ ] All files accessible in MinIO
- [ ] No plain credentials in knowledge_page.body or system_access.login_guide
- [ ] Menu structure renders correctly
- [ ] Code dropdowns populate correctly
- [ ] Search returns results for known documents
- [ ] All audit logs migrated

---

## 24. Cutover Plan

### 24.1 Timeline

```
T-14 days: Migration rehearsal #1
  - Full Oracle export
  - Run migration script against test PG
  - Validate checklist
  - Measure migration time
  - Fix issues

T-7 days: Migration rehearsal #2
  - Second full rehearsal
  - UAT with select users
  - Performance testing
  - Fix remaining issues

T-3 days: Communication
  - Announce cutover window
  - Freeze non-critical changes in legacy
  - Final data freeze time agreed

T-0 (Cutover day):
  H-4: Legacy freeze (read-only)
  H-3: Final Oracle export
  H-2: Run migration script
  H-1: Validation checklist
  H-0: DNS/reverse proxy switch to Jarvis
  H+1: Smoke test by core team
  H+2: Open to all users
  H+4: Monitoring, fix critical issues
  H+24: Confirm success or trigger rollback

T+7 days: Decommission legacy (keep read-only for reference)
```

### 24.2 Rollback Criteria

자동 롤백 조건 (any of):
1. Login success rate < 95% for 30 minutes
2. Search returning 0 results for > 50% of queries
3. Any data loss detected
4. Critical security vulnerability discovered

수동 롤백 판단 (PM decision):
1. User complaints exceed threshold
2. Core workflow blocked for > 1 hour
3. Performance degradation > 5x baseline

### 24.3 Rollback Procedure

```
1. Revert DNS/proxy to legacy
2. Legacy exits read-only mode
3. Document delta (changes made in Jarvis during cutover window)
4. Manual delta sync if needed
5. Post-mortem → fix → re-schedule cutover
```

---

## 25. MVP Scope

### 25.1 Feature List

| # | Feature | Pages | APIs | Priority |
|---|---------|-------|------|----------|
| 1 | Auth (SSO + session + RBAC) | 3 | 4 | P0 |
| 2 | Dashboard | 1 | 1 | P0 |
| 3 | Project CRUD + tasks + staff + inquiries | 6 | 8 | P0 |
| 4 | System/Infra + access + deploy + runbook | 5 | 5 | P0 |
| 5 | Knowledge (create/view/edit/history/review) | 5 | 6 | P0 |
| 6 | Knowledge hubs (onboarding/HR/tools/FAQ/glossary) | 5 | 2 | P0 |
| 7 | Search (18 advanced features) | 1 | 1 | P0 |
| 8 | Ask AI (grounded Q&A) | 1 | 1 | P0 |
| 9 | Attendance + out-manage | 2 | 3 | P1 |
| 10 | Profile + quick menu | 1 | 1 | P1 |
| 11 | Admin (users/orgs/menus/codes/companies/audit/review/search-analytics/settings) | 9 | 8 | P0 |
| 12 | File upload | 0 | 2 | P0 |
| 13 | Worker (ingest/embed/compile/stale-check) | 0 | 0 | P0 |
| 14 | Mobile responsive | 0 | 0 | P0 |

**Total: ~32 pages, ~42 API endpoints**

### 25.2 MVP Fallback Scope (if time runs out)

시간 부족 시 P0 내에서도 우선순위를 둔다:

| Tier | Features | Cut if behind by |
|------|----------|-----------------|
| **Must Ship** | Auth, Dashboard, Projects, Systems, Knowledge (view/create), Admin (users/orgs), Audit | Never cut |
| **Should Ship** | Search (basic FTS + filter + highlight), Knowledge (edit/history/review), File upload, Attendance | Day 5 assessment |
| **Nice to Ship** | Ask AI, Search (vector/hybrid/synonym/explain/fallback), Search analytics, Mobile polish | Day 4 assessment |

### 25.3 What's NOT in MVP

- Discussion/comment threads
- Notification system (email/push)
- Approval workflow (beyond draft/review)
- Change digest emails
- OpenSearch migration
- Stale page dashboard (auto-check runs but no dedicated UI beyond dashboard widget)
- FAQ auto-generation
- Source document connector (beyond file upload)
- i18n (English)
- Native mobile app
- SSO multi-provider (single provider in MVP)

---

## 26. Phase 2 Scope

| # | Feature | Rationale |
|---|---------|-----------|
| 1 | Discussion/Comments on pages | Collaboration after MVP stabilizes |
| 2 | Notification system | Email digest, Slack webhook, push |
| 3 | Approval workflow (multi-step) | Beyond simple draft/review |
| 4 | Stale page dashboard | Dedicated management UI |
| 5 | Change digest (weekly email) | Worker already generates |
| 6 | FAQ auto-generation | AI + popular search analysis |
| 7 | Source document connector | Confluence, Google Docs, SharePoint sync |
| 8 | HashiCorp Vault integration | Replace SOPS |
| 9 | ABAC fine-grained permissions | Beyond role-based |
| 10 | Korean morphological analysis | pgroonga or OpenSearch nori |
| 11 | Visual regression tests | Playwright screenshots |
| 12 | Load testing | k6 for 5000 concurrent |
| 13 | Kubernetes Helm chart | Scale beyond single Docker Compose |

---

## 27. Final State

| # | Feature | Trigger Condition |
|---|---------|------------------|
| 1 | OpenSearch migration | Documents > 100K OR faceted search latency > 500ms |
| 2 | Python OCR worker | Image-heavy documents require Tesseract/PaddleOCR |
| 3 | Python model serving | Custom fine-tuned models for domain-specific Q&A |
| 4 | Real-time collaboration | Simultaneous page editing (CRDT/OT) |
| 5 | Role-based recommendations | ML-based content recommendation |
| 6 | HR document change detection | Diff detection on policy updates |
| 7 | Multi-language support | i18n for English/Japanese |
| 8 | Mobile native app | React Native if PWA insufficient |
| 9 | API gateway | Rate limiting, versioning, external API consumers |
| 10 | Data warehouse | Analytics, reporting, BI integration |

---

## 28. Risks / Unknowns / Open Questions

| # | Risk | Impact | Mitigation | Status |
|---|------|--------|-----------|--------|
| R1 | 1-week timeline for 32 pages + 42 APIs | Incomplete features at cutover | Parallel agent development, P0 features first, cut P1 if needed | Open |
| R2 | Korean FTS accuracy with `simple` parser | Poor search recall | pg_trgm compensates; upgrade to pgroonga in P2 | Accepted |
| R3 | SSO IdP unknown | Auth implementation blocked | Build OIDC abstraction, test with Keycloak dev instance | Open |
| R4 | Oracle data export mechanism | Migration script dependency | Support both oracledb driver and CSV export | Open |
| R5 | LLM API cost for 5000 users | High monthly cost | Rate limiting, caching frequent questions, token budgets | Open |
| R6 | Legacy data quality | Migration failures | Validation checklist, rehearsal rounds, fallback to manual fix | Mitigated |
| R7 | Single developer bottleneck | Review/merge conflicts | AI agents work on isolated feature slices, minimal cross-deps | Mitigated |
| R8 | MinIO single point of failure | Data loss | Docker volume backup, RAID on host, replication in P2 | Accepted |
| R9 | Embedding generation latency | Slow page creation | Async via pg-boss, user sees page immediately, embedding generates in background | Mitigated |
| R10 | Secret_ref resolution performance | Slow access page load | Cache resolved secrets in Redis with short TTL (5 min) + audit log | Mitigated |

---

## 29. ADRs

### ADR-001: Big-bang rewrite over incremental migration

**Status:** Accepted
**Context:** Legacy SSMS is Spring Boot 2.7.18/Java 8/Oracle 11g XE. Could wrap legacy and incrementally replace.
**Decision:** Big-bang rewrite with new domain model.
**Rationale:** Legacy has fundamental issues (credentials in DB, dynamic routing, Oracle dependency) that can't be incrementally fixed. Screen count (~32) is manageable for rewrite. Wrapping adds complexity without solving core problems.
**Consequences:** Higher risk at cutover, but clean architecture from day 1. Requires migration rehearsals.

### ADR-002: TypeScript single-stack over polyglot

**Status:** Accepted
**Context:** Could use Python (FastAPI) for backend, Java (Spring Boot), or TypeScript (Next.js).
**Decision:** TypeScript single-stack with Next.js App Router.
**Rationale:** Screen count < 30, so separate backend adds deployment surface without benefit. Next.js handles SSR + API + MDX. Type sharing between UI and API eliminates DTO duplication. Python worker reserved for future OCR/model serving only.
**Consequences:** LLM SDK availability in Node (Claude/OpenAI both have Node SDKs). Some document parsing libraries are weaker in Node vs Python.

### ADR-003: PostgreSQL FTS + pgvector over OpenSearch

**Status:** Accepted (with migration path)
**Context:** 5000 users, ~100K documents projected. OpenSearch provides better scale but adds service complexity.
**Decision:** Start with PostgreSQL FTS + pgvector + pg_trgm. Search adapter abstraction allows OpenSearch swap later.
**Rationale:** PostgreSQL FTS handles 100K documents with proper indexing. 18 advanced search features implemented in PG. Eliminates OpenSearch Docker service, sync logic, and operational overhead in MVP. search adapter interface ensures clean migration when scale demands it.
**Trigger for migration:** Documents > 100K OR P95 search latency > 500ms OR complex faceting requirements exceed GROUP BY.

### ADR-004: secret_ref pattern over encrypted fields

**Status:** Accepted
**Context:** Legacy stores credentials as plain text in DB fields. Could encrypt at field level or use external secret manager.
**Decision:** External secret manager with secret_ref pointers.
**Rationale:** OWASP recommends centralized secret management with rotation capability. Field-level encryption still puts ciphertext in search index/backups. secret_ref ensures credentials never enter the application data plane.
**Consequences:** Additional SOPS tooling (MVP) or Vault service (P2). Every credential access requires resolution step.

### ADR-005: File-system routing over DB-driven dynamic routes

**Status:** Accepted
**Context:** Legacy Vue app uses `/menu/tree` API to dynamically construct routes at runtime.
**Decision:** Next.js App Router file-system routing with DB controlling only display/visibility.
**Rationale:** Dynamic routing makes routes untestable, uncacheable, and bypasses static analysis. File-system routes are type-safe, tree-shakeable, and analyzed at build time. Menu DB table only controls display order, icons, and role-based visibility.
**Consequences:** Adding a new page requires code change + deployment (not just DB insert). This is acceptable and preferred for a 32-page app.

### ADR-006: Drizzle ORM over Prisma

**Status:** Accepted
**Context:** Both are TypeScript ORMs. Prisma has larger ecosystem, Drizzle has better SQL control.
**Decision:** Drizzle ORM + drizzle-kit for migrations.
**Rationale:** Drizzle generates SQL that maps 1:1 to what you write. Critical for PostgreSQL FTS queries (`ts_rank_cd`, `setweight`, `to_tsvector`) which need raw SQL control. Prisma's query engine adds a Rust binary and its own query layer. Drizzle's schema-as-code approach aligns with migration-driven development.
**Consequences:** Smaller community than Prisma. Some patterns require manual SQL. Acceptable given our search requirements.

### ADR-007: pg-boss over BullMQ for background jobs

**Status:** Accepted
**Context:** Need background job processing for ingest, embedding, stale-check.
**Decision:** pg-boss (PostgreSQL-based) over BullMQ (Redis-based).
**Rationale:** pg-boss uses PostgreSQL SKIP LOCKED for exactly-once delivery with transactional guarantees. Job enqueue and data mutation can share the same transaction. BullMQ requires Redis as additional infrastructure. We already have Redis for sessions/cache but job queue reliability benefits from DB-backed approach.
**Consequences:** Job throughput limited by PostgreSQL connection pool. Acceptable for our workload (~100 jobs/hour).

### ADR-008: Redis for sessions over JWT stateless

**Status:** Accepted
**Context:** Legacy uses JWT cookie auth (stateless). Could continue stateless or use server-side sessions.
**Decision:** Redis-backed server-side sessions with SSO integration.
**Rationale:** JWT stateless can't be revoked without a blocklist (which needs a store anyway). Server-side sessions allow immediate revocation, role changes take effect on next request, and session data doesn't bloat cookies. Redis provides fast session lookup with TTL-based expiry.
**Consequences:** Redis becomes a dependency. Acceptable since we also use it for code cache and rate limiting.

### ADR-009: UUID primary keys over composite keys

**Status:** Accepted
**Context:** Legacy uses composite PKs (enterCd + sabun, enterCd + projectId + ...). Could use serial IDs or UUIDs.
**Decision:** UUID v7 (time-sortable) as primary keys for all tables.
**Rationale:** UUID eliminates composite key complexity across 28 tables. UUID v7 is time-sortable so B-tree index performance is comparable to serial. Multi-tenant isolation via workspace_id FK (not PK composition). Enables easier cross-table references and API design.
**Consequences:** Slightly larger index size than serial. UUID v7 mitigates B-tree fragmentation issue of random UUID v4.

### ADR-010: shadcn/ui over PrimeVue/MUI

**Status:** Accepted
**Context:** Legacy uses PrimeVue. Could use PrimeReact, MUI, Ant Design, or shadcn/ui.
**Decision:** shadcn/ui + Tailwind CSS + TanStack Table.
**Rationale:** shadcn/ui components are copied into the project (not a dependency), allowing full customization. Tailwind utility classes ensure consistent spacing/color without CSS-in-JS runtime. TanStack Table is headless, supporting server-side pagination without opinionated UI. MUI/PrimeReact bundle sizes are 3-5x larger. Mobile-responsive patterns are easier with Tailwind breakpoints.
**Consequences:** More initial setup than pre-built component libraries. Component catalog must be built by the team (or AI agents).

### ADR-011: Hybrid search scoring over single-method search

**Status:** Accepted
**Context:** Could use FTS-only, vector-only, or hybrid approach for search ranking.
**Decision:** App-layer hybrid scoring: `0.4*fts + 0.3*vector + 0.15*trgm + 0.15*freshness`.
**Rationale:** FTS alone misses semantic similarity. Vector alone misses exact keyword matches. Hybrid captures both. App-layer fusion (vs DB-layer) allows per-query weight tuning and A/B testing. Weights are configurable per workspace.
**Consequences:** Two queries per search (FTS + vector). Acceptable latency with proper indexing. Fallback chain handles edge cases.

### ADR-012: Multi-tenant with workspace_id FK over schema-per-tenant

**Status:** Accepted
**Context:** Legacy uses enterCd as tenant boundary. Could use separate schemas, separate databases, or shared schema with FK.
**Decision:** Shared schema with workspace_id FK on all tenant-scoped tables.
**Rationale:** 5000-user deployment typically has 1-5 workspaces (company + subsidiaries). Schema-per-tenant adds migration complexity. Shared schema with proper indexes handles this scale. Row-level security (RLS) can be added in P2 for additional isolation.
**Consequences:** Every query must include workspace_id filter. Enforced via Drizzle query builder wrapper.

---

## 30. Product Name & Repo Slug Suggestions

제품 이름은 이미 **Jarvis**로 확정:

| Type | Value |
|------|-------|
| Product name | **Jarvis** |
| Repo slug | `jarvis` |
| GitHub URL | `github.com/qoxmfaktmxj/jarvis` (already created) |
| Docker image prefix | `jarvis-web`, `jarvis-worker` |
| npm scope | `@jarvis/` (for monorepo packages) |
| DB name | `jarvis` |
| MinIO bucket | `jarvis-{workspace_code}` |
| Session prefix | `jarvis:session:` |
| OTel service name | `jarvis-web`, `jarvis-worker` |

---

## Recommended Implementation Order

### 1-Week Sprint Plan (Day 1-7)

```
Day 1 (Foundation - Sequential):
  ┌─────────────────────────────────────────────────────────┐
  │  1. Monorepo scaffold (pnpm + turbo + tsconfig)          │
  │  2. Docker Compose (PG + Redis + MinIO)                  │
  │  3. packages/db: Drizzle schema + migrations (all 28 tables) │
  │  4. packages/auth: SSO client + session + RBAC middleware │
  │  5. packages/shared: Types + Zod schemas + constants      │
  │  6. apps/web: Next.js scaffold + AppShell layout          │
  │     (Sidebar + Topbar + MobileNav + theme)                │
  │  7. packages/search: Adapter interface + PG implementation │
  │     skeleton                                              │
  └─────────────────────────────────────────────────────────┘

Day 2-4 (Features - Maximum Parallel):
  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
  │ Agent 1:          │  │ Agent 2:          │  │ Agent 3:          │
  │ Dashboard +       │  │ Projects          │  │ Systems/Infra     │
  │ Profile           │  │ (list/create/     │  │ (list/detail/     │
  │                   │  │  detail/tasks/    │  │  access/deploy/   │
  │                   │  │  staff/inquiries) │  │  runbook)         │
  └──────────────────┘  └──────────────────┘  └──────────────────┘

  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
  │ Agent 4:          │  │ Agent 5:          │  │ Agent 6:          │
  │ Knowledge         │  │ Search            │  │ Ask AI            │
  │ (editor/viewer/   │  │ (18 advanced      │  │ (RAG pipeline,    │
  │  MDX/history/     │  │  features,        │  │  grounded Q&A,    │
  │  review/hubs)     │  │  all 18 items)    │  │  claims/sources)  │
  └──────────────────┘  └──────────────────┘  └──────────────────┘

  ┌──────────────────┐  ┌──────────────────┐
  │ Agent 7:          │  │ Agent 8:          │
  │ Attendance +      │  │ Admin Panel       │
  │ HR docs           │  │ (users/orgs/      │
  │ (leave/out-manage)│  │  menus/codes/     │
  │                   │  │  companies/audit/ │
  │                   │  │  review/search-   │
  │                   │  │  analytics/settings│
  └──────────────────┘  └──────────────────┘

Day 5 (Integration - Sequential):
  ┌─────────────────────────────────────────────────────────┐
  │  1. apps/worker: pg-boss setup + all job handlers        │
  │  2. File upload (MinIO presigned URL + ingest pipeline)  │
  │  3. Draft/Review/Publish flow integration                │
  │  4. Cross-feature: search indexing triggers              │
  │  5. Cross-feature: audit logging middleware              │
  │  6. Secret management: SOPS setup + resolver             │
  └─────────────────────────────────────────────────────────┘

Day 6 (Quality):
  ┌─────────────────────────────────────────────────────────┐
  │  1. Mobile responsive pass (all pages at 375px/768px)    │
  │  2. E2E tests: 10 critical flows (Playwright)            │
  │  3. Data migration script (Oracle → PG)                  │
  │  4. Seed data for demo                                   │
  │  5. Bug fixes from testing                               │
  └─────────────────────────────────────────────────────────┘

Day 7 (Deploy):
  ┌─────────────────────────────────────────────────────────┐
  │  1. Docker production build (multi-stage)                │
  │  2. Docker Compose production config                     │
  │  3. nginx reverse proxy config                           │
  │  4. Health check endpoint                                │
  │  5. Migration rehearsal #1                               │
  │  6. Smoke test on production-like env                    │
  │  7. Documentation: CLAUDE.md, README, .env.example       │
  └─────────────────────────────────────────────────────────┘
```

### Dependency Graph

```
Foundation (Day 1)
    │
    ├── DB Schema + Auth ──────────────────────┐
    │                                          │
    ▼                                          ▼
Feature Slices (Day 2-4)              Search Package (Day 2-4)
    │                                          │
    ▼                                          ▼
Integration + Worker (Day 5) ◄─────── All features merge
    │
    ▼
Quality + Tests (Day 6)
    │
    ▼
Deploy (Day 7)
```

---

*End of Design Specification*
