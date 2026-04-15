---
description: "LLM Wiki lint: workspace의 compiled wiki 건강검진(orphan·broken-link·contradictions·stale·missing-xref)"
argument-hint: "[workspaceId?]  (생략 시 세션 기본 workspace)"
---

# /wiki-lint — Jarvis LLM Wiki Health Check

**입력:** `$ARGUMENTS` = `workspaceId`(옵션, 미지정 시 세션 컨텍스트의 기본 workspace).
**실행 경로:** 이 슬래시 커맨드는 수동 트리거. 크론 실행은 `apps/worker/src/jobs/wiki-lint.ts` (일요일 03:00 KST, `FEATURE_WIKI_LINT_CRON=true`).
**Node-only.** Python CLI 없음. Semantic lint는 `packages/wiki-agent/prompts/lint.ts` 호출.

관련 계약:
- `WIKI-AGENTS.md` §3.3 Lint, §11 MindVault 회귀 방지
- `docs/analysis/99-integration-plan-v4.md` W2-T4 (lint 크론 잡)
- 프롬프트: `packages/wiki-agent/prompts/lint.ts`
- FS API: `packages/wiki-fs`
- 쓰기는 **single-writer 큐** (`wiki.lint.{workspaceId}`) 경유. 직접 `fs.writeFile` 금지.

---

## 선행 체크

1. `FEATURE_WIKI_FS_MODE=true` 확인.
2. `FEATURE_WIKI_LINT_CRON` 값은 자동 크론 on/off 전용. 수동 실행은 플래그와 무관.
3. 호출자 권한: `knowledge:lint` (또는 동등 관리자 권한). 부족 시 중단.
4. sensitivity 게이트: 이 커맨드는 리포트 파일을 **auto**에 기록하므로 sensitivity는 보통 `INTERNAL`로 고정. `RESTRICTED` 페이지에 대한 lint 결과는 본문 전체가 아니라 path + 요약만 기록.
5. `wiki_page_index`, `wiki_page_link`가 최신인지 (최근 ingest 이후 재빌드 안 됐으면 먼저 재계산).

---

## 6가지 점검 항목

### 1. Orphan pages (구조 검사)

**정의:** 인바운드 `[[wikilink]]`이 0인 페이지. 단, `index.md` / `log.md` / `_system/**` / `overview.md`는 예외 (hub 페이지).

**구현:**
- `wiki_page_link` 역조회로 각 페이지의 inbound count 계산.
- `count = 0` AND `type IN ('entity', 'concept', 'synthesis', 'source', 'derived')` → orphan.
- 출력: `[{path, title, type, updated}]`.

### 2. Broken links (구조 검사)

**정의:** `[[target]]`가 `wiki_page_index`에서 매칭되는 path/alias가 없음.

**구현:**
- `wiki_page_link.dstPath` 중 `wiki_page_index`에 존재하지 않는 것.
- aliases 매칭도 한 번 더 시도 (target이 별칭일 수 있음).
- 출력: `[{srcPath, brokenTarget, context (인근 100자)}]`.

### 3. No-outlinks (구조 검사)

**정의:** 본문에 `[[wikilink]]`가 하나도 없는 페이지. 고립된 섬을 찾는다.

**구현:** `wiki_page_link`에 해당 페이지 srcPath가 전혀 없음.

### 4. Contradictions (의미 검사, LLM)

**정의:** 같은 엔티티/개념에 대해 페이지 A와 B가 상충하는 주장을 가짐.

**구현:**
- 같은 `aliases` / `tags`를 공유하는 페이지 쌍을 추출 (후보).
- `packages/wiki-agent/prompts/lint.ts`의 contradiction 프롬프트로 각 쌍을 평가.
- LLM 출력 Zod 검증: `{pageA, pageB, claimA, claimB, conflict: string, severity: 'low'|'med'|'high'}`.
- 출력: severity `med`/`high`만 리포트에 포함. `low`는 메타로만.

### 5. Stale claims (의미 검사, LLM)

**정의:** 최신 `raw_source`에 의해 대체된 낡은 주장이 페이지에 남아 있음.

**구현:**
- 최근 N일(기본 30) ingest된 raw_source를 기준으로, 동일 aliases/tags를 가진 기존 페이지의 `updated`가 해당 raw_source `ingestedAt`보다 오래됨 AND 같은 주제.
- LLM에게 "신규 raw 요약과 기존 페이지 claim을 비교, 갱신 필요성 판단" 질의.

### 6. Missing cross-refs (의미 검사, LLM)

**정의:** 의미적으로 관련된 두 페이지가 서로 링크하지 않음 → 자동 추가 제안.

**구현:**
- 동일 tags / aliases 공유하는 페이지 쌍 중 `wiki_page_link`에 양방향 모두 없는 것.
- LLM으로 "관련도 > 0.7" 여부 판단.
- 출력: `[{from, to, reason, suggestedSnippet}]`.

---

## 출력 파일

**경로 (정확):**
```
wiki/{workspaceId}/_system/lint-report-{YYYY-MM-DD}.md
```

- 날짜는 **UTC 기준 YYYY-MM-DD** (Jarvis convention 확인. 차이가 있으면 integrator가 바로잡음).
- 파일은 **auto** 영역. `packages/wiki-fs` + single-writer 큐 경유해서 commit.
- commit message: `[lint] {YYYY-MM-DD} — {총 issue 수}개 이슈 플래그`.
- `log.md`에 `## [YYYY-MM-DD] lint | {총 issue 수}개` append.

**frontmatter (리포트 파일):**

```yaml
---
title: "Lint Report {YYYY-MM-DD}"
type: synthesis
workspaceId: "{uuid}"
sensitivity: INTERNAL
requiredPermission: "knowledge:read"
sources: []
aliases: ["린트 리포트 {date}", "lint {date}", "주간 점검 {date}"]
tags: ["system/lint", "domain/quality"]
authority: auto
created: {YYYY-MM-DDTHH:MM:SSZ}
updated: {YYYY-MM-DDTHH:MM:SSZ}
linkedPages: [각 이슈 관련 페이지들]
---
```

**본문 구조:**

```markdown
# Lint Report {YYYY-MM-DD}

## 요약
- 총 이슈: {N}
- orphan: {a} / broken-link: {b} / no-outlinks: {c} / contradictions: {d} / stale: {e} / missing-xref: {f}

## Orphan Pages
- [[path/to/page]] — {type} — {updated}

## Broken Links
- [[srcPath]] → `[[brokenTarget]]` ({context})

## No-outlinks
- [[path]] — 본문에 링크 0개

## Contradictions (severity ≥ med)
### [[pageA]] ↔ [[pageB]] ({severity})
- A: "{claimA}"
- B: "{claimB}"
- 충돌 내용: {conflict}

## Stale Claims
- [[path]] — 최신 소스 [[raw/slug]]와 충돌 가능: {요약}

## Missing Cross-refs
- [[from]] ↔ [[to]] — {reason}

## 다음 단계
- 각 이슈는 `wiki_review_queue(kind='lint', subkind=...)` 로 진입. 관리자 UI에서 승인/무시.
```

---

## Review Queue 기록

각 이슈는 `wiki_review_queue`에 개별 엔트리로 insert:

- `kind = 'lint'`
- `subkind = 'orphan' | 'broken_link' | 'no_outlinks' | 'contradiction' | 'stale' | 'missing_xref'`
- `affectedPages`: 관련 페이지 path 배열
- `reportPath`: 이번 리포트의 path
- `createdAt`, `status='pending'`
- `payload`: LLM 결과 JSON (contradictions/stale/missing-xref 케이스)

승인 후 auto에 적용되는 것은 `/wiki-ingest` 경로가 아니라 관리자 UI 승인 → `packages/wiki-agent`의 `applyLintFix()` (Phase-W3).

---

## MindVault 회귀 방지 체크

lint가 없으면 "살아있는 위키"가 곧 "죽은 위키"가 된다. 다음을 필수로 확인:

- [ ] 한국어 aliases 부족한 페이지 감지 → `review_queue(subkind='alias_gap')` 생성 (3개 미만이면 플래그).
- [ ] `manual/**`과 `auto/**`가 같은 파일명을 다른 본문으로 가지고 있으면 boundary 경고.
- [ ] `published=false` 인 페이지가 30일 이상 review_queue에 방치되면 `subkind='stuck_review'`.

---

## 관측

- `llm_call_log` op:
  - contradictions → `wiki.lint.semantic`
  - stale → `wiki.lint.semantic`
  - missing-xref → `wiki.lint.semantic`
- 구조 검사(orphan/broken-link/no-outlinks)는 pure SQL/grep, LLM 호출 없음.
- 비용 상한: 한 번 lint 당 `LLM_DAILY_BUDGET_USD`의 일정 비율 이하로 제한. 초과 시 contradictions 후보 수 줄여 재시도.

---

## 완료 요약 템플릿

```
## Lint 결과: {workspaceId}
- 리포트 파일: wiki/{workspaceId}/_system/lint-report-{YYYY-MM-DD}.md
- commitSha: {sha}
- 총 이슈: {N} (orphan {a} / broken {b} / no-outlinks {c} / contradictions {d} / stale {e} / missing-xref {f})
- review_queue 엔트리: {N}건 추가
- LLM 호출: {건수}, 비용: {USD}
- 다음 단계: 관리자 UI(/admin/wiki/review-queue)에서 승인 또는 무시
```
