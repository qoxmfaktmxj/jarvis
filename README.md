# Jarvis

AI 비서와 사내 지식 검색이 결합된 사내 업무 시스템 모노레포입니다.

Jarvis는 단순한 포털이 아니라, **사내 위키/시스템/프로젝트/근태 데이터를 한 곳에서 조회하고**, **검색과 RAG 기반 질의응답으로 필요한 정보를 빠르게 찾는 것**을 목표로 합니다. 현재 레포는 Next.js 기반 웹 앱, 문서 인제스트와 임베딩을 처리하는 워커, 공통 비즈니스 로직 패키지로 분리된 구조를 가지고 있습니다.

---

## 1. 이 프로젝트가 해결하려는 문제

사내 업무 시스템은 보통 아래 문제가 동시에 존재합니다.

- 문서, 프로젝트, 시스템 정보가 여러 저장소에 흩어져 있음
- 검색이 약해서 필요한 정보를 찾는 시간이 길어짐
- 권한별로 노출해야 하는 정보 수준이 다름
- 파일 업로드 후 검색/AI 활용까지 이어지는 파이프라인이 없음
- 대시보드, 근태, 프로젝트, 시스템 정보가 서로 분절되어 있음

Jarvis는 이 문제를 아래 방식으로 풀려고 합니다.

- **사내 지식 베이스**를 중심으로 문서와 운영 정보를 구조화
- **PostgreSQL FTS + pg_trgm + pgvector** 기반 하이브리드 검색 제공
- **AI 질문/답변(Ask AI)** 에 검색 결과를 근거로 붙여 출처 포함 응답 제공
- **OIDC SSO + RBAC** 기반으로 권한별 정보 접근 제어
- **백그라운드 워커**를 통해 업로드 파일 파싱, 요약, 임베딩, 정기 점검 자동화

---

## 2. 현재 레포 기준 주요 모듈

### 웹 앱 (`apps/web`)

주요 화면/영역은 아래와 같습니다.

- Dashboard
- Ask AI
- Search
- Knowledge Base
- Projects
- Systems
- Attendance
- Admin
- Profile
- Login / SSO

### 백그라운드 워커 (`apps/worker`)

워커는 아래 작업을 담당합니다.

- 업로드 파일 인제스트
- 텍스트 추출(PDF, DOCX, text/json 등)
- 문서 chunk 분할
- 임베딩 생성 및 claim 저장
- 문서 summary 컴파일
- 오래된 문서(stale page) 점검
- 인기 검색 집계
- 오래된 로그/버전 정리

### 공통 패키지 (`packages/*`)

- `@jarvis/ai` : 질의 임베딩, RAG 검색, 답변 생성, SSE 이벤트 타입
- `@jarvis/auth` : OIDC, 세션, RBAC
- `@jarvis/db` : Drizzle 스키마, Postgres/Redis 연결, 마이그레이션
- `@jarvis/search` : 검색 어댑터, 쿼리 파서, 랭킹, 하이라이팅, synonym/fallback
- `@jarvis/secret` : secret reference 타입 및 resolver 추상화
- `@jarvis/shared` : 권한 상수, 공통 타입, validation

---

## 3. 아키텍처 개요

```mermaid
flowchart LR
    U[User Browser] --> W[Next.js Web App]
    W --> OIDC[OIDC SSO]
    W --> PG[(PostgreSQL + pgvector)]
    W --> R[(Redis)]
    W --> M[(MinIO)]
    W --> A[Anthropic]
    W --> Q[PgBoss Queue]

    Q --> WK[Worker]
    WK --> M
    WK --> PG
    WK --> OAI[OpenAI Embeddings]
```

### 흐름 요약

1. 사용자는 OIDC SSO로 로그인합니다.
2. 웹 앱은 Redis 기반 세션으로 인증 상태를 유지합니다.
3. 검색은 PostgreSQL의 FTS, trigram, freshness 점수를 조합해 수행합니다.
4. Ask AI는 질문 임베딩 → 관련 claim 검색 → LLM 생성 → 출처 스트리밍 응답 흐름으로 동작합니다.
5. 파일 업로드 후 워커가 MinIO 객체를 읽어 파싱/임베딩/인덱싱을 진행합니다.

---

## 4. 기술 스택

| 영역 | 사용 기술 |
|---|---|
| 모노레포 | pnpm workspace, Turborepo |
| 웹 | Next.js 15, React 19, TypeScript |
| 스타일/UI | Tailwind CSS 4, Lucide, React Hook Form |
| DB | PostgreSQL 16, Drizzle ORM |
| 검색 | PostgreSQL FTS, `pg_trgm`, `pgvector` |
| 세션/캐시 | Redis |
| 오브젝트 스토리지 | MinIO |
| 잡 큐 | pg-boss |
| 문서 파싱 | pdfjs-dist, mammoth |
| AI | OpenAI Embeddings, Anthropic Generation |
| 인증 | OIDC (`openid-client`) |
| 테스트 | Vitest (단위), Playwright (E2E) |

---

## 5. 디렉터리 구조

```text
.
├─ apps/
│  ├─ web/                 # Next.js 웹 애플리케이션 (포트 3010)
│  │  ├─ app/              # App Router pages / API routes / server actions
│  │  ├─ components/       # 도메인 UI 컴포넌트
│  │  ├─ e2e/              # Playwright E2E 테스트
│  │  └─ lib/              # queries, hooks, server auth helpers
│  └─ worker/              # 문서 인제스트/임베딩/정기 작업 워커
│     └─ src/
│        ├─ jobs/          # ingest, embed, compile, cleanup 등
│        └─ lib/           # MinIO, PDF parser, text chunker
├─ packages/
│  ├─ ai/                  # Ask AI / embedding / citation stream
│  ├─ auth/                # OIDC, session, RBAC
│  ├─ db/                  # Drizzle schema, migrations, seed
│  ├─ search/              # PostgreSQL 기반 검색 엔진
│  ├─ secret/              # secret reference abstraction
│  └─ shared/              # constants / types / validation
├─ docker/
│  ├─ init-db/             # PostgreSQL extension bootstrap SQL
│  ├─ secrets/             # .gitignore'd secret files (prod only)
│  ├─ Dockerfile.web       # Next.js 멀티스테이지 빌드
│  ├─ Dockerfile.worker    # Worker 멀티스테이지 빌드
│  ├─ nginx.conf           # Nginx 프록시 설정
│  ├─ entrypoint.sh        # Docker secret → env var 주입
│  ├─ docker-compose.yml   # 프로덕션 (postgres/redis/minio/web/worker/nginx)
│  └─ docker-compose.dev.yml  # 개발 오버라이드 (호스트 포트 노출, env 기반 시크릿)
├─ docs/
│  └─ superpowers/         # 설계 메모 / 스펙 문서
├─ package.json
├─ pnpm-workspace.yaml
├─ turbo.json
└─ .env.example
```

---

## 6. 개발 환경 요구사항

권장 버전은 아래와 같습니다.

- Node.js **22+**
- pnpm **9+**
- Docker / Docker Compose
- PostgreSQL, Redis, MinIO를 직접 띄우지 않는다면 Docker Compose 사용 권장
- OIDC Provider (예: Keycloak)
- Anthropic API Key
- OpenAI API Key

---

## 7. 빠른 시작

### 7.1 저장소 준비

```bash
git clone https://github.com/qoxmfaktmxj/jarvis.git
cd jarvis
cp .env.example .env
```

`.env.example`는 최소 예시 수준이므로, 실제 실행 전 아래 환경변수 표를 기준으로 보강하는 것을 권장합니다.

### 7.2 인프라 실행

개발 환경 (Next.js는 `pnpm dev`로 별도 실행):

```bash
docker compose -f docker/docker-compose.yml -f docker/docker-compose.dev.yml up -d postgres redis minio
```

Keycloak(로컬 OIDC 개발용)까지 포함하려면:

```bash
docker compose -f docker/docker-compose.yml -f docker/docker-compose.dev.yml up -d postgres redis minio keycloak
```

개발 환경에서 실행되는 서비스 (호스트 포트):

| 서비스 | 호스트 포트 |
|--------|------------|
| PostgreSQL | `5436` |
| Redis | `6380` |
| MinIO API | `9100` |
| MinIO Console | `9101` |
| Keycloak | `18080` |

> 프로덕션 배포는 [17. 운영/배포 시 고려사항](#17-운영배포-시-고려사항) 참고.

### 7.3 의존성 설치

```bash
pnpm install
```

### 7.4 데이터베이스 마이그레이션

```bash
pnpm db:generate
pnpm db:migrate
```

초기 확장(extension)은 Docker의 `init-db/01-extensions.sql`에서 준비됩니다.

### 7.5 애플리케이션 실행

웹 앱 (포트 `3010`):

```bash
pnpm --filter @jarvis/web dev
```

워커:

```bash
pnpm --filter @jarvis/worker dev
```

루트에서 동시 실행이 필요하면 작업 환경에 맞는 별도 스크립트를 추가하는 것을 권장합니다.

---

## 8. 환경변수 가이드

아래는 현재 코드 경로 기준으로 **실제 사용이 확인되는 핵심 변수**입니다.

| 변수명 | 필수 | 설명 |
|---|---:|---|
| `DATABASE_URL` | 예 | PostgreSQL 연결 문자열 |
| `REDIS_URL` | 예 | Redis 연결 문자열 |
| `MINIO_ENDPOINT` | 예 | MinIO 호스트 |
| `MINIO_PORT` | 예 | MinIO 포트 |
| `MINIO_USE_SSL` | 아니오 | `true` 이면 SSL 사용 |
| `MINIO_ACCESS_KEY` | 예 | MinIO 접근 키 |
| `MINIO_SECRET_KEY` | 예 | MinIO 시크릿 키 |
| `MINIO_BUCKET` | 아니오 | 버킷 이름 (기본값: `jarvis-files`) |
| `OIDC_ISSUER` | 예 | OIDC issuer URL |
| `OIDC_CLIENT_ID` | 예 | OIDC client id |
| `OIDC_CLIENT_SECRET` | 예 | OIDC client secret |
| `NEXTAUTH_URL` | 예 | OIDC callback URL 구성에 사용되는 앱 외부 URL |
| `SESSION_SECRET` | 예 | 세션 서명용 비밀키 (32자 이상) |
| `ANTHROPIC_API_KEY` | 예 | Ask AI 답변 생성용 (Anthropic) |
| `OPENAI_API_KEY` | 예 | 질문/문서 임베딩 생성용 (OpenAI) |
| `NODE_ENV` | 아니오 | `development`, `production` 등 |

예시 (개발 환경 기준):

```env
DATABASE_URL=postgresql://jarvis:jarvispass@localhost:5436/jarvis
REDIS_URL=redis://localhost:6380

MINIO_ENDPOINT=localhost
MINIO_PORT=9100
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=jarvisadmin
MINIO_SECRET_KEY=jarvispassword
MINIO_BUCKET=jarvis-files

# 로컬 Keycloak 기준 — 운영은 외부 URL로 교체
OIDC_ISSUER=http://localhost:18080/realms/jarvis
OIDC_CLIENT_ID=jarvis-web
OIDC_CLIENT_SECRET=change-me
NEXTAUTH_URL=http://localhost:3010

SESSION_SECRET=dev-session-secret-32-chars-min!!

ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
```

---

## 9. 주요 스크립트

루트 스크립트:

```bash
pnpm dev
pnpm build
pnpm test
pnpm lint
pnpm type-check
pnpm db:generate
pnpm db:migrate
pnpm db:push
pnpm db:studio
```

웹 앱 전용:

```bash
pnpm --filter @jarvis/web dev
pnpm --filter @jarvis/web build
pnpm --filter @jarvis/web test
```

워커 전용:

```bash
pnpm --filter @jarvis/worker dev
pnpm --filter @jarvis/worker build
pnpm --filter @jarvis/worker start
```

---

## 10. 데이터 모델 개요

Jarvis는 단순 게시판 구조가 아니라, 업무 도메인별 스키마를 나누어 두었습니다.

### 10.1 Knowledge

- `knowledge_page`
- `knowledge_page_version`
- `knowledge_claim`
- `knowledge_page_owner`
- `knowledge_page_tag`

문서 본문은 version으로 관리하고, 검색/AI를 위한 claim 단위 분해와 embedding 저장을 지원합니다.

### 10.2 Project

- `project`
- `project_task`
- `project_inquiry`
- `project_staff`

### 10.3 System

- `system`
- `system_access`

시스템 접근 정보는 실제 비밀번호 대신 `*_ref` 형태의 참조값을 저장하는 방향으로 설계되어 있습니다.

### 10.4 Attendance

- `attendance`
- `out_manage`
- `out_manage_detail`

### 10.5 Search / Audit / File

- `search_log`
- `search_synonym`
- `popular_search`
- `audit_log`
- `raw_source`
- `attachment`
- `review_request`

---

## 11. 검색 설계

현재 검색 계층은 PostgreSQL 위에서 동작합니다.

### 검색 요소

- Full-text search (`search_vector`)
- trigram similarity (`pg_trgm`)
- freshness score
- synonym expansion
- facet counting
- admin explain view
- fallback chain (FTS → trigram 등)

### 검색 결과에서 기대하는 것

- 오타에 비교적 강함
- 최신 문서 우선 보정 가능
- 민감도/페이지 타입 필터 가능
- 추후 외부 검색엔진으로 확장 가능하도록 `SearchAdapter` 추상화 유지

---

## 12. Ask AI 설계

Ask AI는 “LLM 단독 답변”이 아니라, **사내 지식 기반 검색 결과를 근거로 한 RAG** 흐름입니다.

### 처리 순서

1. 사용자의 질문을 임베딩
2. `knowledge_claim` 벡터 유사도 검색
3. 관련 page에 대한 FTS 재랭킹
4. sensitivity/권한 조건에 따라 문서 필터링
5. 상위 claim을 context로 조립
6. Anthropic 모델로 답변 생성
7. `[source:N]` 기반 출처 추출
8. SSE로 텍스트/소스/완료 이벤트 스트리밍

### 장점

- 답변에 근거를 붙일 수 있음
- 사내 문서 기반 응답이라 일반 챗봇보다 통제 가능
- SSE 기반으로 사용자 경험이 자연스러움

---

## 13. 파일 업로드와 인제스트 파이프라인

현재 구조상 파일 처리 흐름은 아래와 같습니다.

1. 파일이 MinIO에 저장됨
2. 웹 API가 `raw_source`/`attachment` 메타데이터를 저장함
3. `pg-boss` 큐에 `ingest` 작업 등록
4. 워커가 MinIO에서 파일을 읽어 텍스트를 추출함
5. 추출 결과를 `parsed_content`에 저장
6. 이후 `embed` / `compile` 작업을 통해 검색/AI용 데이터를 생성함

### 지원 포맷

- PDF
- DOCX
- text/
- JSON
- 기타 바이너리 파일은 placeholder 처리

---

## 14. 인증 / 인가

### 인증

- OIDC discovery 사용
- Authorization Code + PKCE
- `state`, `nonce` 검증
- Redis 기반 세션 저장
- `sessionId` 쿠키 사용

### 인가

- 역할(Role)과 권한(Permission) 개념을 둘 다 사용
- 화면/API 진입 시 권한 검사
- 문서 민감도(`PUBLIC`, `INTERNAL`, `RESTRICTED`, `SECRET_REF_ONLY`)를 고려한 접근 제어

---

## 15. 백그라운드 작업

워커가 등록하는 잡은 아래와 같습니다.

| 잡 이름 | 설명 |
|---|---|
| `ingest` | 업로드 파일 텍스트 추출 |
| `embed` | knowledge claim 임베딩 생성 |
| `compile` | summary 생성 및 검색 준비 |
| `check-freshness` | 오래된 문서 점검 |
| `aggregate-popular` | 인기 검색 집계 |
| `cleanup` | 오래된 로그/버전 정리 |

스케줄 작업 예시:

- stale page check: 매일 09:00
- popular search aggregation: 매주 일요일 00:00
- cleanup: 매월 1일 00:00

---

## 16. 테스트와 품질 관리

레포에는 아래 성격의 테스트 파일이 포함되어 있습니다.

- AI 관련 테스트
- 검색/대시보드 일부 테스트
- 서버 액션 테스트
- 워커 유틸 테스트

실무 운영 전에는 아래 항목을 추가하는 것을 권장합니다.

- API 통합 테스트
- 권한 시나리오 테스트
- 검색 relevance 회귀 테스트
- GitHub Actions 기반 CI

Playwright E2E 테스트는 `apps/web/e2e/`에 있으며, Redis session inject 방식으로 OIDC 로그인을 우회합니다:

```bash
pnpm --filter @jarvis/web exec playwright test
```

---

## 17. 운영/배포 시 고려사항

### Docker 배포

```bash
# 1. 시크릿 파일 생성
mkdir -p docker/secrets
echo -n 'your-pg-password'   > docker/secrets/pg_password.txt
echo -n 'jarvisadmin'        > docker/secrets/minio_user.txt
echo -n 'jarvispassword'     > docker/secrets/minio_password.txt
echo -n 'your-session-secret-32chars' > docker/secrets/session_secret.txt
echo -n 'sk-ant-...'         > docker/secrets/anthropic_api_key.txt

# 2. 환경변수 설정 (OIDC 등)
export OIDC_ISSUER=https://auth.example.com/realms/jarvis
export OIDC_CLIENT_ID=jarvis-web
export OIDC_CLIENT_SECRET=your-client-secret
export APP_URL=https://jarvis.example.com

# 3. 이미지 빌드 + 기동
bash scripts/start-prod.sh
```

### 권장 사항

- OIDC Provider는 별도 운영 환경(Keycloak 등)으로 분리
- Redis는 세션/레이트리밋 용도로 안정적으로 운영
- PostgreSQL에는 `pgvector`, `pg_trgm`, `unaccent` 확장 설치 필요
- MinIO 또는 S3 호환 스토리지 사용
- Anthropic / OpenAI API key는 `docker/secrets/` 파일로 관리 (`.gitignore` 적용)
- worker를 web과 별도 프로세스로 운영 (compose에서 별도 서비스로 분리)

### 추가로 고려할 것

- observability (request id, queue metrics, tracing)
- secret manager 연동
- 검색 relevance 모니터링
- 테넌트/워크스페이스 분리 검증 자동화

---

## 18. 현재 레포를 기준으로 우선 정리하면 좋은 항목

README 관점에서뿐 아니라 실제 개발 운영 관점에서 아래 항목을 먼저 정리하면 전체 완성도가 빠르게 올라갑니다.

1. 환경변수 문서화 정리 (`OPENAI_API_KEY`, MinIO bucket 정책 포함)
2. 권한 체계 단일화 (role/permission source of truth 명확화)
3. 검색 정렬 및 relevance 계산 로직 재검토
4. 파일 업로드/인제스트/재색인 흐름 문서화
5. seed / bootstrap 스크립트 정리
6. CI와 테스트 커버리지 확장

---

## 19. 추천 개발 순서

1. **인프라 안정화**: DB/Redis/MinIO/OIDC 로컬 부트스트랩 정리
2. **권한 정합성 정리**: role, permission, sensitivity 처리 일관화
3. **검색 안정화**: relevance/facet/popularity 정렬 재검토
4. **AI 품질 개선**: prompt, citation, secret handling, fallback 정리
5. **업로드 파이프라인 마감**: presigned upload, retry, error UI
6. **운영 준비**: 로깅/모니터링/CI/CD/배포 문서화

---

## 20. 마지막 메모

이 레포는 이미 단순 CRUD 수준을 넘어,

- 사내 지식 관리
- 하이브리드 검색
- RAG 기반 AI 응답
- 문서 인제스트 자동화
- 권한 기반 내부 포털

까지 엮으려는 방향성이 분명합니다.

정리만 잘 되면 **“사내 위키 + 검색 + 운영 포털 + AI 비서”** 를 하나의 플랫폼으로 발전시키기 좋은 기반입니다.

