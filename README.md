# Jarvis

AI 비서와 사내 지식 검색이 결합된 사내 업무 시스템 모노레포입니다.

Jarvis는 단순한 포털이 아니라, **사내 위키/시스템/프로젝트/근태 데이터를 한 곳에서 조회하고**, **6개 검색 레인 기반 질의응답으로 필요한 정보를 빠르게 찾는 것**을 목표로 합니다. 현재 레포는 Next.js 기반 웹 앱, 문서 인제스트와 임베딩을 처리하는 워커, 공통 비즈니스 로직 패키지로 분리된 구조를 가지고 있습니다.

---

## 1. 이 프로젝트가 해결하려는 문제

사내 업무 시스템은 보통 아래 문제가 동시에 존재합니다.

- 문서, 프로젝트, 시스템 정보가 여러 저장소에 흩어져 있음
- 검색이 약해서 필요한 정보를 찾는 시간이 길어짐
- 권한별로 노출해야 하는 정보 수준이 다름
- 파일 업로드 후 검색/AI 활용까지 이어지는 파이프라인이 없음
- 대시보드, 근태, 프로젝트, 시스템 정보가 서로 분절되어 있음

Jarvis는 이 문제를 아래 방식으로 풀려고 합니다.

- **4-표면 지식 베이스**(정본/디렉터리/사례/파생)를 중심으로 문서 구조화
- **6-레인 Ask AI 라우터**로 질문 의도에 맞는 최적 검색 경로 선택
- **PostgreSQL FTS + pg_trgm + pgvector** 기반 하이브리드 검색 제공
- **AI 질문/답변(Ask AI)** 에 검색 결과를 근거로 붙여 출처 포함 응답 제공
- **OIDC SSO + RBAC** 기반으로 권한별 정보 접근 제어
- **Graphify 코드 분석 파이프라인**으로 문서/코드 구조 추출

---

## 2. 핵심 아키텍처

### 2.1 4-표면 지식 모델

지식은 4가지 표면으로 분류됩니다.

| 표면 | 설명 | 예시 |
|------|------|------|
| **canonical** | 정본 위키 - 사람이 작성·검토한 정책·절차 | 휴가 신청 절차, HR 규정 |
| **directory** | 디렉터리 - 시스템 링크, 담당자, 양식 | 이수HR 바로가기, 근태 담당자 연락처 |
| **case** | 사례 레이어 - TSVD999 문의/사례 (74,342행) | "권장휴가 언제부터?", "VPN 설정 어떻게?" |
| **derived** | 파생 - Graphify 분석, LLM 생성 콘텐츠 | 코드 구조도, 자동 정리된 FAQ |

### 2.2 6-레인 Ask AI 라우터

사용자의 질문을 한국어 키워드 매칭으로 분석해 최적 검색 경로를 선택합니다.

| 레인 | 시그널 | 우선 검색 대상 |
|------|--------|----------------|
| **text-first** | "정책", "규정", "규칙" | 정본 위키 (knowledge_claim) |
| **graph-first** | "구조", "연결", "아키텍처" | 그래프 노드/엣지 |
| **case-first** | "장애", "에러", "사례", "예전에" | TSVD999 선례 (precedent_case) |
| **directory-first** | "어디서", "링크", "담당자" | 디렉터리 항목 (directory_entry) |
| **action-first** | "어떻게 해", "방법", "신청" | 디렉터리 + 정본 조합 |
| **tutor-first** | "설명해", "가르쳐", "알려줘" | 모든 소스 + 단계별 응답 |

### 2.3 데이터 흐름

```
User Question
  ↓
6-Lane Router (한국어 키워드 매칭)
  ↓
{
  text-first   → knowledge_claim vector search (OpenAI embedding)
  graph-first  → graph_node/edge retrieval (Graphify)
  case-first   → precedent_case vector search (TF-IDF + semantic)
  directory-first → directory_entry ILIKE (keyword match)
  action-first → directory + knowledge hybrid
  tutor-first  → all sources + tutorial mode
}
  ↓
OpenAI gpt-5.4-mini (configurable via ASK_AI_MODEL)
  ↓
Answer + [source:N] citations
  ↓
AnswerCard (structured response with sections)
```

---

## 3. 기술 스택

| 영역 | 기술 |
|------|------|
| **AI 생성** | OpenAI (`gpt-5.4-mini` default, via `ASK_AI_MODEL` env var) |
| **AI 임베딩** | OpenAI (`text-embedding-3-small`) + TF-IDF (사례용) |
| **코드 분석** | Graphify (tree-sitter AST + NetworkX + Leiden/Louvain, 결정론적 파이프라인) |
| **모노레포** | pnpm workspace, Turborepo |
| **웹** | Next.js 15.5, React 19, TypeScript |
| **DB** | PostgreSQL 16 + pgvector + pg_trgm |
| **ORM** | Drizzle ORM |
| **캐시** | Redis |
| **스토리지** | MinIO |
| **잡 큐** | pg-boss |
| **스타일/UI** | Tailwind CSS 4, Lucide, React Hook Form |
| **문서 파싱** | pdfjs-dist, mammoth |
| **인증** | OIDC (`openid-client`) |
| **테스트** | Vitest (단위), Playwright (E2E) |

---

## 4. 주요 모듈

### 웹 앱 (`apps/web`)

주요 화면/영역은 아래와 같습니다.

- Dashboard (Knowledge Debt Radar, Drift Detection)
- Ask AI (6-Lane Router + Simple/Expert Mode)
- Search
- Knowledge Base (4-Surface Editor)
- Projects
- Systems
- Attendance
- Admin
- Profile
- Login / SSO

### 백그라운드 워커 (`apps/worker`)

워커는 아래 작업을 담당합니다.

- 업로드 파일 인제스트 및 텍스트 추출
- 문서 chunk 분할 및 임베딩 생성
- Graphify 코드 분석 파이프라인 (AST + LLM extraction)
- 문서 summary 컴파일
- 오래된 문서(stale page) 점검
- 인기 검색 집계
- 오래된 로그/버전 정리

### 공통 패키지 (`packages/*`)

- `@jarvis/ai` : 6-레인 라우터, 질의 임베딩, RAG 검색, 답변 생성, SSE 이벤트 타입, HR 튜터
- `@jarvis/auth` : OIDC, 세션, RBAC, 권한 기반 필터링
- `@jarvis/db` : Drizzle 스키마 (39개 테이블), 마이그레이션
- `@jarvis/search` : 검색 어댑터, 하이브리드 랭킹, 하이라이팅
- `@jarvis/secret` : secret reference 추상화
- `@jarvis/shared` : 권한 상수, 공통 타입, validation

---

## 5. 데이터 모델 개요

### 5.1 Knowledge (정본 위키)

- `knowledge_page` — 문서 (surface/authority/domain/owner_team/audience/review_cycle_days 포함)
- `knowledge_page_version` — 버전 관리 (MDX 콘텐츠)
- `knowledge_claim` — 검색/AI용 청크 단위 분해 (OpenAI 1536d embedding)
- `knowledge_page_owner` — 소유자 매핑
- `knowledge_page_tag` — 태그

### 5.2 Case (사례 레이어)

- `precedent_case` — TSVD999 문의·사례 (74,342행, TF-IDF 1536d embedding)
- `case_cluster` — TF-IDF 기반 문의 군집 (562개 클러스터)
- `case_cluster_member` — 클러스터 멤버십

### 5.3 Directory (디렉터리)

- `directory_entry` — 시스템 링크, 양식, 담당자, 도구 (31개 항목)

### 5.4 Graph (Graphify 결과)

- `graph_snapshot` — 빌드 작업 메타데이터
- `graph_node` — AST 노드 (파일, 함수, 클래스 등)
- `graph_edge` — 호출/임포트/상속 관계
- `graph_community` — Leiden 감지 커뮤니티

### 5.5 Project

- `project`, `project_task`, `project_inquiry`, `project_staff`

### 5.6 System / Attendance / Search / Audit

- `system`, `system_access`
- `attendance`, `out_manage`, `out_manage_detail`
- `search_log`, `search_synonym`, `popular_search`
- `audit_log`, `raw_source`, `attachment`, `review_request`

**총 39개 테이블**

---

## 6. 환경변수 가이드

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
| `OPENAI_API_KEY` | 예 | Ask AI 답변 + 임베딩 생성용 (OpenAI) |
| `ASK_AI_MODEL` | 아니오 | Ask AI 모델 (기본값: `gpt-5.4-mini`) |
| `GRAPHIFY_BIN` | 아니오 | Graphify 바이너리 경로 (기본값: `graphify`). 결정론적 — API 키 불필요 |
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

OIDC_ISSUER=https://auth.example.com/realms/your-org
OIDC_CLIENT_ID=jarvis-web
OIDC_CLIENT_SECRET=change-me
NEXTAUTH_URL=http://localhost:3010

SESSION_SECRET=dev-session-secret-32-chars-min!!

OPENAI_API_KEY=sk-...
ASK_AI_MODEL=gpt-5.4-mini
GRAPHIFY_BIN=graphify
```

---

## 7. 디렉터리 구조

```text
.
├─ apps/
│  ├─ web/                 # Next.js 웹 애플리케이션 (포트 3010)
│  │  ├─ app/              # App Router pages / API routes / server actions
│  │  ├─ components/       # 도메인 UI 컴포넌트
│  │  ├─ e2e/              # Playwright E2E 테스트
│  │  └─ lib/              # queries, hooks, server auth helpers
│  └─ worker/              # 문서 인제스트, 임베딩, Graphify 파이프라인
│     └─ src/
│        ├─ jobs/          # ingest, embed, graphify-build, cleanup 등
│        └─ lib/           # MinIO, PDF parser, text chunker
├─ packages/
│  ├─ ai/                  # 6-Lane Router, Ask AI, 튜터, 임베딩, citation stream
│  ├─ auth/                # OIDC, session, RBAC
│  ├─ db/                  # Drizzle schema (39 tables), migrations
│  ├─ search/              # PostgreSQL 기반 검색 엔진
│  ├─ secret/              # secret reference abstraction
│  └─ shared/              # constants / types / validation
├─ docs/
│  ├─ superpowers/         # 설계 메모 / 스펙 문서
│  ├─ guidebook/           # ISU 가이드북 원본 + 정규화 (95개 정본)
│  ├─ canonical/           # 정본 위키 마크다운 (95개 항목)
│  └─ plan/                # 통합 계획 문서
├─ docker/
│  ├─ init-db/             # PostgreSQL extension bootstrap SQL
│  ├─ secrets/             # .gitignore'd secret files (prod only)
│  ├─ Dockerfile.web       # Next.js 멀티스테이지 빌드
│  ├─ Dockerfile.worker    # Worker 멀티스테이지 빌드
│  ├─ nginx.conf           # Nginx 프록시 설정
│  ├─ entrypoint.sh        # Docker secret → env var 주입
│  ├─ docker-compose.yml   # 프로덕션 (postgres/redis/minio/web/worker/nginx)
│  └─ docker-compose.dev.yml  # 개발 오버라이드
├─ data/
│  ├─ canonical/           # 정본 가이드북 & 마크다운 (95개)
│  └─ casedata/            # TSVD999 사례 데이터 (74,342 rows)
├─ package.json
├─ pnpm-workspace.yaml
├─ turbo.json
└─ .env.example
```

---

## 8. 개발 환경 요구사항

권장 버전은 아래와 같습니다.

- Node.js **22+**
- pnpm **9+**
- Docker / Docker Compose
- PostgreSQL, Redis, MinIO를 직접 띄우지 않는다면 Docker Compose 사용 권장
- OpenAI API Key (생성·임베딩 통합)

---

## 9. 빠른 시작

### 9.1 저장소 준비

```bash
git clone https://github.com/qoxmfaktmxj/jarvis.git
cd jarvis
cp .env.example .env
```

`.env.example`는 최소 예시 수준이므로, 실제 실행 전 위 **환경변수 가이드**를 기준으로 보강하는 것을 권장합니다.

### 9.2 인프라 실행

개발 환경 (Next.js는 `pnpm dev`로 별도 실행):

```bash
docker compose -f docker/docker-compose.yml -f docker/docker-compose.dev.yml up -d postgres redis minio
```

개발 환경에서 실행되는 서비스 (호스트 포트):

| 서비스 | 호스트 포트 |
|--------|------------|
| PostgreSQL | `5436` |
| Redis | `6380` |
| MinIO API | `9100` |
| MinIO Console | `9101` |

> 프로덕션 배포는 [15. 운영/배포 시 고려사항](#15-운영배포-시-고려사항) 참고.

### 9.3 의존성 설치

```bash
pnpm install
```

### 9.4 데이터베이스 마이그레이션

```bash
pnpm db:generate
pnpm db:migrate
```

초기 확장(extension)은 Docker의 `init-db/01-extensions.sql`에서 준비됩니다.

### 9.5 애플리케이션 실행

루트에서 web과 worker를 동시에 실행합니다:

```bash
pnpm dev
```

포트: web → `3010`, worker는 별도 포트 없음 (pg-boss 기반 백그라운드 워커).

개별 실행이 필요한 경우:
- 웹만: `pnpm --filter @jarvis/web dev`
- 워커만: `pnpm --filter @jarvis/worker dev`

---

## 10. 주요 스크립트

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
- 회사 컨텍스트 부스트 (사례 검색에서 동일 회사 선례 우선)

### 검색 결과에서 기대하는 것

- 오타에 비교적 강함
- 최신 문서 우선 보정 가능
- 민감도/페이지 타입 필터 가능
- 사례 검색에서 회사별 필터링 가능
- 추후 외부 검색엔진으로 확장 가능하도록 `SearchAdapter` 추상화 유지

---

## 12. Ask AI 설계

Ask AI는 "LLM 단독 답변"이 아니라, **6-레인 라우터 기반 최적 검색 + RAG** 흐름입니다.

### 처리 순서

1. 사용자 질문을 한국어 키워드로 분석
2. 6-레인 라우터로 최적 검색 경로 결정
3. 해당 레인의 소스에서 관련 정보 검색
   - text-first: knowledge_claim 벡터 유사도
   - graph-first: graph_node/edge 조회
   - case-first: precedent_case 벡터 + 회사 부스트
   - directory-first: directory_entry ILIKE 검색
   - action-first: directory + knowledge 조합
   - tutor-first: 모든 소스 + 단계별 설명
4. sensitivity/권한 조건에 따라 필터링
5. OpenAI (기본: gpt-5.4-mini) 모델로 답변 생성
6. `[source:N]` 기반 출처 추출
7. SSE로 텍스트/소스/완료 이벤트 스트리밍
8. AnswerCard에서 구조화된 응답 표시

### 응답 구조 (AnswerCard)

- 주요 답변 (텍스트)
- 근거 문서 (knowledge_page links)
- 디렉터리 바로가기 (관련 시스템/양식)
- 사례 참고 (유사 선례)
- 그래프 컨텍스트 (관련 구조)
- 다음 액션 (권장 단계)
- 소유 팀 (문의 대상)

### Simple/Expert 모드

- **Simple**: 2~3 문장 답변, 핵심만 강조
- **Expert**: 상세 답변, 사례·그래프·근거 모두 표시

---

## 13. Graphify 코드 분석 파이프라인

Graphify는 **코드 파일을 업로드하면 자동으로 AST 분석 + LLM semantic extraction을 수행**합니다.

### 처리 단계

1. 파일 분류 및 민감 파일 제외 (detect.py)
2. 19언어 AST + Claude semantic extraction (extract.py)
3. NetworkX 그래프 조립 (build.py)
4. Leiden 커뮤니티 감지 (cluster.py)
5. 분석 인사이트 (analyze.py) — god nodes, surprising connections
6. GRAPH_REPORT.md 자동 생성 (report.py)
7. 커뮤니티별 wiki 문서 생성 (wiki.py)
8. graph.html (vis.js interactive) + graph.json export (export.py)
9. DB에 graph_node/graph_edge/graph_community 레코드 저장

### 핵심 특징

- **결정론적 추출**: tree-sitter AST + NetworkX 그래프 구축 + Leiden/Louvain 커뮤니티 (LLM 호출 없음). 의미 기반 보강이 필요하면 @jarvis/ai 경유로 별도 단계 수행
- **자동 wiki 생성**: 코드 구조에 기반한 설명서 자동 생성
- **쿼리 엔진**: MCP server로 graph-native 검색 지원
- **증분 빌드**: SHA256 캐시로 변경된 파일만 재분석
- **보안**: URL validation, SSRF 차단, path traversal 방지

> **주의**: Graphify는 **Python 유틸리티/skill**입니다. CLI 명령 `graphify install` 또는 `graphify cli`는 없습니다. worker는 subprocess로 Graphify를 호출합니다.

---

## 14. 파일 업로드와 인제스트 파이프라인

### 기본 흐름

1. 파일이 MinIO에 저장됨
2. 웹 API가 `raw_source`/`attachment` 메타데이터를 저장함
3. `pg-boss` 큐에 작업 등록
4. 워커가 처리

### 3가지 병렬 파이프라인

| 파이프라인 | 트리거 | 처리 | 결과 |
|----------|--------|------|------|
| **텍스트 인제스트** | ingest job | PDF/DOCX/text/JSON 텍스트 추출 | parsed_content 저장 |
| **임베딩 + RAG** | embed job | chunk split → OpenAI embedding (1536d) | knowledge_claim + vector |
| **Graphify 분석** | graphify-build job | ZIP/파일 → AST extraction → 그래프 조립 | graph_node/edge/community + wiki |

### 지원 포맷

- PDF
- DOCX
- Text/
- JSON
- ZIP (Graphify용 코드 저장소)
- 기타 바이너리 파일은 placeholder 처리

---

## 15. 인증 / 인가

### 인증

- OIDC discovery 사용
- Authorization Code + PKCE
- `state`, `nonce` 검증
- Redis 기반 세션 저장
- `sessionId` 쿠키 사용

### 인가

- 역할(Role)과 권한(Permission) 개념을 둘 다 사용
- 화면/API 진입 시 권한 검사
- 문서 민감도 4단계 (PUBLIC, INTERNAL, RESTRICTED, SECRET_REF_ONLY)를 고려한 접근 제어
- 그래프/사례는 권한 기반 필터링

---

## 16. 백그라운드 작업

워커가 등록하는 잡은 아래와 같습니다.

| 잡 이름 | 설명 |
|---|---|
| `ingest` | 업로드 파일 텍스트 추출 |
| `embed` | knowledge claim 임베딩 생성 + 벡터 저장 |
| `compile` | summary 생성 및 검색 벡터 준비 |
| `graphify-build` | Graphify 코드 분석 파이프라인 |
| `check-freshness` | 오래된 문서 점검 (Knowledge Debt Radar) |
| `check-drift` | 문서-시스템 참조 일관성 검증 (Drift Detection) |
| `aggregate-popular` | 인기 검색 집계 |
| `cleanup` | 오래된 로그/버전 정리 |

스케줄 작업 예시:

- stale page check: 매일 09:00
- drift check: 매일 08:00
- popular search aggregation: 매주 일요일 00:00
- cleanup: 매월 1일 00:00

---

## 17. 테스트와 품질 관리

레포에는 아래 성격의 테스트 파일이 포함되어 있습니다.

- AI 관련 테스트 (라우터, 임베딩, 답변 생성)
- 검색/대시보드 일부 테스트
- 서버 액션 테스트
- 워커 유틸 테스트

실무 운영 전에는 아래 항목을 추가하는 것을 권장합니다.

- API 통합 테스트
- 권한 시나리오 테스트
- 검색 relevance 회귀 테스트
- Graphify 파이프라인 테스트
- GitHub Actions 기반 CI

Playwright E2E 테스트는 `apps/web/e2e/`에 있으며, Redis session inject 방식으로 OIDC 로그인을 우회합니다:

```bash
pnpm --filter @jarvis/web exec playwright test
```

---

## 18. 운영/배포 시 고려사항

### Docker 배포

```bash
# 1. 시크릿 파일 생성
mkdir -p docker/secrets
echo -n 'your-pg-password'   > docker/secrets/pg_password.txt
echo -n 'jarvisadmin'        > docker/secrets/minio_user.txt
echo -n 'jarvispassword'     > docker/secrets/minio_password.txt
echo -n 'your-session-secret-32chars' > docker/secrets/session_secret.txt
echo -n 'sk-...'             > docker/secrets/openai_api_key.txt

# 2. 환경변수 설정 (OIDC 등)
export OIDC_ISSUER=https://auth.example.com/realms/jarvis
export OIDC_CLIENT_ID=jarvis-web
export OIDC_CLIENT_SECRET=your-client-secret
export APP_URL=https://jarvis.example.com
export ASK_AI_MODEL=gpt-5.4-mini

# 3. 이미지 빌드 + 기동
bash scripts/start-prod.sh
```

### 권장 사항

- OIDC Provider는 별도 운영 환경(Okta, Azure AD, Entra 등)으로 분리
- Redis는 세션/레이트리밋 용도로 안정적으로 운영
- PostgreSQL에는 `pgvector`, `pg_trgm`, `unaccent` 확장 설치 필수
- MinIO 또는 S3 호환 스토리지 사용
- OpenAI API key는 `docker/secrets/openai_api_key.txt` 파일로 관리 (`.gitignore` 적용)
- worker를 web과 별도 프로세스로 운영 (compose에서 별도 서비스로 분리)
- Graphify 바이너리는 worker 컨테이너에 설치 (또는 PATH에 포함)

### 추가로 고려할 것

- observability (request id, queue metrics, tracing)
- secret manager 연동
- 검색 relevance 모니터링
- 테넌트/워크스페이스 분리 검증 자동화
- Graphify 분석 결과 캐시 정책

---

## 19. 현재 상태 요약

| 항목 | 상태 |
|------|------|
| 웹 UI (대시보드, Ask AI, 검색) | ✓ 완료 |
| 4-표면 지식 모델 | ✓ 완료 |
| 6-레인 Ask AI 라우터 | ✓ 완료 |
| Simple/Expert 모드 | ✓ 완료 |
| TSVD999 사례 레이어 (74,342 행) | ✓ 완료 |
| TF-IDF 군집화 (562 클러스터) | ✓ 완료 |
| 디렉터리 (31개 항목) | ✓ 완료 |
| Graphify 코드 분석 파이프라인 | ✓ 완료 |
| Knowledge Debt Radar | ✓ 완료 |
| Drift Detection | ✓ 완료 |
| AnswerCard (구조화 응답) | ✓ 완료 |
| 정본 가이드북 시드 (95개) | ✓ 완료 |
| HR 튜터 (가이드/퀴즈/시뮬레이션) | ✓ 완료 |
| 테스트 커버리지 확대 | ⏳ 진행 중 |
| CI/CD 파이프라인 | ⏳ 진행 중 |

---

## 20. 현재 레포를 기준으로 우선 정리하면 좋은 항목

1. **테스트 커버리지 확대** — API 통합 테스트, 권한 시나리오 테스트
2. **CI/CD 자동화** — GitHub Actions 기반 배포 파이프라인
3. **모니터링/옵저버빌리티** — request ID, queue metrics, performance tracing
4. **운영 대시보드** — API rate limit, Graphify 처리 상태, 임베딩 품질 모니터링
5. **검색 relevance 회귀 테스트** — 정기 검색 품질 확인

---

## 21. 마지막 메모

이 레포는 이미 단순 CRUD 수준을 넘어,

- 4-표면 지식 관리
- 6-레인 의도 기반 라우팅
- 하이브리드 벡터/FTS/사례 검색
- RAG 기반 AI 답변 생성
- 코드 AST + LLM 그래프 분석
- 문서 인제스트 자동화
- 권한 기반 내부 포털

까지 엮으려는 방향성이 분명합니다.

정리만 잘 되면 **"사내 위키 + 검색 + 운영 포털 + AI 비서 + 코드 분석"** 을 하나의 플랫폼으로 발전시키기 좋은 기반입니다.
