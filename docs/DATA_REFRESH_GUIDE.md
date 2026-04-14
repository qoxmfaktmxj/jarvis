# Data Refresh Guide — 데이터 최신화 운영 가이드

> **최초 작성:** 2026-04-14  
> **대상:** TSVD999 유지보수 사례 / 가이드북 위키 / EHR 소스 코드 그래프  
> **주기:** TSVD999 월 1회 / 가이드북 수시 / EHR 그래프 분기 1회

---

## 1. TSVD999 유지보수 사례 최신화 (월 1회)

### 1.1 현재 상태

| 항목 | 값 |
|------|-----|
| 전체 원본 행 | 124,232 |
| 유효 케이스 (DB) | 74,342 (CONTENT_TEXT 없는 garbage 제외) |
| 클러스터 | 562 (TF-IDF + KMeans) |
| 임베딩 | 74,342건 전부 (TF-IDF+SVD 1536d, API 비용 $0) |
| 마지막 import | 2026-04-14 |

### 1.2 월별 최신화 절차

매 월 신규 TSVD999 데이터를 Oracle에서 추출 → 정규화 → 클러스터 → Jarvis DB로 import.

#### Step 1: Oracle 추출 (신규분만)

```powershell
# 환경변수 설정
$env:ORACLE_USER = "EHR_SSMS"
$env:ORACLE_PASSWORD = "<비밀번호>"
$env:ORACLE_JDBC_URL = "jdbc:oracle:thin:@203.231.40.63:1521:UDSHRD"

# 전월 데이터만 추출 (예: 2026년 4월)
# REGISTER_DATE 기준으로 필터링
java -cp "scripts;C:\EHR_PROJECT\isu-hr\EHR_HR50\target\mvn-lib\ojdbc8-21.5.0.0.jar" `
  ExportTsvd999Chunk `
  --start 1 --end 999999 `
  --where "REGISTER_DATE >= '2026-04-01' AND REGISTER_DATE < '2026-05-01'" `
  --output "data/cases/chunks/tsvd999_2026_04.tsv"
```

> **Note**: 현재 ExportTsvd999Chunk.java는 `--where` 파라미터를 아직 지원 안 함.
> 전체 추출 후 Python에서 날짜 필터를 적용하거나, Java 소스에 WHERE 절 지원을 추가해야 함.

#### Step 2: 정규화 (heuristic, API 비용 $0)

```powershell
py scripts/normalize-tsvd999.py `
  --input data/cases/chunks/tsvd999_2026_04.tsv `
  --output data/cases/normalized_cases.jsonl `
  --mode heuristic `
  --resume `
  --drop-empty
```

#### Step 3: 재클러스터링

```powershell
py scripts/cluster-cases.py `
  --input data/cases/normalized_cases.jsonl `
  --output data/cases/clusters.json `
  --cases-output data/cases/normalized_cases.clustered.jsonl `
  --method tfidf `
  --target-cluster-size 30
```

#### Step 4: DB 재적재

```powershell
pnpm exec tsx scripts/import-cases-to-jarvis.ts `
  --workspace-id b4c3f631-2b7d-43eb-b032-9e9f410ba5ec `
  --cases data/cases/normalized_cases.clustered.jsonl `
  --clusters data/cases/clusters.json `
  --create-digests `
  --replace-imported-tsvd
```

#### Step 5: 임베딩 재생성

```powershell
py scripts/generate-tfidf-embeddings.py
```

#### Step 6: 검증

```powershell
docker exec jarvis-postgres psql -U jarvis -d jarvis -c "
SELECT
  COUNT(*) as total_cases,
  COUNT(embedding) as with_embedding,
  (SELECT COUNT(*) FROM case_cluster WHERE workspace_id='b4c3f631-2b7d-43eb-b032-9e9f410ba5ec') as clusters
FROM precedent_case
WHERE workspace_id='b4c3f631-2b7d-43eb-b032-9e9f410ba5ec';
"
```

### 1.3 Claude Code로 최신화할 때 사용할 프롬프트

아래 프롬프트를 Claude Code 세션에서 그대로 사용:

```
TSVD999 월별 최신화를 실행해줘.

1. data/cases/chunks/ 에 이번 달 TSV 파일이 있으면 사용하고, 없으면 전체 재추출이 필요한지 확인해줘
2. normalize-tsvd999.py --mode heuristic --resume --drop-empty 로 정규화
3. cluster-cases.py --method tfidf --target-cluster-size 30 으로 재클러스터링
4. import-cases-to-jarvis.ts --replace-imported-tsvd 로 DB 재적재
5. generate-tfidf-embeddings.py 로 임베딩 재생성
6. DB 검증 쿼리 실행해서 결과 보여줘

workspace-id: b4c3f631-2b7d-43eb-b032-9e9f410ba5ec
```

### 1.4 비용

| 항목 | 비용 |
|------|------|
| Oracle 추출 | $0 (JDBC 로컬) |
| heuristic 정규화 | $0 (규칙 기반) |
| TF-IDF 클러스터링 | $0 (scikit-learn 로컬) |
| TF-IDF 임베딩 | $0 (scikit-learn 로컬) |
| **월 총 비용** | **$0** |

> OpenAI embedding으로 업그레이드 시: 약 $2-3/월 (text-embedding-3-small, 7만건)

---

## 2. 가이드북 위키 최신화 (수시)

### 2.1 현재 상태

| 항목 | 값 |
|------|-----|
| 원본 | `data/guidebook/isu-guidebook-full.md` (3,732줄) |
| canonical 페이지 | 95건 (knowledge_page surface=canonical) |
| 관계 그래프 | 107 nodes, 3,107 edges |

### 2.2 최신화 절차

가이드북 내용이 변경되면:

```powershell
# 1. 가이드북 파일 교체
cp "새로운-가이드북.md" data/guidebook/isu-guidebook-full.md

# 2. canonicalize (섹션 분리 + frontmatter 생성)
pnpm exec tsx scripts/canonicalize-guidebook.ts `
  --full data/guidebook/isu-guidebook-full.md `
  --home data/guidebook/isu-guidebook-home.md `
  --out data/canonical

# 3. DB seed (upsert — 기존 페이지 업데이트, 새 페이지 추가)
pnpm exec tsx scripts/seed-canonical.ts `
  --workspace-id b4c3f631-2b7d-43eb-b032-9e9f410ba5ec `
  --dir data/canonical

# 4. 관계 그래프 재생성
pnpm exec tsx scripts/build-guidebook-graph.ts `
  --dir data/canonical
```

### 2.3 Claude Code 프롬프트

```
가이드북 위키를 최신화해줘.
data/guidebook/isu-guidebook-full.md 파일이 업데이트됐어.
canonicalize → seed → graph 순서로 실행하고 결과 보여줘.
workspace-id: b4c3f631-2b7d-43eb-b032-9e9f410ba5ec
```

---

## 3. EHR 소스 코드 그래프 (분기 1회)

### 3.1 현재 상태

EHR HR 솔루션 소스 코드가 graphify로 분석된 결과가 아래에 있음:

| 경로 | 내용 |
|------|------|
| `C:\EHR_PROJECT\harness-test\isu-hr\db-schema\` | Oracle DDL (27개 모듈, 1,400+ 테이블/프로시저/함수) |
| `C:\EHR_PROJECT\harness-test\isu-hr\modules\` | Java 소스 + graphify 분석 결과 (11개 모듈) |

#### Graphify 분석 완료 모듈 (11개)

각 모듈의 `graphify-out/` 디렉토리에 아래 파일이 생성됨:
- `graph.json` — 노드/엣지 구조화 그래프
- `graph.html` — 시각화 HTML
- `GRAPH_REPORT.md` — 분석 리포트

### 3.2 Jarvis 연동 전략

EHR 소스 그래프를 Jarvis에 연동하는 3가지 방법:

#### Option A: graph.json → Jarvis graph_snapshot import (권장)

각 모듈의 `graph.json`을 Jarvis `graph_snapshot` + `graph_node` + `graph_edge`로 import.
장점: 기존 graph-context.ts 검색 인프라 바로 활용 가능.

```powershell
# 예시: HRI 모듈 그래프 import
pnpm exec tsx scripts/import-graphify-snapshot.ts `
  --input "C:\EHR_PROJECT\harness-test\isu-hr\modules\HRI\graphify-out\graph.json" `
  --workspace-id b4c3f631-2b7d-43eb-b032-9e9f410ba5ec `
  --snapshot-title "EHR HRI Module" `
  --scope "ehr-hri"
```

> **Note**: `import-graphify-snapshot.ts` 스크립트는 아직 미작성. 다음 개발 사이클에서 구현 필요.

#### Option B: GRAPH_REPORT.md → knowledge_page (간단)

각 모듈의 `GRAPH_REPORT.md`를 knowledge_page에 insert.
장점: 추가 스크립트 없이 기존 seed 파이프라인 활용.

```powershell
# 각 모듈의 GRAPH_REPORT.md를 data/canonical/ 에 복사 후 seed
cp "C:\EHR_PROJECT\...\HRI\graphify-out\GRAPH_REPORT.md" data/canonical/ehr-hri-graph-report.md
# frontmatter 추가 후 seed-canonical.ts 실행
```

#### Option C: 결합 (A + B)

graph.json은 검색 인프라로, GRAPH_REPORT.md는 문서로 동시 활용.

### 3.3 분기 최신화 절차

EHR 소스 코드가 업데이트되면:

```powershell
# 1. modules 디렉토리에서 graphify 재실행
cd C:\EHR_PROJECT\harness-test\isu-hr\modules
py run_graphify_module.py  # 기존 스크립트 사용

# 2. Jarvis에 import (Option A 기준)
foreach ($module in @("BEN","CPN","HRD","HRI","HRM","ORG","PAP","SYS","TIM","TRA","WTM")) {
  pnpm exec tsx scripts/import-graphify-snapshot.ts `
    --input "C:\EHR_PROJECT\...\modules\$module\graphify-out\graph.json" `
    --workspace-id b4c3f631-2b7d-43eb-b032-9e9f410ba5ec `
    --snapshot-title "EHR $module Module" `
    --scope "ehr-$($module.ToLower())"
}
```

### 3.4 Claude Code 프롬프트

```
EHR 소스 그래프를 Jarvis에 최신화해줘.

C:\EHR_PROJECT\harness-test\isu-hr\modules\ 아래 11개 모듈의 graphify-out/graph.json을
Jarvis graph_snapshot에 import해줘.
workspace-id: b4c3f631-2b7d-43eb-b032-9e9f410ba5ec

이미 같은 scope의 snapshot이 있으면 replace 해줘.
```

---

## 4. 데이터 버전 관리 정책

### 4.1 원칙

| 데이터 종류 | 버전 관리 | 보관 위치 | 주기 |
|------------|----------|----------|------|
| TSVD999 normalized JSONL | git 제외 (.gitignore) | `data/cases/` 로컬 | 월 1회 덮어쓰기 |
| 가이드북 원본 | git 제외 | `data/guidebook/` 로컬 | 수시 교체 |
| canonical 페이지 MD | git 제외 | `data/canonical/` 로컬 | canonicalize 시 재생성 |
| DB schema migration | **git 추적** | `packages/db/drizzle/` | 스키마 변경 시 |
| 스크립트 코드 | **git 추적** | `scripts/` | 코드 변경 시 |

### 4.2 백업 권장

```powershell
# 월별 스냅샷 (import 전 백업)
$date = Get-Date -Format "yyyy-MM"
Copy-Item data/cases/normalized_cases.clustered.jsonl "data/cases/backup/cases-$date.jsonl"
Copy-Item data/cases/clusters.json "data/cases/backup/clusters-$date.json"
```

---

## 5. 전체 최신화 체크리스트

매 월 1회 (추천: 매 월 첫째 주 월요일):

- [ ] TSVD999: Oracle에서 신규 건 추출
- [ ] TSVD999: heuristic 정규화 실행
- [ ] TSVD999: TF-IDF 재클러스터링
- [ ] TSVD999: Jarvis DB replace import
- [ ] TSVD999: TF-IDF 임베딩 재생성
- [ ] TSVD999: DB 검증 쿼리 실행

수시 (가이드북 변경 시):
- [ ] 가이드북: canonicalize 실행
- [ ] 가이드북: seed-canonical 실행
- [ ] 가이드북: 관계 그래프 재생성

분기 1회 (EHR 소스 업데이트 시):
- [ ] EHR: graphify 재실행
- [ ] EHR: graph.json → Jarvis snapshot import
