---
description: "LLM Wiki ingest: raw_source 1건을 Two-Step CoT로 분석해 다수 페이지를 동시 갱신한다"
argument-hint: "{raw_source_id}  (예: 01HXXXXXXXXXXXXXXXXXXXXXX — DB raw_source.id 또는 MinIO objectKey)"
---

# /wiki-ingest — Jarvis LLM Wiki Ingest

**입력:** `$ARGUMENTS` = `raw_source_id` (DB `raw_source.id`. MinIO objectKey는 서버가 조회)
**Node-only.** Python CLI 포팅 없음. Analysis/Generation은 `packages/wiki-agent/prompts/`에서 호출.
**진실원천:** 디스크·Git (`wiki/{workspaceId}/auto/**`). DB 테이블(`wiki_page_index`, `wiki_page_link`, `wiki_commit_log`, `wiki_review_queue`)은 **projection**이며 절대 SSoT 아님.

관련 계약:
- `WIKI-AGENTS.md` §3.1 Ingest, §5 Single-Writer + Git, §11 MindVault 회귀 방지 체크리스트
- `docs/analysis/99-integration-plan-v4.md` W1-T3 / W2-T1
- 프롬프트: `packages/wiki-agent/prompts/analyze.ts`, `generate.ts`
- FS API: `packages/wiki-fs` (직접 `fs.writeFile` 금지)

---

## 선행 체크 (시작 전 반드시 확인)

1. `FEATURE_WIKI_FS_MODE=true` 인가? 아니면 중단하고 사용자에게 경고.
2. `FEATURE_TWO_STEP_INGEST=true` 인가? false면 legacy ingest 경로로 안내하고 종료.
3. `raw_source` 레코드 조회 → `workspaceId`, `sensitivity`, `requiredPermission`, `mimeType`, `objectKey` 확인.
4. **권한·sensitivity 체크:** 호출자 세션의 권한이 raw_source.requiredPermission 이상인지, raw_source.sensitivity가 호출자 clearance 이하인지 검사. 실패 시 즉시 중단, `wiki_review_queue(kind='ingest_access_denied')` 생성.
5. **Single-writer 큐 통과 의무:** 해당 workspace의 pg-boss singleton (`wiki.ingest.{workspaceId}`, concurrency=1)을 경유해야 한다. 직접 ingest 함수 호출 금지.

---

## 7단계 워크플로우 (MindVault 재발 방지)

### Step A — Context Load (Analysis 준비)

1. `packages/wiki-fs` API로 `wiki/{workspaceId}/index.md` 로드.
2. `wiki_page_index`에서 raw_source 원문의 제목·요약·태그 기반 후보 페이지 shortlist (title/alias/tags, top 20).
3. shortlist 중 sensitivity 게이트 통과한 페이지 10~15개를 `packages/wiki-fs.readPage()`로 실제 Read.
4. `manual/**`은 **Read-only** — 참조는 가능, 수정 대상에서 제외.

### Step B — Analysis LLM (`packages/wiki-agent/prompts/analyze.ts`)

입력: raw 원문 + 후보 페이지 본문 + index.md. 
출력 (Zod 검증, 미통과 시 `ingest_dlq` 이동):

```jsonc
{
  "newPages":       [{ "path": "wiki/{workspaceId}/auto/entities/X.md", "type": "entity|concept|synthesis|source", "title": "...", "outline": "..." }],
  "updatePages":    [{ "path": "...", "reason": "...", "diffHint": "..." }],
  "contradictions": [{ "pageA": "...", "pageB": "...", "description": "..." }],
  "linkSuggestions":[{ "from": "...", "to": "...", "reason": "..." }]
}
```

**MindVault 회귀 방지:** `updatePages.length + newPages.length >= 1` **그리고 대체로 multi-page** 여야 한다. 1 소스 → 1 페이지만 나오는 경우는 **Phase-W0 bootstrap 모드(`FEATURE_W0_BOOTSTRAP=true`)에서만** 허용. 그 외 환경에서 multi-page 미충족 시 Step C 진입 전 `ingest_dlq(kind='single_page_violation')` 이동.

### Step C — Generation LLM (`packages/wiki-agent/prompts/generate.ts`)

`newPages`·`updatePages`마다:

1. 최종 mdxContent를 생성 (본문 + 섹션 스캐폴드).
2. `[[wikilink]]` 자동 삽입 — 후보 페이지 slug에 매칭.
3. **frontmatter 필수 필드 완성** (`WIKI-AGENTS.md §2`):
   - `title`, `type`, `workspaceId`, `sensitivity`, `requiredPermission`
   - `sources: [raw_source_id, ...]` (Raw Sources와 연결)
   - **`aliases`**: 한국어·영문·축약어 동의어 최소 3개. **미충족 시 validate 실패 → `ingest_dlq`**. (예: title=`MindVault` → aliases=`["마인드볼트", "mind vault", "MV"]`. MindVault 실패 조건 #3 방지)
   - `tags`, `linkedPages`, `authority: auto`, `created`, `updated`
4. sensitivity는 **상승만 기록**: 기존 페이지보다 더 낮은 수준으로 내려오면 `review_queue(kind='sensitivity_downgrade')`.

### Step D — Validate + Temp Worktree Patch

1. `packages/wiki-fs.createTempWorktree(workspaceId)` — 격리된 git worktree.
2. 각 대상 파일 write:
   - frontmatter 스키마 검증 (`packages/wiki-fs.parseFrontmatter` + Zod).
   - aliases ≥ 3 검증.
   - `[[wikilink]]` 타겟 존재 여부 검증 (지금 commit 대상 + 기존 index).
   - sensitivity 일관성 (상위 sensitivity 페이지가 하위로 링크 금지 or flag).
3. 검증 실패 시 commit 없이 **`ingest_dlq` 이동**, `review_queue(kind='ingest_fail', reason=...)` 생성, 사용자에게 실패 이유 요약 반환.

### Step E — Single-Writer Merge

1. main branch에 **fast-forward merge만 허용** (no merge commit).
2. commit message: `[ingest] {sourceTitle} — {N}개 페이지 갱신`.
3. git author는 **서버 고정 author** (`jarvis-wiki-bot <bot@jarvis.local>`). 사용자 author 위조 불가.
4. `log.md`에 `## [YYYY-MM-DD] ingest | {sourceTitle}` 한 줄 append.
5. merge 실패 (concurrent writer) → pg-boss 재시도. single-writer 큐 덕에 거의 발생 안 함.

### Step F — DB Projection Sync

1. `wiki_page_index` upsert: 각 affected 페이지의 path/title/frontmatter JSON/sensitivity/gitSha/updatedAt.
2. `wiki_page_link` 재계산: 각 페이지의 outbound `[[wikilink]]` → dstPath 매핑.
3. `wiki_page_source_ref` upsert: 이번 ingest 결과 페이지들의 `sources: [...]`.
4. `wiki_commit_log` insert: commitSha, author, operation=`ingest`, affectedPages[], reasoning (Step B JSON 일부), timestamp.
5. **본문 컬럼에 mdxContent 쓰지 말 것.** projection은 색인만.

### Step G — Review Queue (실패/의심 케이스)

- `contradictions.length > 0` → `review_queue(kind='ingest_contradiction')`.
- sensitivity 상승 감지 → `review_queue(kind='sensitivity_raise')`.
- PII·RESTRICTED 키워드 매칭 → `review_queue(kind='pii_flag')`.
- 해당 엔트리들은 `published=false`로 승인 전까지 query 경로에서 필터된다.

---

## 실패 · 재시도 경로

| 상황 | 이동 경로 | 사용자 안내 |
|------|-----------|-------------|
| Analysis Zod 검증 실패 | `ingest_dlq` | 구조화 출력 실패. 재시도 또는 프롬프트 수정 필요 |
| single-page violation (W0 외부) | `ingest_dlq(kind='single_page_violation')` | MindVault 회귀. Analysis 프롬프트 재검토 |
| aliases < 3 | `ingest_dlq` + `review_queue(kind='alias_gap')` | 동의어 부족. LLM에 재생성 요청 |
| validate 실패 (frontmatter / wikilink / sensitivity) | `ingest_dlq(kind='validate_fail')` | 세부 사유 포함 |
| 접근 권한 부족 | `review_queue(kind='ingest_access_denied')` | 관리자 확인 필요 |
| concurrent writer 충돌 | pg-boss 자동 재시도 | 통상 재시도로 해결 |

---

## MindVault 회귀 방지 섹션 (필수)

다음 조건은 **반드시** 매 ingest마다 강제된다 (`WIKI-AGENTS.md §11` 참조):

1. **LLM 합성 단계 존재** — Step B 분석 + Step C 생성 모두 LLM 호출. tree-sitter / structure 추출만으로 끝나면 **거부**.
2. **Multi-page update 강제** — `newPages + updatePages ≥ 1` 그리고 통상 `updatePages ≥ 1`. 1 소스 → 1 페이지 케이스는 `FEATURE_W0_BOOTSTRAP=true` 에서만 허용.
3. **한국어 동의어 매칭** — aliases 프론트매터 최소 3개. "마인드볼트 ≠ MindVault" 함정 회피.
4. **교차 참조 자동 유지** — `[[wikilink]]` 자동 생성·검증. 브로큰 링크 생성 금지.
5. **모순 플래그** — `contradictions[]`는 버리지 말고 review_queue로.
6. **페이지 1급 시민** — chunk가 아닌 페이지를 생산·수정한다. `document_chunks` 쓰기 금지.
7. **auto/manual 분리** — `wiki/{workspaceId}/manual/**`은 절대 수정 대상에 포함시키지 말 것.
8. **관측** — `llm_call_log`에 op=`wiki.ingest.analyze`, `wiki.ingest.generate` 기록. 미기록은 리뷰 단계(superpowers:subagent-driven-development의 spec-reviewer)에서 실패로 간주.

이 중 하나라도 깨지면 해당 ingest 시도를 **실패로 간주하고 `ingest_dlq`로 이동**한다. 사용자에게 구체적인 위반 항목을 보고.

---

## 완료 요약 템플릿 (Claude Code가 사용자에게 반환)

```
## Ingest 결과: {sourceTitle}
- raw_source_id: {id}
- workspaceId: {uuid}
- commitSha: {sha}
- 신규 페이지 (N건): [path들]
- 갱신 페이지 (M건): [path들]
- 감지된 모순 (K건): [요약]
- 링크 제안 승인: {auto 적용} / {review 대기}
- projection sync: OK / FAIL
- review_queue 엔트리: [kind별 건수]
- 다음 단계: {예: /wiki-lint 권장 / 모순 수동 확인 / 승인 대기}
```
