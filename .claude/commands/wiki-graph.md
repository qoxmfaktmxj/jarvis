---
description: "LLM Wiki graph build: Graphify 네이티브 바이너리로 workspace의 knowledge graph 생성 + derived/code 페이지 import (격리)"
argument-hint: "{workspaceId}  (예: 0199a8ff-xxxx-xxxx-xxxx-xxxxxxxxxxxx — 필수)"
---

# /wiki-graph — Jarvis LLM Wiki Graph Build

**입력:** `$ARGUMENTS` = `workspaceId` (필수).
**Node-only.** Python CLI 없음. 외부 툴은 Graphify **네이티브 바이너리**만 호출.
**격리 원칙:** Graphify 결과는 `wiki/{workspaceId}/auto/derived/code/**`에만 기록. **entities/concepts 본문을 직접 덮어쓰지 않는다.** LLM ingest가 필요 시 derived/code를 Read하고 합성해서 entity/concept 본문을 만든다.

관련 계약:
- `WIKI-AGENTS.md` §3.4 Graph (Graphify 통합), §11 회귀 방지
- `docs/analysis/99-integration-plan-v4.md` W3-T2 (Graphify derived/code 격리)
- FS API: `packages/wiki-fs`
- 쓰기는 **single-writer 큐** (`wiki.graph.{workspaceId}`) 경유.
- Graphify 바이너리 호출은 기존 Jarvis 통합 wrapper (`packages/ai/graphify-runner.ts` 또는 상응 모듈) 경유.

---

## 선행 체크

1. `FEATURE_WIKI_FS_MODE=true` AND `FEATURE_GRAPHIFY_DERIVED_PAGES=true` 확인. 후자 false면 기능 비활성 안내 후 종료.
2. `workspaceId` 인자 필수. 미제공 시 에러 후 사용용 힌트 출력.
3. 호출자 권한: `knowledge:update` (또는 동등). sensitivity 게이트 통과 필수.
4. Graphify 바이너리 존재·버전 확인 (없으면 설치 안내 후 종료).
5. 입력 소스 범위 결정:
   - `raw_source` 중 `mimeType` in 코드(`text/x-*`, `application/json`, tree-sitter 지원 확장자) 또는 git repo 스냅샷.
   - **대상 파일은 RESTRICTED 이하 sensitivity만**. SECRET_REF_ONLY는 Graphify 입력에서 제외.

---

## 4단계 워크플로우

### Step 1 — Graphify 실행

1. `packages/ai/graphify-runner` (또는 기존 wrapper)로 Graphify 네이티브 바이너리 호출. 입력: workspace-scope 코드 소스.
2. 결과물:
   - `graph.json` — nodes[] + edges[] (Graphify 공식 스키마)
   - `graph.html` — 기존 통합 경로에서 viewer 리소스
3. 결과는 **temp 디렉토리**에 먼저 저장. 곧바로 wiki/에 쓰지 않는다.
4. `llm_call_log` op = `wiki.graph.extract` 기록 (바이너리 실행은 LLM은 아니지만 단가·시간 계측을 위해 동일 로그 테이블 사용).

### Step 2 — Graph → Wiki Pages 변환

1. `graph.json`을 파싱.
2. 각 node별로 `wiki/{workspaceId}/auto/derived/code/{path}.md` 페이지를 생성.
   - path 규칙: 원 소스 경로를 그대로 미러링하되 확장자는 `.md`. 예: `src/lib/foo.ts` → `auto/derived/code/src/lib/foo.ts.md`.
   - **기존 `auto/entities/` / `auto/concepts/` 경로를 덮지 않는다.** `derived/code/**`로 고립.
3. 페이지 frontmatter:

```yaml
---
title: "{원 파일명 or symbol name}"
type: derived
workspaceId: "{uuid}"
sensitivity: "{원 소스와 동일}"
requiredPermission: "knowledge:read"
sources: [원 raw_source_id들]
aliases: ["{symbol 한국어 별칭이 있으면}", "{camelCase ↔ kebab-case}", ...]
tags: ["derived/code", "lang/{ts|py|...}", "module/{top-level dir}"]
authority: auto
created: {YYYY-MM-DDTHH:MM:SSZ}
updated: {YYYY-MM-DDTHH:MM:SSZ}
linkedPages: [연결된 다른 derived/code 페이지들]
graphNodeId: "{Graphify node id}"
confidence: 1.0            # Step 3에서 교정
---
```

4. 본문은 Graphify가 추출한 symbol signature, import/export, 이웃 node 요약을 구조화해 기록. 자유 텍스트 합성은 금지 (LLM 안 돌린다).
5. edges는 `[[wikilink]]`로 직렬화. target이 다른 derived/code 페이지면 wikilink 생성. entity/concept 페이지 링크는 Step 3에서 처리.

### Step 3 — 3-Tier 신뢰도 태깅 (필수)

**모든 edge와 page annotation은 세 등급 중 하나로 태깅한다.** 구분 없이 기록 금지.

| Tier | 기준 | 처리 |
|------|------|------|
| **EXTRACTED** | Graphify가 AST·tree-sitter로 직접 추출한 결정적 사실 (import, function call, class inheritance 등) | 바로 페이지 본문에 기록. `confidence: 1.0`. |
| **INFERRED** | 휴리스틱·통계 기반 (이름 유사도, 호출 빈도로 추정한 "관련 있음") | 본문 별도 섹션 `## Inferred Relations`에 `confidence: 0.0~1.0` 명시. `confidence < 0.7`은 표시 안 함 (내부 메모만). |
| **AMBIGUOUS** | 수동 검토 필요 (중복 symbol, cross-cutting concern 지연 평가 등) | 페이지 본문에 포함하지 않고 `wiki_review_queue(kind='graph', subkind='ambiguous_edge')`에 enqueue. 관리자 승인 후 INFERRED/EXTRACTED로 승격. |

**Tier 미지정 edge는 기록 거부.** 바이너리 출력이 tier 정보를 안 주면 `AMBIGUOUS`로 보수적으로 분류.

### Step 4 — Single-Writer Commit + Projection

1. Step 2에서 만든 모든 파일과 수정을 **temp worktree**에 배치.
2. `packages/wiki-fs`의 `validateFrontmatter`, `validateWikilinks`, `validateSensitivity`로 검사. 실패 시 전체 abort + `wiki_review_queue(kind='graph_validation_fail')`.
3. single-writer 큐 통과 후 main에 fast-forward merge.
4. commit message: `[graph] {workspaceId} — {N}개 derived/code 페이지 생성, {M}개 갱신`.
5. commit author: `jarvis-wiki-bot <bot@wiki.invalid>` 고정.
6. `log.md`에 `## [YYYY-MM-DD] graph | {요약}` append.
7. **DB projection sync:**
   - `wiki_page_index` — derived/code 페이지 upsert.
   - `wiki_page_link` — EXTRACTED edges 재계산.
   - `wiki_commit_log` — commitSha + op=`graph` + affectedPages[].
   - `graphSnapshot` 테이블 (신설 or 기존) 갱신: `{workspaceId, builtAt, nodeCount, edgeCount, byTier: {EXTRACTED, INFERRED, AMBIGUOUS}, graphJsonPath, graphHtmlPath}`.

---

## 격리 규칙 (절대)

- `wiki/{workspaceId}/auto/entities/**` 는 **수정 대상에서 배제.** 읽지도 쓰지도 않는다. (LLM ingest가 별도로 derived/code를 참조해 entity 페이지를 합성할 때는 `/wiki-ingest` 경로에서 처리.)
- `wiki/{workspaceId}/auto/concepts/**` 동일.
- `wiki/{workspaceId}/manual/**` 동일 (Read-only).
- 기존 Graphify wrapper가 entities/concepts에 쓰려고 하면 즉시 abort + review_queue 기록.
- Graphify 결과가 기존 derived/code 페이지를 완전히 덮어쓰는 것은 허용. 이전 버전은 git history로 남는다.

---

## MindVault 회귀 방지 — Graphify 특화

- Graphify 단독으로 "지식 컴파일"을 하는 것처럼 보이면 안 된다. 이 커맨드는 **구조 보조**만 담당.
- INFERRED/AMBIGUOUS 비중이 EXTRACTED보다 크면 경고: Graphify 설정 재검토 필요.
- derived/code 페이지의 aliases가 비어도 무방 (기계 추출된 symbol이면 별칭 개념이 약함). 단 title·path 기반의 기본 alias 1개는 자동 생성.
- entity/concept 본문과 derived/code 본문을 **혼동하지 말 것** — 서로 다른 wiki tree에 분리.

---

## 관측

- `llm_call_log`:
  - `wiki.graph.extract` — Graphify 바이너리 실행 시간/메모리
  - (LLM 호출 없음. Step 2~4는 pure 변환)
- `graphSnapshot`에 각 실행 기록 누적 → Admin 대시보드에서 tier 분포 추적.
- 비용은 바이너리 CPU·IO만 집계.

---

## 완료 요약 템플릿

```
## Graph 결과: {workspaceId}
- commitSha: {sha}
- Graphify node 수: {N}, edge 수: {M}
  - EXTRACTED: {a}, INFERRED(score≥0.7): {b}, AMBIGUOUS: {c}
- 생성된 derived/code 페이지: {P}
- 갱신된 derived/code 페이지: {Q}
- review_queue 엔트리 (ambiguous): {c}
- graphSnapshot 업데이트: OK / FAIL
- 다음 단계:
  - /wiki-ingest 를 재실행하면 LLM이 derived/code를 참조해 entities/concepts 페이지를 합성한다
  - ambiguous edge 관리자 승인: /admin/wiki/review-queue?kind=graph
```
