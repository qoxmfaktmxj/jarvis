---
name: jarvis-wiki-feature
description: Jarvis 위키 도메인(wiki-fs / ingest / viewer / editor / graph / boundary / review-queue) 기능 작업 시 참조하는 스킬. Karpathy-first 원칙(auto/manual 경계 분리, wiki-fs 경유, DB는 projection only)을 강제 적용한다. `jarvis-feature` 스킬과 병행 사용하며, 위키 관련 키워드("ingest", "wiki", "위키", "auto/", "manual/", "frontmatter", "wikilink", "lint", "review queue", "graph viewer", "wiki-fs") 또는 `wiki/**`, `packages/wiki-fs/**`, `packages/wiki-agent/**`, `apps/worker/src/jobs/wiki-*` 파일 변경이 감지되면 트리거된다.
---

# Jarvis Wiki Feature Skill

위키 도메인 기능 작업 시 참조하는 보조 스킬. `jarvis-feature` 오케스트레이터 안에서 planner/builder/integrator가 위키 레이어를 건드릴 때 이 문서를 반드시 Read한다.

## 1. 트리거 조건

다음 중 하나라도 해당되면 이 스킬을 활성화한다:

- `wiki/**`, `packages/wiki-fs/**`, `packages/wiki-agent/**` 파일 변경
- `apps/worker/src/jobs/wiki-ingest.ts`, `wiki-lint.ts`, `wiki-graph.ts`, `wiki-sync.ts` 변경
- `apps/web/app/**/wiki/**` 라우팅 추가/수정
- Drizzle 스키마 중 `wiki_page_index`, `wiki_page_link`, `wiki_page_source_ref`, `wiki_commit_log`, `wiki_review_queue` 테이블 변경
- 키워드 감지: `ingest`, `wiki`, `위키`, `auto/`, `manual/`, `frontmatter`, `wikilink`, `lint`, `review queue`, `graph viewer`, `wiki-fs`, `sensitivity`
- 사용자 요청에 "위키 페이지 추가/수정", "ingest 수정", "auto/manual 경계", "graph viewer", "review queue 승인" 등이 포함된 경우

## 2. Karpathy-first 체크리스트

모든 위키 도메인 PR은 아래 4가지를 통과해야 한다. 하나라도 실패하면 planner에게 반송.

### 2.1 auto/manual 경계 무결성

- [ ] UI 경로에서 `wiki/auto/**` 파일에 **사람 편집 버튼**을 노출하지 않는다 (읽기 전용만 허용).
- [ ] 워커/서버 경로에서 `wiki/manual/**` 파일에 **LLM 출력을 직접 쓰지** 않는다 (반드시 review-queue 경유).
- [ ] 새 라우팅은 `/wiki/auto/...`와 `/wiki/manual/...`를 별도 핸들러로 분리.

### 2.2 wiki-fs API 경유

- [ ] `fs.writeFile`, `fs.rm`, `fs.rename` 등 Node `fs` 직접 호출이 `packages/wiki-fs/**` 외부에 있으면 거부한다.
- [ ] Git 커밋은 `wiki-fs`의 `commitPatch()` / `fastForwardMerge()` API 경유.
- [ ] 신규 코드에서 `child_process.exec('git ...')` 직접 호출 금지.

### 2.3 DB projection only

- [ ] `wiki_page_index.body` 같은 본문 컬럼에 쓰기 금지 (디스크가 SSoT).
- [ ] `wiki_page_index`, `wiki_page_link` 등 projection 테이블은 **워커 동기화 잡**만 `INSERT/UPDATE`. UI server action에서 직접 쓰기 금지.
- [ ] 조회는 DB projection에서, 본문은 디스크(또는 wiki-fs API)에서.

### 2.4 sensitivity + RBAC 동시 적용

- [ ] 페이지 조회/수정 경로에 `checkPermission(PERMISSION_WIKI_*)` + `filterBySensitivity(userRoles, page.sensitivity)` 두 축 모두 적용.
- [ ] `SECRET_REF_ONLY` 페이지는 본문 대신 `secretRef` ID만 반환.

## 3. 파일 경로 규칙

```
wiki/{workspaceId}/
  auto/              ← LLM 독점 편집. UI는 Read only.
    sources/           원본 소스별 요약
    entities/          인물·조직·시스템
    concepts/          개념·정책·용어
    syntheses/         Query 답변 "Save as Page"
    derived/code/      Graphify 격리 결과
  manual/            ← 사람 편집(admin/editor 역할). LLM은 Read only.
    overrides/         법무/보안 예외, auto 오버라이드
    notes/             관리자 해설·메모
  _system/           ← 린트/감사 자동 생성. 사람·LLM 모두 수동 편집 지양.
    lint-report-*.md
    contradictions.md
    orphans.md
  index.md           ← auto 카탈로그
  log.md             ← auto 시간순 기록
```

코드에서 경로를 조립할 때는 문자열 concat 금지. `wiki-fs`의 `resolveWikiPath({ workspaceId, zone: 'auto' | 'manual' | '_system', subdir, slug })` 헬퍼 사용.

## 4. 신규 기능 추가 시 확인사항

### 4.1 라우팅 분리

- `/wiki/[workspaceId]/auto/[...slug]` vs `/wiki/[workspaceId]/manual/[...slug]` 두 라우트로 분리.
- auto 라우트는 편집 버튼이 없는 viewer 컴포넌트만 사용.
- manual 라우트는 역할(`WIKI_MANUAL_EDIT_ROLES`) 체크 후 editor 컴포넌트 렌더.

### 4.2 sensitivity 권한 필터

- 페이지 목록/검색 쿼리에 sensitivity 필터를 **쿼리 레벨**에서 적용 (애플리케이션 레벨 필터링은 누수 위험).
- `packages/search/filters.ts`의 `withSensitivityFilter(query, userRoles)` 헬퍼 사용.

### 4.3 i18n 키 추가

- 새 UI 문자열은 `apps/web/messages/ko.json`에 추가.
- 네임스페이스 규칙: `Wiki.Viewer.*`, `Wiki.Editor.*`, `Wiki.Admin.ReviewQueue.*`, `Wiki.Graph.*`, `Wiki.Ingest.*`.
- 한국어 하드코딩 금지. 자세한 규칙은 `jarvis-i18n` 스킬 참조.

### 4.4 워커 잡 등록

- 신규 장기 작업은 `apps/worker/src/jobs/wiki-*.ts`에 pg-boss 핸들러로 등록.
- workspace당 single-writer 보장: `queueName: 'wiki-ingest:{workspaceId}'` 패턴.
- 잡 실패 시 `wiki_review_queue`에 컨텍스트 삽입하고 재시도 상한 적용.

### 4.5 review-queue 연결

- `contradictions`, `sensitivity` 상승, `PII` 감지 시 `wiki_review_queue` row 생성.
- 승인/반려는 admin 전용 `ApprovalDialog` 경유. server action에 `PERMISSION_WIKI_ADMIN` 체크 필수.

## 5. 자주 하는 실수

- **`wiki/auto/` 경로에 사람 편집 UI 추가** — 라우트 분리 실패. `auto/` 경로는 viewer 전용.
- **`wiki/manual/`에 LLM 직접 쓰기** — ingest 잡이 manual 영역을 건드리면 안 됨. manual 수정은 review-queue 승인 → 사람이 에디터에서 반영.
- **wiki-fs 우회해서 `fs.writeFile` 직접 호출** — Git 커밋 누락, DB projection 동기화 누락 유발. 반드시 `wiki-fs` API.
- **DB `wiki_page_index`에 본문 저장** — SSoT 전도. 본문은 디스크, DB는 색인/메타만.
- **sensitivity 필터를 애플리케이션 레벨에서만 적용** — 쿼리 결과를 받은 뒤 JavaScript로 필터링하면 count/pagination이 틀어지고 누수 가능. 쿼리 `WHERE`에 sensitivity 절 포함.
- **권한 체크 누락** — `PERMISSION_WIKI_READ`, `PERMISSION_WIKI_WRITE_MANUAL`, `PERMISSION_WIKI_ADMIN` 상수를 사용하지 않고 역할 문자열을 직접 비교하면 RBAC drift.
- **schema-drift 미검증** — `wiki_page_*` 테이블 수정 후 `pnpm db:generate` 누락 → `scripts/check-schema-drift.mjs --precommit` fail.
- **i18n 하드코딩** — "저장", "승인", "반려" 같은 문자열을 JSX에 직접 써서 locale 키 누락.
- **index.md / log.md 수동 편집** — 두 파일은 auto. ingest/lint/query 잡이 관리. 사람이 건드리면 다음 sync에서 덮어쓰이거나 drift 경고.

## 6. 관련 스킬 참조

- [`jarvis-feature`](../jarvis-feature/SKILL.md) — 전체 오케스트레이터. 이 스킬은 그 하위에서 병행 참조.
- [`jarvis-db-patterns`](../jarvis-db-patterns/SKILL.md) — Drizzle projection 테이블 패턴, pg_trgm/FTS, 마이그레이션 규칙.
- [`jarvis-i18n`](../jarvis-i18n/SKILL.md) — ko.json 네임스페이스 구조, 키 명명 규칙, 누락 검출.
- [`jarvis-architecture`](../jarvis-architecture/SKILL.md) — 3-레이어 모델, 워커/웹 경계, wiki-fs 위치.

## 7. 빠른 체크 명령

```bash
# 경계 위반 정적 검사
node scripts/check-schema-drift.mjs --precommit

# wiki 무결성 (디스크 ↔ DB projection)
pnpm wiki:check

# auto/ 경로에 editor 컴포넌트 누출 여부
rg "mode=\"edit\"" apps/web/app/**/wiki/**/auto/

# fs.writeFile 직접 호출 (wiki-fs 외부)
rg "fs\\.(writeFile|rm|rename)" --glob '!packages/wiki-fs/**' --glob '!node_modules/**' apps packages
```
