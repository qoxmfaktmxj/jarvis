---
title: "TSVD999 → wiki-fs SSoT 통합 + 6 시나리오 파이프라인 상세 설계"
date: 2026-04-17
author: planner
status: draft
related:
  - WIKI-AGENTS.md
  - docs/plan/2026-04-W3-gate.md
  - data/cases/stats.md
---

# TSVD999 → wiki-fs SSoT 통합 + 6 시나리오 파이프라인 상세 설계

## 0. 한 문장 요약

서비스데스크 raw 74,342행을 **`wiki/{ws}/auto/cases|syntheses|companies|playbooks|reports|onboarding/**.md` 단일 SSoT** 위에 모두 얹고, 6개 시나리오는 동일한 page-first recall + frontmatter 메타에 거는 **view 6개**로 구현한다. 별도 파이프라인을 6개 만드는 것은 명시적으로 거부한다.

근거: `WIKI-AGENTS.md:11-15` (compiled wiki = SSoT), `WIKI-AGENTS.md:27` (DB는 projection only). 이 선언이 이미 있는데 cases만 `precedent_case` 직접 적재(`packages/db/schema/case.ts:33`)로 가면 SSoT가 둘로 갈라진다 — 이번 설계는 그 분기를 닫는 작업이다.

---

## A. 재클러스터링 — 가장 시급한 결함

### 진단

`data/cases/stats.md:108-124`에 562 클러스터, **top 1=7,571건, top 5 합산 ≈ 22,500건 (전체의 30%)**. 라벨을 보면 모두 `급여관리 / [e-HR] 요청사항 확인 및 안내`, `HRI / [e-HR] 요청사항 확인 및 안내` 형태로 **lower_category × process_type 조합 그대로**다. 즉 `tfidf_labels`(`scripts/cluster-cases.py:101`)의 Level 1 = `lower_category` 그룹핑 이후 Level 2 KMeans가 의미 있는 sub-cluster를 못 만들었거나, 거대 그룹에서 `target_cluster_size=30`이 비현실적이라 KMeans가 noise에 수렴했다는 신호.

p50=25 / max=7571인 분포는 평균 클러스터 사이즈가 132건이지만 중앙값 25 — **꼬리가 심하게 비대칭**. 이는 자기참조 KB가 사실상 무용해지는 상황을 만든다("이 케이스 비슷한 거"가 7,571건 나옴).

### 옵션 평가

| 옵션 | 장점 | 단점 | 비용 |
|---|---|---|---|
| (1) HDBSCAN re-run, `min_cluster_size=8`, `min_samples=4` | 자연 군집 따라감, noise(-1) 분리 | OOM 위험(74K × 1536d cosine), 큰 모듈에서 여전히 hub cluster 가능 | 임베딩 재사용시 약 4–6h on m1 |
| (2) **Hierarchical re-split** (top-N 거대 클러스터만 in-place TF-IDF + MiniBatchKMeans, n_clusters = ceil(size/100)) | 기존 562개 라벨 보존, 부분 갱신, 시간/돈 거의 0, 작은 클러스터는 안 건드림 | 거대 클러스터 내부 분포가 진짜 unimodal이면 비효율 | 30분 in-process |
| (3) LLM-aided sub-clustering (top-5 거대 클러스터에 GPT로 sub-label 부여) | 의미적으로 깔끔, sub-label 자체가 사람이 읽음 | 7,571건 × top-5 = 약 22K LLM call, $40~120 (gpt-5.4-mini), 토큰 한계 관리 필요 | 6–10h, $40+ |

### 권장안: **(2) + (3) 하이브리드, 단 (2)부터**

- **Step 1 (즉시):** top 10 거대 클러스터(>1000건)를 in-place re-split. `target_cluster_size=80`, `min_cluster_size=10`. 결과: 562 → 약 800–900 클러스터, max < 800 예상.
- **Step 2 (G1 통과 후):** 여전히 size > 500인 잔존 클러스터에만 (3) 적용. LLM에는 cluster digest 30건만 샘플링해서 sub-label 4–6개 생성, 그 sub-label로 단순 매칭(임베딩 cosine top1)으로 멤버십 부여. 비용 $5 미만.
- **포기한 대안 (1)의 이유:** 전체 재실행은 작은 562개 중 의미 있는 클러스터(p50=25 근처)까지 흔들고, "562 클러스터 위에 만든 기존 자산"(`clusters.json`, `normalized_cases.clustered.jsonl`) 호환을 깬다. 분포 꼬리만 잘라내면 충분.

### 검증 게이트 (사람 spot-check)

재클러스터링 후 **top 10 새 클러스터에서 무작위 5건씩 추출 → cluster_label과 실제 cases가 의미적으로 맞는지 사람이 OK** 줄 때까지 다음 단계 진입 금지. 게이트 통과 기준: 50건 중 ≥40건 OK.

---

## B. wiki-fs 디렉토리 설계

`WIKI-AGENTS.md:33-52`의 기존 `auto/sources|entities|concepts|syntheses|derived` 위에 **cases 도메인 5개 서브트리**를 추가한다. `entities/`·`concepts/`와는 별도 네임스페이스로 격리해 일반 ingest와 충돌 없게.

```
wiki/{workspaceId}/auto/
  cases/                      # raw 1:1 페이지 (선택 적재 — D 참조)
    {module-slug}/
      {YYYY}/
        {source-key}.md       # ex: opti-hr-attendance/2025/TSVD999-12345.md
  syntheses/cases/            # 클러스터별 합성 페이지 (시나리오 #1, #4의 핵심)
    {module-slug}/
      cluster-{numericClusterId}-{slug}.md
  companies/                  # 회사별 인덱스 + 특수 패턴 (시나리오 #2)
    {company-slug}.md
  playbooks/                  # 솔루션 라이브러리 (시나리오 #5)
    {module-slug}/
      {problem-slug}.md
  reports/
    monthly/{YYYY-MM}.md      # 월간 리포트 (시나리오 #3)
    escalation/{YYYY-MM}.md   # 에스컬레이션 룰 변동 (시나리오 #6)
  onboarding/
    se/{module-slug}.md       # 신규 SE 학습 경로 (시나리오 #4)
```

### Raw cases 페이지 — 적재 정책 (의견)

74,342개를 그대로 깔면: 1페이지 평균 2KB 잡아도 **150MB md + git pack ≈ 60MB**. 디스크는 문제 없지만 **page-first shortlist의 wiki_page_index가 75K 행으로 폭증**. lexical shortlist top-20은 IO 문제는 없으나, lint job(`apps/worker/src/jobs/wiki-lint.ts`)이 모든 페이지를 walk하는 비용이 커진다.

**권장: cluster digest를 정본으로 하고 raw는 archive 트리에 둔다.**

```
wiki/{ws}/auto/cases/{module}/{YYYY}/{source-key}.md   # ❌ 하지 않음
wiki/{ws}/auto/syntheses/cases/{module}/cluster-{id}.md  # ✅ 정본 합성
wiki/{ws}/_archive/cases/{module}/{YYYY}/{source-key}.md # ✅ raw, wiki_page_index 적재 안 함, 디스크에만
```

`_archive/` 트리는 `WIKI-AGENTS.md`에 없는 신규 컨벤션 — 이번 PR에서 §2에 한 줄 추가가 필요하다. 추가 규약: `_archive/`는 git 추적·grep 대상이지만 **wiki_page_index에 등재하지 않고 page-first shortlist에서 제외**. 합성 페이지 frontmatter `sources: [...]`로만 raw에 역참조.

### 페이지 frontmatter 스키마 (cases 도메인 추가 필드)

`WIKI-AGENTS.md:54-70`의 표준 frontmatter 위에 cases 전용 메타를 jsonb로 얹는다 (`wiki_page_index.frontmatter` GIN 인덱스 활용 — `packages/db/schema/wiki-page-index.ts:82-83`).

```yaml
# syntheses/cases/{module}/cluster-{id}.md
---
title: "근태관리 — 시차근무 마감 후 정정 요청 (cluster #135)"
type: synthesis
authority: auto
sensitivity: INTERNAL
aliases: ["시차근무 정정", "마감 후 근태 수정", "attendance correction"]
tags: ["domain/cases", "module/opti-hr/attendance", "cluster"]
sources: ["TSVD999-...", "TSVD999-..."]  # 대표 사례 source_key 5–10개
cases:
  module: "OPTI-HR / 근태관리"
  clusterId: 135
  caseCount: 4314
  topCompanies: ["JYP엔터테인먼트", "솔브레인", ...]
  topActions: ["...", "...", "..."]
  meanWorkHours: 1.4
  p99WorkHours: 6.2
  resolvedRate: 0.91
  timeRange: "2023-01..2026-04"
linkedPages: ["playbooks/opti-hr-attendance/시차근무-정정"]
---
```

`cases.*` 네임스페이스를 frontmatter 내부에 두어 일반 페이지의 frontmatter와 혼동을 막는다. 회사·playbook·monthly report 페이지도 동일한 `cases.*` jsonb 네임스페이스 안에서 각자 필드(예: `cases.company`, `cases.month`, `cases.escalationRule`).

### git commit 전략

`WIKI-AGENTS.md:225-228`의 single-writer + fast-forward + workspace-scoped pg-boss 큐를 그대로 쓰되, **bulk import는 1 transaction = 1 commit이면 첫 커밋이 5–10만 파일이 되어 `git status` 자체가 죽는다**. 따라서:

- **Bulk seed mode (1회성)**: 모듈 단위로 batch — OPTI-HR 9개 lower_category × 약 90 cluster digest = 약 800 페이지/commit. 9 commits + companies 600개를 100개씩 6 commits + playbooks/onboarding 약 100 commits. 총 약 25 commits로 끝.
- **Incremental mode (운영)**: 신규 case row가 들어와 cluster digest 갱신 → 그 cluster 페이지 1개만 update commit. 일반 ingest와 동일.

명시적으로 `[bulk-cases-seed]` 커밋 prefix를 새로 두어 `wiki_commit_log`(`packages/db/schema/wiki-commit-log.ts`)에서 운영 커밋과 분리 가능하게 한다.

---

## C. DB projection — `precedent_case` vs `wiki_page_index` 일원화

### 현재 모순

- `WIKI-AGENTS.md:27`: SSoT는 디스크. DB는 projection.
- `packages/db/schema/case.ts:33-115`: `precedent_case`는 raw 데이터 + embedding을 그대로 저장. SSoT 그 자체로 동작하도록 만들어져 있음.
- 둘 다 살리면 cluster_label 변경 시 DB와 디스크 양쪽 sync 필요 → drift 100% 발생.

### 권장안: **`precedent_case`는 raw archive 미러로 유지, `wiki_page_index`가 검색 권위**

`precedent_case`를 지우면 `import-cases-to-jarvis.ts`·`generate-cluster-digests.ts`가 깨지고 1주일 손해. 대신 다음 분업으로 SSoT 위반을 해소:

| 표 | 역할 | 검색 진입점 | 비고 |
|---|---|---|---|
| `precedent_case` | raw archive (≈ `_archive/` 디스크와 1:1) | ❌ Ask AI 진입점 아님 | embedding 컬럼은 keep (cluster digest 합성 시 사용), title/symptom/action도 유지 |
| `case_cluster` | 클러스터 메타데이터 | ❌ | digest_page_id가 wiki_page_index.id로 향하도록 FK 변경 |
| `wiki_page_index` | **검색·shortlist의 단일 권위** | ✅ page-first | cases 도메인 페이지(syntheses/companies/playbooks/reports/onboarding) 전체를 등재 |

**구체 변경:**
1. `case_cluster.digest_page_id` 의 참조를 `knowledge_page` → `wiki_page_index`로 마이그레이션 (`packages/db/schema/case.ts:139`). 기존 `knowledgePage`는 `surface='derived'`라는 다른 SSoT 모델이라 wiki-fs 피벗과 중복 — `WIKI-AGENTS.md:287` "knowledge_page.mdxContent 폐기"와 같은 방향.
2. `precedent_case.digest_page_id`도 동일 (`packages/db/schema/case.ts:65`).
3. **새 view**: `case_cluster_view` materialized view — `wiki_page_index` JOIN `case_cluster` JOIN `precedent_case`로 cluster의 size·top_companies·meanWorkHours를 한 번에. 월간 리포트와 회사별 차이 분석이 이걸 읽음.
4. frontmatter `cases.*` 메타는 `wiki_page_index.frontmatter` jsonb의 GIN 인덱스(`wiki_page_index.ts:82`)로 충분. 회사 인덱스가 자주 쓰이면 `(workspace_id, frontmatter->'cases'->>'module')` expression GIN을 추가.

**포기한 대안:** 기존 `knowledge_page.surface='derived'`를 cases digest의 home으로 쓰는 안. 사유: knowledge_page는 4-surface 모델(`knowledge.ts:55-57`)에 묶여 graph/audit/version 컬럼이 따라오는데, cases digest는 그 라이프사이클(승인 워크플로 등) 대부분이 불필요. wiki_page_index가 가벼워 적합.

---

## D. 자기참조 KB 추천 알고리즘 (시나리오 #1)

### 파이프라인 (page-first 확장)

`packages/ai/page-first/index.ts:39-178`의 4단계(shortlist → expand → read → synthesize) 위에 cases 전용 hint를 얹는다:

1. **분류 hint 생성**: 새 문의 텍스트 → 가벼운 LLM 한 콜(또는 keyword classifier)로 `module` 추정 + 핵심 명사 3–5개 추출. 비용 절감을 위해 `process_type`은 SE가 입력 폼에서 dropdown으로 미리 선택받는 안 권장.
2. **shortlist 변경 (`packages/ai/page-first/shortlist.ts`)**: 기존 lexical 검색에 추가로 `frontmatter->'cases'->>'module' = $module` 필터를 적용. 같은 모듈 내 cluster synthesis 페이지 top-15 + playbook 페이지 top-5 가져옴.
3. **임베딩 re-rank (옵션 가능 stage)**: shortlist 결과 페이지의 `cases.embedding`(synthesis 생성 시 frontmatter에 캐시) 또는 `precedent_case.embedding` 평균과 새 문의 임베딩 cosine top-N. precedent_case.embedding을 사용하면 wiki_page_index 단독 분리 원칙이 살짝 흐려지지만, **임베딩은 검색 보조 색인**이라 위배 아님(SSoT는 여전히 .md).
4. **합성 prompt에 강한 컨벤션**: "이 문의에 가장 비슷한 사례 N건은 ... 그 cluster의 top action은 ... 추천 답변은 ..." 형태로 고정 템플릿. 자유 합성 X.

### 모듈 cross 검색

기본은 같은 모듈 안. 단 shortlist 결과가 < 5개일 때(cold start) 같은 `higher_category` 안으로 확장, 그래도 < 3개면 전체 cases 도메인 fallback. 이 fallback 트리거는 응답 메타에 `coldStart=true`로 표시해 UI가 "유사 사례 부족"이라고 띄움.

### Cold start

새 모듈(예: SAP ERP / SAP PP, 21건뿐)은 cluster digest가 21건 평탄히 모여 있어 합성이 빈약. 이 경우 raw `_archive`의 해당 모듈 케이스를 직접 LLM에 read-pages 단계에서 inject — 합성 prompt에서 "raw 사례에서 직접 인용" 모드로 분기. 이건 일반 ingest는 raw 안 본다는 `WIKI-AGENTS.md:138-143` 원칙의 명시적 예외 — **cases 도메인 한정**.

---

## E. 회사별 차이 자동 페이지 (시나리오 #2)

### 데이터 흐름

`case_cluster_view`(C에서 정의)에서 `(module, cluster_id, company)` cube로 GROUP BY → 회사별 cluster 분포 비율. 그 옆에 모듈 전체 평균 분포를 둠. **outlier 정의: 회사 c의 cluster k 비율 > (모듈 평균 + 2σ)** AND `count(c, k) ≥ 10` (소표본 noise 제거).

### 페이지 레이아웃

`wiki/{ws}/auto/companies/{company-slug}.md` 본문 구조 (LLM 합성, deterministic 부분 + 자유 부분 분리):

```markdown
# {회사명}

## 헤더 통계 (auto)
- 총 문의: N
- 주요 모듈: ...
- 평균 work_hours: ...
- 평균 resolution_days: ...

## 이 회사만의 특수 패턴 (auto, outlier)
1. **[[syntheses/cases/.../cluster-XXX]]** — 그룹 평균 N% vs 이 회사 M%
2. ...

## 모듈별 빈도 (그룹 평균 대비)
| 모듈 | 회사 % | 그룹 평균 % | Δ |
|---|---:|---:|---:|

## LLM 노트
(왜 이 패턴이 두드러지는가에 대한 가설 — Two-Step CoT의 Generation 단계가 작성)
```

### 600개 회사를 다 만들 것인가

stats(`stats.md:50-82`) top 30 외에는 long tail. 권장: **건수 ≥ 100인 회사만 자동 생성** (대략 100~150개 추정). 그 외는 `companies/index.md` 카탈로그 한 페이지에 통계 행으로만. 100건 미만 회사의 outlier는 통계적으로 noise가 많아 자동 페이지가 거짓 패턴을 그릴 위험이 큼.

---

## F. 월간 리포트 자동 생성 (시나리오 #3)

### 트리거

`apps/worker/src/jobs/` 옆에 `cases-monthly-report.ts` 신규. cron: `0 3 1 * *` (KST 매월 1일 03:00). pg-boss schedule.

### 페이지 구조

```markdown
# {YYYY-MM} 사례 월간 리포트

## TL;DR (auto, 3줄)
## 모듈별 TOP 10 (deterministic 표 + bar)
## 새로 등장한 cluster (이번 달 첫 등장 ≥ 5건)
## 급증 패턴 (전월 대비 비율 > 2.0배 AND 절대수 ≥ 20)
## resolution_days 변화 (모듈별 p50 변화)
## 에스컬레이션 임계 초과 (work_hours > 8h, 전월 대비)
```

### SearchTrendsWidget 확장 vs 신규

`apps/web/app/(app)/dashboard/_components/SearchTrendsWidget.tsx:11`의 inline-bar UI는 단일 리스트용. 월간 리포트는 다섯 섹션이라 같은 컴포넌트로 무리. **권장: 새 widget `MonthlyCasesReportWidget`** — `SearchTrendsWidget`의 bar 시각만 재사용해 모듈별 TOP 10 섹션을 렌더, 나머지 섹션은 stat-strip + link list. dashboard 카드 1개 추가.

월간 리포트 페이지(.md)는 wiki에 적재 → dashboard widget은 그 페이지 frontmatter `cases.report.modulesTop10`을 읽어 렌더. 즉 **위젯은 페이지의 view**.

---

## G. 신규 SE 온보딩 학습 경로 (시나리오 #4)

### 학습 sequence 정의

각 모듈별 onboarding 페이지(`onboarding/se/{module}.md`)에 frontmatter `cases.learningPath: [...]`로 **클러스터 ID 시퀀스**를 둠. 결정 규칙(deterministic, 사람 검토 후 LLM 추천 허용):

1. **Tier 1 (binge first)**: caseCount 상위 5 클러스터 — 빈도 높은 일상 케이스
2. **Tier 2 (representative)**: caseCount 6~20위 중 topActions가 Tier 1과 겹치지 않는 5 클러스터 — 다양성
3. **Tier 3 (edge)**: meanWorkHours 상위 3 + resolvedRate 하위 3 — 어려운 케이스 노출

### 케이스→케이스 추천 그래프

cluster 간 유사도(평균 임베딩 cosine) top-3을 each cluster digest 페이지의 frontmatter `linkedPages`에 자동 삽입. UI에서 "이 케이스를 봤다면 다음" 박스 렌더. 별도 그래프 DB 불필요 — `wiki_page_link`(`packages/db/schema/wiki-page-link.ts`) 테이블이 이미 wikilink 그래프 projection이라 그대로 활용.

### 진행률 추적

DB에 신규 테이블 1개: `case_onboarding_progress(user_id, page_id, status, completed_at)`. localStorage는 거부 — 인사 평가 자료로 쓰일 가능성 ↑(권장 시 운영팀 검토 필요).

---

## H. 솔루션 라이브러리 (시나리오 #5)

### 풍부 row 기준

stats(`stats.md:9-14`): action p75 ≈ 200자(보수적 추정, p50=99 / p90=261), p99=500. **기준: action_len ≥ 200자 AND action에 "확인", "안내" 같은 generic 키워드만 있는 row 제외**. 약 30% = 22K row 추정.

### 페이지 생성 단위

`playbooks/{module}/{problem-slug}.md`. cluster ≠ playbook: 한 cluster가 여러 problem을 담고 있을 수 있음. 추출 절차:

1. cluster digest synthesis 단계에서 LLM에게 "이 cluster의 distinct problem-action 쌍을 최대 5개 추출"하라고 함.
2. 각 problem에 대해 `playbooks/{module}/{slug}.md` 생성. 본문은 정규화된 "이런 증상 → 이런 조치" 마크다운 템플릿.
3. cluster digest는 `linkedPages`로 playbook들을 가리킴.

비용: cluster 800개 × 평균 3 playbook = 2,400 playbook 페이지. LLM 콜은 cluster digest 생성 때 함께 — 추가 비용 없음.

---

## I. 에스컬레이션 룰 추출 (시나리오 #6)

### 위험 신호 정의

multivariate criteria (cluster 단위 집계):
- `meanWorkHours > 4h` (모듈 평균의 2배 이상)
- `p90 resolution_days > 7d`
- `process_type` 분포에서 `프로그램 오류 수정` ≥ 30%
- `severity = high|critical` ≥ 10%

이 4 기준 중 ≥ 2개 충족하는 cluster를 **"escalation-prone"**으로 라벨. cluster digest의 frontmatter `cases.risk.escalationProne: true` + `cases.risk.signals: [...]`.

### 새 문의 들어올 때 예측

자기참조 KB 추천(D)에서 top-3 cluster를 뽑은 직후, 그 cluster들의 `meanWorkHours` 평균을 응답에 부착: "이 패턴은 보통 N시간 걸립니다. 8시간 초과 case가 X% 보고됨."

별도 ML 모델 X. cluster 평균이 충분 — p99 work_hours 사례까지 정확히 맞출 필요 없음. 운영 안정 후 quantile regression 검토 가능.

### 알림 트리거

`apps/worker/src/jobs/cases-escalation-watch.ts` 신규. 매시 정각 cron. 새로 import된 case가 escalation-prone cluster에 속하고 + `requested_at`이 24h 지났는데 `resolved_at IS NULL` → Slack/email 발송. 알림 정책 자체는 운영팀 설계 — 이번 PR은 frontmatter flag와 worker hook만 깔아둔다.

---

## J. 실행 순서 + 의존성 그래프

```
[A] 재클러스터링 (in-place re-split top 10)
        │
        ▼
  ◆ 사람 spot-check (50건 중 ≥40 OK)
        │
        ▼
[B] wiki-fs 디렉토리 + frontmatter 스키마 PR
        │
        ▼
[C] case_cluster_view + digest_page_id 마이그레이션
        │
        ├──────────────┬──────────────┬───────────────┐
        ▼              ▼              ▼               ▼
  [D 자기참조 KB]  [H 솔루션 라이브러리]  [E 회사별]   [G 온보딩]
  (cluster digest 합성과 동시 작업, page-first shortlist 확장)
        │              │              │               │
        └──────┬───────┴──────────────┴───────────────┘
               ▼
        [F 월간 리포트 cron + widget]
               │
               ▼
        [I 에스컬레이션 룰 + worker hook]
```

병렬 가능: D / H / E / G (모두 cluster digest synthesis가 입력). 순차 강제: A → B → C → 나머지. F·I는 D~G의 frontmatter 합의가 잡힌 후.

### 비용/시간 재추정

가정: GPT-5.4-mini, 평균 1.5K input + 800 output token / cluster digest. 800 cluster × $0.0009 ≈ **$0.72 + Sonnet 보강 시 $5–8**. 회사 페이지 100개 × $0.002 = $0.2. playbook 2,400 × included in digest → 추가 0. 월간 리포트는 1회 $0.05. 합계 **약 $10 미만**.

시간: A=0.5d, B=0.5d, C=1d, D=2d, H=1d (병렬), E=1d (병렬), G=1d (병렬), F=1d, I=1d. **총 약 6–8 영업일 (1 dev)**, 병렬 진행 시 약 4–5 영업일.

---

## K. 위험·미해결 질문

1. **PII 잔존**. `[이름]`/`[사번]` 마스킹은 됐다고 명시(컨텍스트). 그러나 raw에서 추가 검증 필요: (a) JIRA/노션 URL 포함 여부, (b) 이메일 패턴 `[\w.+-]+@`, (c) 핸드폰 `01\d-\d{3,4}-\d{4}`, (d) 회사 내부 코드(예: `EMP\d{6}`). bulk import 전에 정규식 lint 1회 + sample 100건 사람 spot-check. → **B 단계 게이트에 추가**.

2. **클러스터 라벨 품질**. 현재 라벨이 `근태관리 / [e-HR] 요청사항 확인 및 안내 / OPTI-HR` 형식 = 의미 없음. 재클러스터링과 별개로 **LLM에 cluster digest 생성 시 새 label 부여 의무**. 한 cluster당 input 30 case → "이 클러스터의 명확한 한국어 제목 1줄" 출력. cluster digest synthesis와 같은 콜이라 추가 비용 0.

3. **600 회사 + 1 워크스페이스 ACL**. `sensitivity=INTERNAL` 단일로 두면 모든 SE가 모든 회사 케이스를 봄. 운영상 대부분 OK이지만, 일부 회사(금융/방산 도메인)는 정보 격리 필요할 수 있음. 권장: companies 페이지 frontmatter의 `requiredPermission`을 `cases:read:{company-slug}` 형태로 두고, 기본 정책은 모든 SE에게 부여하되 추후 회사 단위로 회수 가능한 구조만 깔아둠. → **운영팀 결정 필요** (open question).

4. **중복 코드 정리**. `scripts/generate-cluster-digests.ts`는 `knowledge_page` 기반(`generate-cluster-digests.ts:21`). C에서 `wiki_page_index`로 옮기면 이 스크립트는 deprecated. 옮기는 동안 동작 중복 위험 → feature flag `FEATURE_CASES_WIKI_FS=true`로 기존 path와 분기. 충분히 검증 후 삭제. → **cleanup PR 별도 (B 다음)**.

5. **lint job 비용**. `apps/worker/src/jobs/wiki-lint.ts`가 모든 페이지 walk → cases 도메인 추가 후 약 4,000 페이지 (synthesis 800 + companies 100 + playbooks 2,400 + reports 50 + onboarding 30 + 기존 600). 한국어 의미 lint를 LLM으로 돌리면 약 $5/주. 권장: cases 도메인은 lint 빈도 절반(격주). frontmatter `lintCadenceWeeks: 2` 신규 필드.

6. **재클러스터링 idempotency**. in-place re-split이 numericClusterId를 새로 발급하면 기존 raw row의 `cluster_id`가 깨짐. 정책: re-split된 cluster는 `parent_cluster_id` 컬럼 신규 + 새 ID는 1000번대부터 발급. `precedent_case.cluster_id`는 자식 ID로 update, `case_cluster.parent_cluster_id`로 역추적 가능. → **마이그레이션 스크립트 1개 필요**.

---

## 다음 한 걸음 (사용자 승인 시 즉시 시작)

**`scripts/recluster-top-clusters.py` 작성** — 기존 `data/cases/normalized_cases.clustered.jsonl`을 입력으로, top 10 거대 클러스터(>1000건)에 대해 in-place TF-IDF + MiniBatchKMeans re-split을 수행해 `data/cases/normalized_cases.reclustered.jsonl`과 `data/cases/clusters_v2.json`을 생성한다 (parent_cluster_id 보존). DB 변경 없음, .bak 보존, dry-run/limit 옵션 포함, **사람 spot-check용 샘플 50건도 함께 출력**.

이 한 단계가 끝나야 B 이후 모든 후속 설계가 의미 있는 cluster 분포 위에 얹힌다. 30분~1시간 작업.
