---
name: jarvis-wiki-feature
description: Jarvis 위키 도메인(wiki-fs / wiki-agent / ingest 4단계 / page-first retrieval / lint / review-queue) 기능 작업 시 참조하는 스킬. Karpathy-first 원칙(auto/manual 경계 분리, 디스크 SSoT, DB는 projection only, raw chunk RAG 금지)을 강제 적용한다. `jarvis-feature` 오케스트레이터 안에서 위키 레이어를 건드릴 때 반드시 이 스킬을 Read하라. `wiki/**`, `packages/wiki-fs/**`, `packages/wiki-agent/**`, `packages/ai/page-first/**`, `apps/worker/src/jobs/ingest/**`, `apps/worker/src/jobs/wiki-*` 파일 변경이나 "ingest", "위키", "auto/manual", "frontmatter", "wikilink", "review queue", "graph viewer", "wiki-fs", "page-first", "Karpathy" 키워드에서 트리거된다.
---

# Jarvis Wiki Feature Skill

위키 도메인 기능 작업 시 참조하는 보조 스킬. `jarvis-feature` 오케스트레이터가 위키 레이어를 건드리는 기능을 처리할 때(superpowers:writing-plans 계획 작성, subagent-driven-development의 implementer/spec-reviewer/code-quality-reviewer 루프) 이 문서를 반드시 컨텍스트로 주입한다.

## 1. Karpathy 원칙 (절대 위반 금지)

Jarvis 위키는 **디스크가 SSoT**이고 DB는 projection. 아래 4가지가 무너지면 전체 설계가 깨진다.

1. **auto/manual 경계 무결성**: auto 영역은 LLM 독점(UI는 viewer), manual 영역은 사람 독점(LLM은 read only, 편집은 review-queue 경유)
2. **wiki-fs API 경유**: Node `fs.writeFile`·`child_process.exec('git ...')` 직접 호출 금지. 모든 디스크/Git 조작은 `packages/wiki-fs`
3. **DB projection only**: `wiki_page_index.body` 등 본문 컬럼 쓰기 금지. projection 테이블은 **워커 동기화 잡만** INSERT/UPDATE. 조회는 DB, 본문은 디스크
4. **raw chunk RAG 금지**: Ask AI는 page-first로 페이지 단위 context 조립. chunk 벡터 단위 context 주입 금지 (legacy `knowledge_claim.embedding`은 Phase-W4 폐기 대기)

## 2. 트리거 조건

다음 중 하나라도 해당되면 이 스킬을 활성화한다:

- `wiki/**`, `packages/wiki-fs/**`, `packages/wiki-agent/**`, `packages/ai/page-first/**` 파일 변경
- `apps/worker/src/jobs/ingest/**`, `apps/worker/src/jobs/wiki-bootstrap.ts`, `wiki-lint.ts`, `wiki-lint/**`, `graphify-build.ts` 변경
- `apps/web/app/(app)/wiki/**` 또는 `apps/web/app/(app)/knowledge/**` 라우팅 추가/수정 (두 도메인이 이행 중 공존)
- `packages/db/schema/wiki-*.ts`(5개) 또는 `review-queue.ts` 변경
- 키워드: `ingest`, `wiki`, `위키`, `auto/`, `manual/`, `frontmatter`, `wikilink`, `lint`, `review queue`, `graph viewer`, `wiki-fs`, `wiki-agent`, `page-first`, `Karpathy`, `synthesis`, `playbook`

## 3. 패키지 구조

### 3.1 `packages/wiki-fs/src/` — 디스크 I/O + Git (stateful)

| 파일 | 책임 |
|------|------|
| `reader.ts` | `readPage(path)` — 디스크에서 `.md` 읽기 |
| `writer.ts` | `atomicWrite()`, `readUtf8()`, `exists()` — 원자적 파일 쓰기(아직 git 미포함) |
| `git.ts` | `GitRepo` 클래스, `commitPatch()`, `fastForwardMerge()`, `validateCommitMessage()`, `defaultBotAuthor()` |
| `frontmatter.ts` | YAML frontmatter 파싱/직렬화 |
| `wikilink.ts` | `parseWikilinks()`, `formatWikilink()` — `[[slug]]` 형식 |
| `worktree.ts` | `createTempWorktree()`, `openWorktree()` — 잡별 격리된 git worktree |
| `types.ts` | `WikiSensitivity`, `WikiFrontmatter` 등 |

**경로 조립 규칙:** 문자열 concat 금지. `resolveWikiPath({ workspaceId, zone: 'auto' | 'manual' | '_system' | '_archive', subdir, slug })` 헬퍼만 사용.

### 3.2 `packages/wiki-agent/src/` — LLM prompt / parser (stateless)

| 파일 | 책임 |
|------|------|
| `prompts/analysis.ts` | Step A 프롬프트: raw_source → JSON `{ keyEntities, keyConcepts, findings, contradictions }` |
| `prompts/generation.ts` | Step B 프롬프트: 분석 결과 + 기존 페이지들 → 새 wiki 페이지 콘텐츠 |
| `prompts/aliases-contract.ts` | 별칭/slug 생성 규칙 |
| `parsers/file-block.ts` | Step A JSON 파서 |
| `parsers/review-block.ts` | Step B review output 파서 |
| `constants.ts` | `PROMPT_VERSION`, `MAX_EXISTING_PAGES`, `MAX_SOURCE_CHARS` |

**금지:** wiki-agent가 디스크/Git에 접근하거나 DB를 수정하는 코드를 포함. wiki-agent는 순수 함수 모듈.

### 3.3 `packages/ai/page-first/` — Ask AI page-first retrieval

| 단계 | 설명 |
|------|------|
| shortlist | `FEATURE_LLM_SHORTLIST=true`면 LLM-first, 아니면 lexical (title/slug/aliases) |
| expand | 1-hop wikilink 확장 |
| read | wiki-fs `readPage`로 디스크 본문 로드 (DB 본문 금지) |
| synth | Anthropic 생성 + `[source:N]` citation SSE 스트리밍 |

`packages/ai/ask.ts`가 6-lane 라우터 → page-first 경로의 진입점.

## 4. 디렉토리 구조 (`wiki/{workspaceId}/`)

```
wiki/{workspaceId}/
├─ auto/              ← LLM 독점. UI는 Read only.
│  ├─ sources/           원본 소스 요약
│  ├─ entities/          인물·조직·시스템
│  ├─ concepts/          개념·정책·용어
│  ├─ syntheses/         Ask AI "Save as Page"
│  ├─ cases/             사례 요약 (precedent_case 파생)
│  ├─ playbooks/         업무 플레이북
│  ├─ reports/           정기 리포트
│  ├─ onboarding/        온보딩 트랙
│  └─ derived/code/      Graphify 결과 (격리)
├─ manual/            ← 사람 편집(admin/editor 역할). LLM은 Read only.
│  ├─ overrides/         법무/보안 예외, auto 오버라이드
│  └─ notes/             관리자 해설
├─ _system/           ← 린트/감사 자동 생성
│  ├─ lint-report-*.md
│  ├─ contradictions.md
│  └─ orphans.md
├─ _archive/          ← projection 제외 (과거 보존용)
├─ index.md           ← auto 카탈로그 (ingest/lint 관리)
└─ log.md             ← auto 시간순 로그
```

- `index.md`, `log.md`는 절대 수동 편집 금지 — 다음 sync에서 덮어씀
- `_archive/`는 projection에서 제외(DB에 index되지 않음)

## 5. Ingest 4단계 (`apps/worker/src/jobs/ingest/`)

raw_source 1건 → Two-Step CoT → 다수 페이지 갱신.

| 서브-잡 | 역할 | 출력 |
|---------|------|------|
| `analyze.ts` | Step A — 소스 분석 | JSON 메타(title·sensitivity·keyEntities·contradictions) |
| `generate.ts` | Step B — LLM 합성 (Anthropic) | 새 페이지 콘텐츠 draft |
| `write-and-commit.ts` | wiki-fs로 디스크 write + git commit | `wiki/{ws}/auto/**` + `wiki_commit_log` row |
| `review-queue.ts` | 민감/충돌/PII 감지 시 큐 기록 | `wiki_review_queue` row |

각 서브-잡은 **독립 재시도**가 가능하며, 부분 실패 시 이미 완료된 단계는 건너뛴다.

`packages/wiki-agent` 프롬프트의 `PROMPT_VERSION`이 바뀌면 ingest 결과가 변할 수 있음 — 마이그레이션 플랜 필요.

## 6. DB Projection 테이블 (6종)

| 테이블 (파일) | 용도 | 누가 씀 |
|-------------|------|---------|
| `wiki_page_index` (`wiki-page-index.ts`) | 페이지 메타/요약/sensitivity — 조회용 | 워커 sync 잡만 |
| `wiki_page_link` (`wiki-page-link.ts`) | wikilink 그래프 | 워커 sync 잡만 |
| `wiki_page_source_ref` (`wiki-page-source-ref.ts`) | 페이지 ↔ raw_source 역참조 | 워커 sync 잡만 |
| `wiki_commit_log` (`wiki-commit-log.ts`) | git commit 감사 로그 | write-and-commit 잡 |
| `wiki_review_queue` (`review-queue.ts` 또는 `wiki-review-queue.ts`) | 리뷰 사유·영향 페이지 | ingest/lint 잡 + 관리자 승인 |
| `wiki_lint_report` (`wiki-lint-report.ts`) | lint 실행 결과 | wiki-lint 잡 |

**무결성 규칙:** `wiki_page_index.commitSha`는 항상 git HEAD와 일치해야 한다(G8 gate). `pnpm wiki:check`가 이를 검증.

## 7. 신규 기능 추가 시 체크리스트

### 7.1 라우팅 분리

- `/wiki/[workspaceId]/auto/[...slug]` = viewer 전용 (편집 버튼 없음)
- `/wiki/[workspaceId]/manual/[...slug]` = editor + 역할(`WIKI_MANUAL_EDIT_ROLES`) 체크
- Ask AI "Save as Page"는 `auto/syntheses/` 하위로만

### 7.2 sensitivity 쿼리 필터

- 페이지 목록/검색 쿼리에 sensitivity 필터를 **쿼리 WHERE 절**에서 적용 (애플리케이션 레벨 필터링은 누수/pagination 어긋남)
- 헬퍼: `packages/auth/rbac.ts`의 `canAccessKnowledgeSensitivity`, 쿼리 빌더 `buildLegacyKnowledgeSensitivitySqlFilter`
- `SECRET_REF_ONLY` 페이지는 본문 대신 `secretRef` ID만 반환

### 7.3 권한 상수

현재 wiki 전용 PERMISSION은 별도로 두지 않고 `KNOWLEDGE_*` 재사용:
- 읽기: `KNOWLEDGE_READ`
- 수정: `KNOWLEDGE_UPDATE` (manual 영역)
- 리뷰 승인: `KNOWLEDGE_REVIEW` (DEVELOPER 역할에서 제외됨 — RESTRICTED 차단용)
- 관리: `KNOWLEDGE_ADMIN`, `ADMIN_ALL`

wiki 전용 권한이 필요해지면 `packages/shared/constants/permissions.ts`에 추가하고 `ROLE_PERMISSIONS` 매핑 갱신.

### 7.4 i18n 키

- 네임스페이스: `Wiki.Viewer.*`, `Wiki.Editor.*`, `Wiki.Admin.ReviewQueue.*`, `Wiki.Graph.*`, `Wiki.Ingest.*`
- 한국어 하드코딩 금지. 자세한 규칙은 `jarvis-i18n` 스킬

### 7.5 워커 잡 등록

- 신규 장기 작업은 `apps/worker/src/jobs/wiki-*.ts` 또는 `jobs/ingest/*.ts`에 pg-boss 핸들러로 등록
- workspace당 single-writer 보장: `queueName: 'wiki-ingest:{workspaceId}'` 패턴
- 잡 실패 시 `wiki_review_queue`에 컨텍스트 삽입 + 재시도 상한 적용

### 7.6 review-queue 연결

- `contradictions`, sensitivity 상승, PII 감지 → `wiki_review_queue` row 생성
- 승인/반려는 admin 전용 `ApprovalDialog`. server action에 `KNOWLEDGE_REVIEW` 또는 `ADMIN_ALL` 체크 필수
- 승인 시 manual 영역에 반영하는 것은 사람이 editor에서 수동으로. 자동 반영 금지.

## 8. 자주 하는 실수 (past incident 기반)

- **`auto/` 경로에 사람 편집 UI 추가** — 라우트 분리 실패. auto는 viewer 전용.
- **`manual/`에 LLM 직접 쓰기** — ingest가 manual 영역 건드리면 안 됨. 반드시 review-queue → 사람 수동 반영.
- **wiki-fs 우회** — `fs.writeFile` / `child_process.exec('git')` 직접 호출은 Git 커밋 누락과 DB sync 누락을 동시에 유발.
- **DB `wiki_page_index.body` 본문 저장** — SSoT 전도. 본문은 디스크.
- **sensitivity 애플리케이션 레벨 필터** — `rows.filter(...)`로 나중에 거르면 count/pagination이 틀어지고 RESTRICTED 누수 가능.
- **권한 체크 누락** — `requirePermission(PERMISSIONS.KNOWLEDGE_*)` 빠트리면 타입 체커는 못 잡는다.
- **`index.md` / `log.md` 수동 편집** — 다음 sync에서 덮어쓰임.
- **schema-drift 미검증** — `wiki_*` 테이블 수정 후 `pnpm db:generate` 누락 → `scripts/check-schema-drift.mjs --precommit` fail.
- **chunk-level RAG 작성** — page-first 원칙 위반. 벡터로 chunk 가져와서 context로 주입하지 말 것. page를 가져와 disk에서 읽는다.
- **wiki-agent에 디스크/DB 부작용 추가** — stateless 경계 깨짐. 프롬프트·파서만.

## 9. 빠른 검증 명령

```bash
# schema drift (wiki_* 테이블 변경 후)
node scripts/check-schema-drift.mjs --precommit

# wiki-fs ↔ DB projection 무결성 (commitSha ↔ git HEAD 등)
pnpm wiki:check

# auto/ 경로에 editor 컴포넌트 누출 여부
rg "mode=\"edit\"" apps/web/app/**/wiki/**/auto/

# fs.writeFile 직접 호출 (wiki-fs 외부)
rg "fs\\.(writeFile|rm|rename)" --glob '!packages/wiki-fs/**' --glob '!node_modules/**' apps packages

# child_process.exec('git ...') 직접 호출
rg "child_process|execSync" --glob '!packages/wiki-fs/**' --glob '!node_modules/**' apps packages

# raw chunk RAG 패턴 (knowledge_claim.embedding 기반 context 조립)
rg "knowledge_claim.*embedding|document_chunks" packages apps
```

## 10. 관련 스킬

- [`jarvis-feature`](../jarvis-feature/SKILL.md) — 전체 오케스트레이터
- [`jarvis-architecture`](../jarvis-architecture/SKILL.md) — 모노레포 구조, 6-lane 라우터, page-first 상세
- [`jarvis-db-patterns`](../jarvis-db-patterns/SKILL.md) — projection 테이블 패턴, pg_trgm/FTS, sensitivity 필터
- [`jarvis-i18n`](../jarvis-i18n/SKILL.md) — Wiki.* 네임스페이스 규칙
