# Jarvis Next — 통합 실행 계획서

> **작성일:** 2026-04-13  
> **기준:** weekend-review.md 전략 + 분석 피드백 + 현재 main 코드 상태 교차 검증  
> **실행 도구:** Sonnet (구현), Codex (TSVD999 대량 데이터 정제)

---

## 현재 상태 요약

### 이미 구현된 것 (건드리지 않음)
- Foundation 12개 플랜 전부 구현 완료
- Auth RBAC + role case normalization
- compile → embed job chain (수정 완료)
- graph schema (graph_snapshot, graph_node, graph_edge, graph_community)
- graph-context.ts (keyword → node ILIKE → 1-hop → path → community)
- SourceRef discriminated union (text | graph)
- Architecture page + Build Lifecycle UI
- Sensitivity gate (DB-level + predicate)
- knowledge_page.sourceType / sourceKey (graphify upsert 지원)

### 수정 필요 (기존 코드 버그)
- `graphify-build.ts:151` — CLI args 검증 필요 (통합 테스트로 확인)

### 아직 없는 것 (이번 계획의 핵심)
1. 4-surface 지식 모델 (Canonical / Directory / Case / Derived)
2. knowledge_page frontmatter 확장 (authority, owner_team, page_type 세분화)
3. Guidebook canonicalization 파이프라인
4. Cases layer (TSVD999 → Jarvis precedent_case)
5. Directory layer (tools/forms/contacts 구조화)
6. Ask AI 6-lane 라우터
7. OpenAI 생성 마이그레이션 (Anthropic → OpenAI)

---

## Phase 0 — 지식 모델 확장 (DB Schema)

**목표:** 4-surface 모델을 기존 knowledge_page 테이블 위에 비파괴적으로 확장

### Task 0-1. knowledge_page 컬럼 추가 (Migration 0005)

```sql
-- 0005_knowledge_surfaces.sql

-- page_type 값 확장: 기존 varchar(50) 유지하되, CHECK constraint 추가 안 함 (앱 레벨 검증)
-- 새로 추가할 page_type 값들:
--   canonical: policy, procedure, runbook, guide, faq, glossary, onboarding
--   directory: tool, form, contact, system_link
--   case:      incident_pattern, case_digest, case_raw
--   derived:   graph_report, community_page, generated

ALTER TABLE knowledge_page ADD COLUMN surface VARCHAR(20) DEFAULT 'canonical' NOT NULL;
-- surface: 'canonical' | 'directory' | 'case' | 'derived'

ALTER TABLE knowledge_page ADD COLUMN authority VARCHAR(20) DEFAULT 'canonical';
-- authority: 'canonical' | 'curated' | 'generated' | 'imported'

ALTER TABLE knowledge_page ADD COLUMN owner_team VARCHAR(100);
ALTER TABLE knowledge_page ADD COLUMN audience VARCHAR(50) DEFAULT 'all-employees';
ALTER TABLE knowledge_page ADD COLUMN review_cycle_days INTEGER DEFAULT 90;
ALTER TABLE knowledge_page ADD COLUMN domain VARCHAR(50);
-- domain: 'hr', 'it', 'admin', 'welfare', 'onboarding', 'system', 'project', etc.

ALTER TABLE knowledge_page ADD COLUMN source_origin VARCHAR(50);
-- source_origin: 'imported-notion', 'imported-tsvd', 'manual', 'graphify', 'codex'

-- frontmatter jsonb는 이미 knowledge_page_version에 있으므로 별도 추가 불필요
-- page-level metadata는 위 컬럼, version-level rich data는 frontmatter jsonb
```

**Drizzle 스키마 변경 파일:** `packages/db/schema/knowledge.ts`

```typescript
// 추가할 컬럼들
surface: varchar("surface", { length: 20 }).default("canonical").notNull(),
authority: varchar("authority", { length: 20 }).default("canonical"),
ownerTeam: varchar("owner_team", { length: 100 }),
audience: varchar("audience", { length: 50 }).default("all-employees"),
reviewCycleDays: integer("review_cycle_days").default(90),
domain: varchar("domain", { length: 50 }),
sourceOrigin: varchar("source_origin", { length: 50 }),
```

### Task 0-2. precedent_case 테이블 신규 (Cases Layer)

```typescript
// packages/db/schema/case.ts (새 파일)

export const precedentCase = pgTable("precedent_case", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspace.id),
  
  // TSVD999 원본 필드 매핑
  originalSeq: integer("original_seq"),           // SEQ
  higherCategory: varchar("higher_category", { length: 100 }),  // HIGHER_NM
  lowerCategory: varchar("lower_category", { length: 100 }),    // LOWER_NM
  appMenu: varchar("app_menu", { length: 500 }),               // APP_MENU (메뉴 경로)
  processType: varchar("process_type", { length: 100 }),        // PROCESS_NM
  
  // 정규화된 필드
  title: varchar("title", { length: 500 }).notNull(),
  symptom: text("symptom"),           // CONTENT에서 추출 — 증상/문의
  cause: text("cause"),               // COMPLETE_CONTENT에서 추출 — 원인
  action: text("action"),             // COMPLETE_CONTENT에서 추출 — 조치
  result: text("result"),             // SOLUTION_FLAG + COMPLETE_CONTENT 종합
  
  // 고객사 컨텍스트
  requestCompany: varchar("request_company", { length: 100 }),  // REQUEST_COMPANY_NM
  managerTeam: varchar("manager_team", { length: 100 }),        // MANAGER_DEPT_NM
  
  // 군집화
  clusterId: integer("cluster_id"),
  clusterLabel: varchar("cluster_label", { length: 200 }),
  isDigest: boolean("is_digest").default(false).notNull(),  // 대표 사례 여부
  digestPageId: uuid("digest_page_id").references(() => knowledgePage.id),
  
  // 메타
  severity: varchar("severity", { length: 20 }),     // BUSINESS_LEVEL → low/medium/high/critical
  resolved: boolean("resolved").default(false),       // SOLUTION_FLAG
  urgency: boolean("urgency").default(false),          // PROCESS_SPEED
  workHours: numeric("work_hours", { precision: 5, scale: 1 }),
  
  // 원본 날짜 (varchar → timestamp 변환)
  requestedAt: timestamp("requested_at", { withTimezone: true }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  
  // Jarvis 메타
  sensitivity: varchar("sensitivity", { length: 30 }).default("INTERNAL").notNull(),
  embedding: vector("embedding"),     // symptom+cause+action 임베딩
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const caseCluster = pgTable("case_cluster", {
  id: integer("id").primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspace.id),
  label: varchar("label", { length: 200 }).notNull(),
  description: text("description"),
  caseCount: integer("case_count").default(0).notNull(),
  digestCaseId: uuid("digest_case_id"),  // 대표 사례 FK
  digestPageId: uuid("digest_page_id").references(() => knowledgePage.id),
  topSymptoms: jsonb("top_symptoms").$type<string[]>().default([]),
  topActions: jsonb("top_actions").$type<string[]>().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
```

### Task 0-3. directory_entry 테이블 신규 (Directory Layer)

```typescript
// packages/db/schema/directory.ts (새 파일)

export const directoryEntry = pgTable("directory_entry", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspace.id),
  entryType: varchar("entry_type", { length: 30 }).notNull(),
  // entry_type: 'tool' | 'form' | 'contact' | 'system_link' | 'guide_link'
  name: varchar("name", { length: 200 }).notNull(),
  nameKo: varchar("name_ko", { length: 200 }),
  description: text("description"),
  url: varchar("url", { length: 1000 }),
  category: varchar("category", { length: 100 }),  // 'hr', 'it', 'admin', 'welfare'
  ownerTeam: varchar("owner_team", { length: 100 }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
```

---

## Phase 1 — Guidebook Canonicalization

**목표:** isu-guidebook를 4-surface 구조로 분해

### Task 1-1. Guidebook 정제 스크립트

**파일:** `scripts/canonicalize-guidebook.ts`

입력: `data/guidebook/isu-guidebook-full.md` + `data/guidebook/isu-guidebook-home.md`  
출력: `data/canonical/` 폴더 + `data/directory/` JSON

처리 로직:
1. home.md 파싱 → 카테고리 트리 추출
2. full.md를 heading 기준 split → 개별 페이지
3. 각 페이지 분류:
   - 설명/절차/규정 → canonical surface
   - 링크/툴/시스템 경로 → directory surface  
   - stub/placeholder (본문 < 100자 or 유튜브 링크만) → skip 또는 directory
4. frontmatter 자동 생성:
   ```yaml
   title: (heading에서 추출)
   slug: (kebab-case)
   domain: (home.md 카테고리 기반)
   page_type: (규칙 기반 분류)
   surface: canonical | directory
   authority: imported
   owner_team: (메타데이터 기반 추정)
   audience: all-employees
   sensitivity: INTERNAL
   source_origin: imported-notion
   source_key: guidebook/{path}
   ```
5. directory 항목 추출:
   - 이수HR, 그룹웨어, ERP 등 시스템 링크
   - 각종 신청서/양식
   - 담당자/팀 연락처

### Task 1-2. Guidebook Light Graph 생성기

**파일:** `scripts/build-guidebook-graph.ts`

frontmatter + 규칙 기반 관계 추출 (LLM 불필요):
- Page → BELONGS_TO_CATEGORY → Category
- Page → USES_TOOL → Tool (directory_entry)
- Page → REQUIRES_FORM → Form (directory_entry)
- Page → OWNED_BY → Team
- Page → APPLIES_TO → Audience
- Page → RELATED_TO → Page (home.md 인접 항목)

결과: `data/canonical/guidebook-graph.json`

### Task 1-3. Canonical Seed 인제스트 Job

**파일:** `apps/worker/src/jobs/seed-canonical.ts`

`data/canonical/` 폴더 내 MD 파일을 순회하며:
1. frontmatter 파싱
2. knowledge_page upsert (sourceType='guidebook', sourceKey=slug)
3. knowledge_page_version 생성 (versionNumber=1)
4. embed job 자동 enqueue

---

## Phase 2 — Cases Layer (TSVD999)

**목표:** 126,000건 유지보수 사례 → 정규화 → 군집화 → 대표 사례 digest

### Task 2-0. TSVD999 데이터 추출 (사용자가 직접 수행)

오라클에서 CSV 추출. 아래 Codex 프롬프트로 정제 작업 위임.

### Task 2-1. Codex 위임 프롬프트 (TSVD999 정제)

아래 프롬프트를 Codex에 그대로 전달:

---

**[CODEX PROMPT START]**

# TSVD999 유지보수 사례 정규화 파이프라인

## 목표
Oracle `<schema>.TSVD999` 테이블의 126,000건 서비스데스크 데이터를 Jarvis precedent_case 테이블에 적재할 수 있도록 정규화한다.

## 원본 테이블 구조 (Oracle)
```sql
CREATE TABLE "<schema>"."TSVD999" (
  "ENTER_CD" VARCHAR2(50),        -- 회사코드
  "YYYY" VARCHAR2(4),             -- 년도
  "MM" VARCHAR2(2),               -- 월
  "SEQ" NUMBER,                   -- 순번 (PK의 일부)
  "HIGHER_CD" VARCHAR2(50),       -- 상위업무 코드 (예: H008)
  "HIGHER_NM" VARCHAR2(100),      -- 상위업무명 (예: OPTI-HR)
  "LOWER_CD" VARCHAR2(50),        -- 하위업무 코드 (예: L035)
  "LOWER_NM" VARCHAR2(100),       -- 하위업무명 (예: 급여관리, 근태관리, 인력운영)
  "STATUS_CD" VARCHAR2(50),       -- 진행상태 코드 (3=미평가, 4=처리완료)
  "STATUS_NM" VARCHAR2(100),      -- 진행상태명
  "PROCESS_SPEED" VARCHAR2(50),   -- 긴급구분 (Y/N)
  "TITLE" VARCHAR2(1000),         -- 제목
  "REQUEST_COMPANY_CD" VARCHAR2(50),  -- 요청자 회사코드
  "REQUEST_COMPANY_NM" VARCHAR2(100), -- 요청자 회사명 (고객사)
  "REQUEST_DEPT_NM" VARCHAR2(100),    -- 요청자 부서명
  "REQUEST_NM" VARCHAR2(100),         -- 요청자명
  "REQUEST_COMPLETE_DATE" VARCHAR2(50), -- 완료요청일
  "REGISTER_DATE" VARCHAR2(50),   -- 등록일 (YYYY-MM-DD HH24:MI:SS)
  "APP_MENU" VARCHAR2(1000),      -- 문의 메뉴 경로 (예: 급여관리>월급여관리>급/상여계산)
  "RECEIPT_CONTENT" VARCHAR2(4000), -- 접수내용 (대부분 "문의하신 내용이 접수되었습니다.")
  "MANAGER_COMPANY_NM" VARCHAR2(100), -- 담당자 회사명
  "MANAGER_NM" VARCHAR2(100),     -- 담당자명
  "MANAGER_DEPT_NM" VARCHAR2(100),-- 담당자 부서명
  "RECEIPT_DATE" VARCHAR2(50),    -- 접수일
  "BUSINESS_LEVEL" VARCHAR2(50),  -- 난이도 (A/B/C/D)
  "COMPLETE_RESERVE_DATE" VARCHAR2(50), -- 완료예정일
  "SOLUTION_FLAG" VARCHAR2(50),   -- 해결여부 (Y/N)
  "COMPLETE_CONTENT1" VARCHAR2(4000),  -- 완료 코멘트1 (짧은 답변)
  "DELAY_REASON" VARCHAR2(1000),  -- 지연사유
  "WORK_TIME" VARCHAR2(50),       -- 작업시간 (시간 단위)
  "COMPLETE_DATE" VARCHAR2(50),   -- 완료일
  "PROCESS_CD" VARCHAR2(50),      -- 처리구분 코드
  "PROCESS_NM" VARCHAR2(100),     -- 처리구분명 (프로그램 기능 개선 / 데이터 전달 및 수정 / 요청사항 확인 및 안내 / 프로그램 오류 수정 등)
  "VALUATION" VARCHAR2(50),       -- 평가점수 (0~5)
  "VALUATION_CONTENT" VARCHAR2(4000), -- 평가내용
  "GUBUN_CD" VARCHAR2(10),        -- 외부(0)/사스(1)
  "DELETE_FLAG" VARCHAR2(10),     -- 삭제여부
  "COMPLETE_CONTENT" CLOB,        -- 완료 답변 전문 (가장 중요한 해결 내용)
  "CONTENT" CLOB                  -- 원문 문의 전문 (가장 중요한 질문 내용)
);
```

## 타겟 스키마 (PostgreSQL Jarvis)
```sql
CREATE TABLE precedent_case (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  original_seq INTEGER,
  higher_category VARCHAR(100),   -- HIGHER_NM
  lower_category VARCHAR(100),    -- LOWER_NM
  app_menu VARCHAR(500),          -- APP_MENU
  process_type VARCHAR(100),      -- PROCESS_NM
  title VARCHAR(500) NOT NULL,
  symptom TEXT,                   -- CONTENT에서 추출
  cause TEXT,                     -- COMPLETE_CONTENT에서 추출
  action TEXT,                    -- COMPLETE_CONTENT에서 추출
  result TEXT,                    -- 종합
  request_company VARCHAR(100),
  manager_team VARCHAR(100),
  cluster_id INTEGER,
  cluster_label VARCHAR(200),
  is_digest BOOLEAN DEFAULT FALSE,
  severity VARCHAR(20),
  resolved BOOLEAN DEFAULT FALSE,
  urgency BOOLEAN DEFAULT FALSE,
  work_hours NUMERIC(5,1),
  requested_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  sensitivity VARCHAR(30) DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Step 1: Oracle에서 CSV 추출

```sql
-- Oracle SQL*Plus 또는 SQL Developer에서 실행
-- CLOB 필드가 있으므로 직접 CSV 가능한 도구 권장 (DBeaver, SQL Developer Export)

SELECT 
  ENTER_CD, YYYY, MM, SEQ,
  HIGHER_CD, HIGHER_NM, LOWER_CD, LOWER_NM,
  STATUS_CD, STATUS_NM, PROCESS_SPEED,
  TITLE,
  REQUEST_COMPANY_CD, REQUEST_COMPANY_NM,
  REQUEST_DEPT_NM, REQUEST_NM,
  REGISTER_DATE,
  APP_MENU,
  MANAGER_NM, MANAGER_DEPT_NM,
  RECEIPT_DATE, BUSINESS_LEVEL,
  COMPLETE_RESERVE_DATE, SOLUTION_FLAG,
  WORK_TIME, COMPLETE_DATE,
  PROCESS_CD, PROCESS_NM,
  VALUATION,
  GUBUN_CD, DELETE_FLAG,
  -- CLOB은 DBMS_LOB.SUBSTR로 4000자까지 잘라서 추출
  DBMS_LOB.SUBSTR(CONTENT, 4000, 1) AS CONTENT_TEXT,
  DBMS_LOB.SUBSTR(COMPLETE_CONTENT, 4000, 1) AS COMPLETE_TEXT,
  COMPLETE_CONTENT1
FROM <schema>.TSVD999
WHERE DELETE_FLAG != 'Y'  -- 삭제 건 제외
ORDER BY YYYY DESC, MM DESC, SEQ
```

총 126,000건을 한번에 뽑되:
- 파일 크기가 클 수 있으므로 연도별로 분할 추출 권장: `WHERE YYYY = '2025'`, `WHERE YYYY = '2024'` ...
- UTF-8 인코딩 필수
- CSV 구분자: TAB (\t) 권장 (CONTENT에 쉼표가 많음)

## Step 2: LLM 정규화 (symptom/cause/action 추출)

Python 스크립트를 만들어서:

```python
"""
TSVD999 정규화 파이프라인
입력: tsvd999_export.tsv (TAB 구분 CSV)
출력: normalized_cases.jsonl (1줄 1건)

LLM: gpt-4.1-mini (비용 최적화)
토큰 예산: 무제한 (사용자 명시)
병렬: 50 concurrent requests (rate limit 준수)
재시도: 3회 exponential backoff
"""

import asyncio, json, csv
from openai import AsyncOpenAI

client = AsyncOpenAI()
SEMAPHORE = asyncio.Semaphore(50)

SYSTEM_PROMPT = """당신은 IT 서비스데스크 사례를 정규화하는 전문가입니다.
주어진 유지보수 요청(CONTENT)과 답변(COMPLETE_CONTENT)을 분석하여 다음 구조로 추출하세요:

{
  "symptom": "증상 또는 문의 내용 (1-3문장, 핵심만)",
  "cause": "원인 (식별 가능한 경우, 없으면 null)",
  "action": "조치 내용 (1-3문장, 핵심만)",
  "result": "resolved | workaround | escalated | no_fix | info_only",
  "severity": "low | medium | high | critical",
  "tags": ["관련 키워드 3-5개"]
}

규칙:
- 개인정보(이름, 사번, 이메일)는 제거
- 회사명은 유지 (고객사 컨텍스트로 활용)
- HTML 태그 제거
- 핵심 기술 용어는 보존
- 내용이 비어있거나 의미없는 경우 해당 필드를 null로"""

async def normalize_case(row: dict) -> dict:
    content = row.get("CONTENT_TEXT", "") or ""
    complete = row.get("COMPLETE_TEXT", "") or row.get("COMPLETE_CONTENT1", "") or ""
    
    if len(content.strip()) < 10 and len(complete.strip()) < 10:
        return {**row, "symptom": None, "cause": None, "action": None, 
                "result": "info_only", "severity": "low", "tags": []}
    
    user_msg = f"""## 요청 제목
{row.get("TITLE", "")}

## 메뉴 경로
{row.get("APP_MENU", "")}

## 원문 문의
{content[:3000]}

## 답변/조치
{complete[:3000]}

## 처리구분
{row.get("PROCESS_NM", "")}

## 해결여부
{row.get("SOLUTION_FLAG", "")}"""

    async with SEMAPHORE:
        resp = await client.chat.completions.create(
            model="gpt-4.1-mini",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_msg}
            ],
            response_format={"type": "json_object"},
            temperature=0.1,
            max_tokens=500,
        )
    
    extracted = json.loads(resp.choices[0].message.content)
    return {
        "original_seq": row.get("SEQ"),
        "higher_category": row.get("HIGHER_NM"),
        "lower_category": row.get("LOWER_NM"),
        "app_menu": row.get("APP_MENU"),
        "process_type": row.get("PROCESS_NM"),
        "title": row.get("TITLE", "")[:500],
        "symptom": extracted.get("symptom"),
        "cause": extracted.get("cause"),
        "action": extracted.get("action"),
        "result": extracted.get("result"),
        "request_company": row.get("REQUEST_COMPANY_NM"),
        "manager_team": row.get("MANAGER_DEPT_NM"),
        "severity": extracted.get("severity", "medium"),
        "resolved": row.get("SOLUTION_FLAG") == "Y",
        "urgency": row.get("PROCESS_SPEED") == "Y",
        "work_hours": float(row["WORK_TIME"]) if row.get("WORK_TIME") else None,
        "requested_at": row.get("REGISTER_DATE"),
        "resolved_at": row.get("COMPLETE_DATE"),
        "tags": extracted.get("tags", []),
    }
```

**비용 예측:**
- 126,000건 x ~1,500 input tokens x ~200 output tokens
- gpt-4.1-mini: input $0.40/M, output $1.60/M
- 입력: 126K x 1.5K = 189M tokens = $75.6
- 출력: 126K x 200 = 25.2M tokens = $40.3
- **총 예상: ~$116 (한화 약 15만원)**

## Step 3: 군집화

```python
"""
정규화된 사례를 임베딩 → HDBSCAN 군집화
"""
from sklearn.cluster import HDBSCAN
import numpy as np

# 1. 임베딩 (symptom + " | " + action)
#    text-embedding-3-small, batch API 사용
#    126K x 1536d → 약 $2.6

# 2. HDBSCAN 군집화
clusterer = HDBSCAN(
    min_cluster_size=5,
    min_samples=3,
    metric='cosine',
    cluster_selection_method='eom'
)
labels = clusterer.fit_predict(embeddings)

# 3. 클러스터 라벨링 (LLM)
#    각 클러스터의 대표 5건 → gpt-4.1-mini로 1줄 라벨 생성
#    예상 클러스터: 100~300개

# 4. 대표 사례 선정
#    각 클러스터에서 centroid에 가장 가까운 1건 = digest
#    is_digest = True
```

## Step 4: Jarvis DB 적재

```python
# normalized_cases.jsonl → PostgreSQL precedent_case INSERT
# pg COPY 또는 batch INSERT
# cluster 정보 → case_cluster INSERT
# digest 사례 → knowledge_page 자동 생성 (surface='case', page_type='incident_pattern')
```

**[CODEX PROMPT END]**

---

## Phase 3 — Ask AI 6-Lane 라우터

**목표:** 질문 의도별 최적 retrieval 경로 분기

### Task 3-1. 라우터 모듈 신규

**파일:** `packages/ai/router.ts`

```typescript
export type AskLane = 
  | 'text-first'      // 규정, 정책, 절차 → canonical wiki
  | 'graph-first'     // 구조, 연결, 영향도 → graph context
  | 'case-first'      // 장애, 사례, "예전에" → precedent_case
  | 'directory-first'  // "어디서", "링크", "담당자" → directory_entry
  | 'action-first'     // "신청", "방법", "경로" → directory + canonical
  | 'tutor-first';     // "설명해줘", "가르쳐줘" → 종합 + step-by-step

export interface RouteResult {
  lane: AskLane;
  confidence: number;
  keywords: string[];
  suggestedSources: string[];  // surface hints
}

export async function routeQuestion(question: string): Promise<RouteResult> {
  // Phase 1: 규칙 기반 빠른 분기 (LLM 호출 없음)
  // - "어디서", "링크", "URL", "사이트" → directory-first
  // - "신청", "방법", "경로", "어떻게 해" → action-first
  // - "장애", "오류", "에러", "예전에", "사례" → case-first
  // - "구조", "연결", "의존", "영향" → graph-first
  // - "규정", "정책", "기준", "몇 일" → text-first
  // - "설명", "가르쳐", "알려줘", "뭐야" → tutor-first
  
  // Phase 2: 규칙 실패 시 LLM 분류 (gpt-4.1-mini, ~100 tokens)
}
```

### Task 3-2. ask.ts 리팩터링

현재 `ask.ts`의 parallel retrieval을 라우터 결과에 따라 분기:

```typescript
// 변경 전: 항상 text + graph 병렬
const [claims, graphCtx] = await Promise.all([...]);

// 변경 후: lane별 retrieval 조합
switch (route.lane) {
  case 'text-first':
    claims = await retrieveRelevantClaims(...);
    graphCtx = null; // skip
    break;
  case 'graph-first':
    graphCtx = await retrieveRelevantGraphContext(...);
    claims = await retrieveRelevantClaims(...); // fallback
    break;
  case 'case-first':
    cases = await retrieveRelevantCases(...);  // NEW
    claims = await retrieveRelevantClaims(...); // 보조
    break;
  case 'directory-first':
    entries = await searchDirectory(...);  // NEW
    break;
  case 'action-first':
    entries = await searchDirectory(...);
    claims = await retrieveRelevantClaims(...);
    break;
  case 'tutor-first':
    claims = await retrieveRelevantClaims(...);
    graphCtx = await retrieveRelevantGraphContext(...);
    cases = await retrieveRelevantCases(...);
    break;
}
```

### Task 3-3. Cases Retrieval 함수

**파일:** `packages/ai/case-context.ts`

```typescript
export async function retrieveRelevantCases(
  question: string,
  workspaceId: string,
  options?: { limit?: number; companyFilter?: string }
): Promise<CaseContext> {
  // 1. question embedding
  // 2. precedent_case.embedding cosine similarity
  // 3. 보조: lower_category, app_menu 키워드 매칭
  // 4. cluster_label 기반 관련 사례 확장
  // 5. digest 우선 반환
}
```

### Task 3-4. Directory Retrieval 함수

**파일:** `packages/ai/directory-context.ts`

```typescript
export async function searchDirectory(
  question: string,
  workspaceId: string
): Promise<DirectoryContext> {
  // 1. name, name_ko ILIKE 키워드 매칭
  // 2. category 필터
  // 3. 결과를 "바로가기 카드" 형태로 반환:
  //    { name, url, ownerTeam, category, description }
}
```

### Task 3-5. SourceRef 확장

```typescript
// packages/ai/types.ts 추가

export interface CaseSourceRef {
  kind: 'case';
  caseId: string;
  title: string;
  symptom: string;
  action: string;
  requestCompany: string | null;
  clusterLabel: string | null;
  confidence: number;
}

export interface DirectorySourceRef {
  kind: 'directory';
  entryId: string;
  name: string;
  url: string | null;
  category: string;
  ownerTeam: string | null;
}

export type SourceRef = 
  | TextSourceRef 
  | GraphSourceRef 
  | CaseSourceRef 
  | DirectorySourceRef;
```

---

## Phase 4 — OpenAI 생성 마이그레이션

**목표:** ask.ts의 Anthropic Claude → OpenAI 전환

### Task 4-1. ask.ts 프로바이더 교체

```typescript
// 변경 전
import Anthropic from '@anthropic-ai/sdk';
const anthropic = new Anthropic({ apiKey: ... });
const stream = anthropic.messages.stream({ model: 'claude-sonnet-4-5', ... });

// 변경 후
import OpenAI from 'openai';
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const stream = await openai.chat.completions.create({
  model: 'gpt-5.4-mini',  // 또는 gpt-4.1-mini
  stream: true,
  messages: [...],
});
```

### Task 4-2. SSE 스트리밍 어댑터

OpenAI streaming format → 기존 SSE format 변환:
```typescript
for await (const chunk of stream) {
  const content = chunk.choices[0]?.delta?.content;
  if (content) yield { type: 'text', content } as SSETextEvent;
}
```

### Task 4-3. 환경변수 정리

`.env.example` 업데이트:
- `ANTHROPIC_API_KEY` → 주석 처리 (graphify-build에서만 사용)
- `OPENAI_API_KEY` — 생성 + 임베딩 통합 키
- `ASK_AI_MODEL=gpt-5.4-mini`

---

## Phase 5 — UI 보강

### Task 5-1. 답변 카드 컴포넌트

**파일:** `apps/web/components/ai/AnswerCard.tsx`

```
┌─ 결론 ─────────────────────────────────┐
│ 연장근무는 이수HR > 근태신청에서 신청합니다.   │
├─ 적용범위 ──────────────────────────────┤
│ 전직원 / 프로젝트 투입자                     │
├─ 신뢰도 ───────────────────────────────┤
│ ✅ 정본 | 마지막 검증: 2026-03-15          │
├─ 근거 문서 ─────────────────────────────┤
│ 📄 연장근무 및 야간근무 정책                  │
├─ 관련 시스템 ───────────────────────────┤
│ 🔗 이수HR 바로가기  📋 근태 신청서           │
├─ 유사 사례 ─────────────────────────────┤
│ 💡 "연장근무 40H 초과 시 개별 승인 필요" (3건) │
├─ 다음 행동 ─────────────────────────────┤
│ → 이수HR 접속 → 근태신청 → 연장근무 선택      │
├─ 담당 팀 ──────────────────────────────┤
│ 경영지원팀                                │
└────────────────────────────────────────┘
```

### Task 5-2. SourceRef 렌더러 확장

기존 `SourceRefCard.tsx`를 4종 SourceRef에 대응:
- TextSourceRef → 기존 문서 카드
- GraphSourceRef → 그래프 노드 카드
- CaseSourceRef → 사례 카드 (증상 → 조치)
- DirectorySourceRef → 바로가기 카드 (버튼형)

---

## 실행 순서 (Sonnet 작업 단위)

| 순서 | Phase | Task | 예상 소요 | 선행 조건 |
|------|-------|------|----------|----------|
| 1 | 0 | 0-1. knowledge_page 컬럼 추가 | 30분 | 없음 |
| 2 | 0 | 0-2. precedent_case 스키마 | 30분 | 없음 |
| 3 | 0 | 0-3. directory_entry 스키마 | 20분 | 없음 |
| 4 | 0 | Drizzle migration 생성 + 적용 | 20분 | 1-3 |
| **중간점검** | | migration 성공 확인 | | |
| 5 | 3 | 3-1. 라우터 모듈 | 40분 | 없음 |
| 6 | 3 | 3-3. case-context.ts | 30분 | 2 |
| 7 | 3 | 3-4. directory-context.ts | 20분 | 3 |
| 8 | 3 | 3-5. SourceRef 확장 | 15분 | 없음 |
| 9 | 3 | 3-2. ask.ts 리팩터링 | 45분 | 5-8 |
| **중간점검** | | Ask AI 라우팅 동작 확인 | | |
| 10 | 4 | 4-1~4-3. OpenAI 마이그레이션 | 30분 | 9 |
| **중간점검** | | 스트리밍 동작 확인 | | |
| 11 | 1 | 1-1. guidebook 정제 스크립트 | 60분 | 1 |
| 12 | 1 | 1-2. light graph 생성기 | 30분 | 11 |
| 13 | 1 | 1-3. seed 인제스트 job | 30분 | 11 |
| 14 | 5 | 5-1. AnswerCard | 40분 | 8 |
| 15 | 5 | 5-2. SourceRef 렌더러 | 30분 | 14 |

**Phase 2 (TSVD999)는 Codex에 독립 위임 — 위 작업과 병렬 진행 가능**

---

## Codex 위임 요약

Codex에 전달할 것:
1. 이 문서의 Phase 2 섹션 전체 (Codex Prompt)
2. TSVD999 DDL + 컬럼 주석 (이미 제공)
3. exampletsvd999.sql 예시 데이터
4. Jarvis precedent_case DDL
5. Oracle CSV 추출 쿼리

Codex 산출물:
- `scripts/normalize-tsvd999.py` — LLM 정규화 스크립트
- `scripts/cluster-cases.py` — 군집화 스크립트
- `scripts/import-cases-to-jarvis.ts` — PostgreSQL 적재 스크립트
- `data/cases/normalized_cases.jsonl` — 정규화 결과
- `data/cases/clusters.json` — 군집 라벨

---

## 미포함 (Phase 6+, 추후)

- HR 튜터/시뮬레이터
- 지식 부채 레이더 (stale-check job 확장)
- 고객사별 컨텍스트 분기
- Simple/Expert 2단 UI
- 문서-코드 drift 자동 감지
