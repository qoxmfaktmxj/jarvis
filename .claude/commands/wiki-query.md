---
description: "LLM Wiki page-first query: compiled wiki page를 탐색·합성해 답변한다 (raw chunk RAG 금지)"
argument-hint: "{자연어 질문}  (예: \"사내 휴가 정책에서 반차 규정은?\")"
---

# /wiki-query — Jarvis LLM Wiki Page-First Query

**입력:** `$ARGUMENTS` = 사용자 자연어 질문.
**Node-only.** 모든 검색·합성은 `packages/wiki-agent/prompts/` + `packages/wiki-fs`.
**핵심 원칙:** **raw chunk retrieval 금지.** `document_chunks`, 벡터 유사도 검색, RRF 하이브리드, `knowledge_claim.embedding` 전부 **사용하지 말 것**. 답변 소스는 항상 compiled wiki page다.

관련 계약:
- `WIKI-AGENTS.md` §3.2 Query (Page-first Navigation), §11 회귀 방지
- `docs/analysis/99-integration-plan-v4.md` W2-T2 (`ask.ts` page-first 분기)
- FS API: `packages/wiki-fs.readPage()`
- 프롬프트: `packages/wiki-agent/prompts/query.ts` (합성 템플릿)

---

## 선행 체크

1. `FEATURE_WIKI_FS_MODE=true` 인가? 아니면 중단.
2. `FEATURE_PAGE_FIRST_QUERY=true` 인가? false면 legacy `ask.ts` 경로로 라우팅 안내 후 종료.
3. `FEATURE_RAW_CHUNK_QUERY` **반드시 false**. true이면 사용자에게 "레거시 RAG 경로 활성화 상태 — 이 커맨드 결과와 혼용 금지"를 경고.
4. 호출자 세션 권한 + clearance 확인 (sensitivity 필터의 기준).
5. `workspaceId`는 세션 컨텍스트에서 자동 주입. multi-tenant 격리 필수.

---

## 6단계 워크플로우 (Page-first Navigation)

### Step 1 — Index Load

`packages/wiki-fs.readPage('wiki/{workspaceId}/index.md')` 로드해서 전체 카탈로그를 컨텍스트에 확보.

### Step 2 — Lexical Shortlist (top-20)

`wiki_page_index`에서 lexical 기반 후보 선정. **벡터 검색 금지, `pg_trgm`/ILIKE 기반만 사용.**

SELECT 필드 (WHERE절에서 `workspaceId` 필수):
- `title` ILIKE 매칭
- `aliases` 배열 unnest 매칭 (한국어 동의어 — "마인드볼트" ↔ "MindVault" 함정 회피)
- `tags` 매칭
- `path` ILIKE 매칭
- `pg_trgm similarity(title || ' ' || array_to_string(aliases, ' '), $query)` 점수화
- `updated DESC` freshness bonus (최근 ingest 우선)

결과: 상위 20건 `{path, title, sensitivity, updated, score}`.

### Step 3 — Link Expansion (1-hop)

`wiki_page_link`에서 shortlist 페이지의 outbound + inbound 1-hop 이웃을 추가. inbound count 높은 **hub page** 우선. 결과는 shortlist와 합쳐 dedup.

### Step 4 — Sensitivity Filter (DB WHERE)

DB 쿼리 시점에 다음을 강제 적용:
- `workspaceId = :currentWorkspace`
- `sensitivity <= :callerClearance` (enum 순위 비교)
- `requiredPermission IN :callerPermissions`
- `published = true` (review_queue 미승인 페이지 제외)

**필터는 DB WHERE에서**. 애플리케이션 레이어에서만 거르면 이중 검증이 필요해진다. 둘 다 해도 좋지만, WHERE가 1차 방어선.

### Step 5 — Page Read (top 5~8)

상위 5~8개 페이지를 `packages/wiki-fs.readPage()`로 실제 Read (frontmatter + 본문).
- `manual/**` 페이지도 Read 대상 (참조는 OK, 이번 커맨드는 수정 안 함).
- Read 대상 수는 컨텍스트 예산에 따라 조정 (대형 페이지면 5, 소형이면 8).

### Step 6 — Answer Synthesis

`packages/wiki-agent/prompts/query.ts` 합성 프롬프트 호출:

출력 규약:
1. **답변 본문** — markdown. 주장마다 `[[페이지명]]` wikilink 인용 필수.
2. **## 출처** 섹션 — 실제 Read한 페이지 path 목록 + 각 페이지의 gitSha.
3. **## 미답 영역** (선택) — 질문 중 wiki에 근거 없는 부분을 명시. 거짓 합성 금지.
4. 인용한 페이지 frontmatter의 `sensitivity`가 호출자 clearance 이하인지 **한 번 더 확인**. 초과 시 그 인용은 redact.

### Step 7 (옵션) — Save as Page

사용자가 답변을 영속화 원하면:
1. `FEATURE_SAVE_AS_PAGE=true` 확인.
2. 사용자에게 확인 prompt: "이 답변을 `wiki/{workspaceId}/auto/syntheses/{slug}.md`로 저장할까요?"
3. 승인 시 **single-writer 큐 통과**. frontmatter: `type: synthesis`, `sources: [인용된 페이지들]`, `aliases: [...]`, sensitivity는 **참조한 페이지들 중 최고 수준**.
4. commit message: `[synthesis] {질문 요약} → {path}`.
5. `wiki_page_index`, `wiki_page_link`, `wiki_commit_log` 전부 projection sync.

---

## 절대 금지 (raw chunk retrieval 금지)

다음 경로는 **이 커맨드에서 절대 호출하지 말 것**. 발견 시 리뷰 단계(superpowers:subagent-driven-development의 spec-reviewer)에서 실패로 간주.

| 금지 대상 | 사유 |
|-----------|------|
| `document_chunks` SELECT / 조인 | Karpathy 피벗 이후 레거시 |
| `knowledge_claim.embedding` / pgvector 검색 | 벡터 RAG 폐기 |
| OpenSearch `/ask` chunk 쿼리 | 동일 |
| RRF 하이브리드 점수화 | 동일 |
| `knowledge_page.mdxContent` SELECT | 본문 SSoT는 디스크. 읽으면 G11 게이트 실패 |
| `wiki_sources.body`, `wiki_concepts.body` SELECT | 동일 |

질문이 "파일 원문의 N페이지" 같은 구체적 raw chunk를 요구하면 "해당 기능은 현재 비활성화되어 있으며 compiled wiki page를 통해서만 답변합니다"로 안내하고 종료.

---

## 빈 위키 · 결과 없음 처리

- `wiki_page_index`에 workspace의 페이지가 0건 → "해당 워크스페이스 위키가 비어 있습니다. `/wiki-ingest {raw_source_id}`로 raw_source부터 ingest하세요"로 안내.
- shortlist 0건 → 원인 분석 (오탈자 / 한국어 동의어 부족 / sensitivity 차단). 동의어 부족이 의심되면 `/wiki-lint` 권장.
- sensitivity 필터로 전부 걸러짐 → "질문과 관련된 페이지가 있으나 현재 권한으로 접근 불가"로 응답. 어떤 페이지가 있었는지 제목·본문 유출 금지.

---

## 관측

- 각 단계 `llm_call_log` op:
  - Step 6 synthesis → `wiki.query.synthesize`
  - Step 2 shortlist 점수화에 LLM 사용 시 → `wiki.query.shortlist` (기본은 pure SQL)
- `page_first_recall` 메트릭 측정용으로 shortlist top-5 중 실제 Read된 페이지 수 기록.
- Sentry breadcrumb: `wiki.query.*`.

---

## 완료 요약 템플릿

```
## Query 답변
{답변 본문 (wikilink 인용 포함)}

## 출처
- [[path/to/page1]] (gitSha)
- [[path/to/page2]] (gitSha)

## 미답 영역 (있는 경우)
- {질문의 어떤 부분이 wiki에 근거 없음}

## 메타
- shortlist: {N}개 → link-expanded: {M}개 → sensitivity 필터 후: {K}개 → Read: {5~8}개
- raw chunk retrieval: OFF (정상)
- Save as Page? (원하면 승인 요청)
```
