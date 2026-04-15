# Contributing to Jarvis

Jarvis에 기여하려는 새 개발자를 위한 온보딩 가이드입니다. 이 문서만 따라 하면 로컬 환경을 띄우고 `wiki-ingest`를 1회 실행하는 지점까지 도달할 수 있도록 작성되었습니다.

추가적인 아키텍처 배경은 [`README.md`](README.md), [`WIKI-AGENTS.md`](WIKI-AGENTS.md), [`CLAUDE.md`](CLAUDE.md)를 참고하세요.

---

## 1. 프로젝트 개요

**Jarvis = 사내 업무 시스템 + 사내 위키 + RAG AI 포털 통합 플랫폼.**

- **정체성**: 검색 포털이 아닙니다. [Karpathy의 LLM Wiki 구상](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)을 엔터프라이즈 멀티테넌트 환경으로 확장한 **지식 컴파일·북키핑 자동화 플랫폼**입니다.
- **핵심 철학 (Karpathy-first)**:
  - LLM은 raw 자료를 읽고 compiled wiki 페이지를 **지속적으로 편집**합니다.
  - 사용자는 compiled wiki를 탐색합니다. raw chunk 검색은 수단에 불과합니다.
  - **Wiki 콘텐츠의 진실원천(SSoT)은 디스크/Git**입니다. DB는 색인·권한·감사만 담는 projection입니다.
- **편집 경계 분리 (절대 위반 금지)**:
  - `wiki/{workspaceId}/auto/**` — **LLM 독점 편집**. 사람은 Read만. 직접 편집 금지.
  - `wiki/{workspaceId}/manual/**` — **사람 편집 허용**. LLM은 Read만.
  - 이 경계를 섞어 편집하면 다음 ingest에서 인간 수정이 묻히거나 LLM이 오염된 문장을 재활용합니다.
- **wiki-fs 경유 규칙**: 모든 wiki 파일 변경은 `@jarvis/wiki-fs` 패키지 API를 경유합니다. DB 직접 쓰기 금지.

---

## 2. 사전 요구사항

| 도구 | 최소 버전 | 확인 명령 |
|------|-----------|-----------|
| Node.js | 22.x+ | `node --version` |
| pnpm | 10.x+ | `pnpm --version` |
| Docker + Docker Compose | 최신 안정판 | `docker --version`, `docker compose version` |
| Git | 2.40+ | `git --version` |

Windows 사용자는 WSL2 혹은 Git Bash 환경을 권장합니다. PowerShell에서도 동작하지만 shell script 호환성이 떨어질 수 있습니다.

---

## 3. 로컬 환경 설정

### 3.1 저장소 클론 및 의존성 설치

```bash
git clone https://github.com/<org>/jarvis.git
cd jarvis
pnpm install
```

### 3.2 환경 변수 구성

```bash
cp .env.example .env.local
```

`.env.local`에서 최소한 아래 값은 확인합니다:
- `DATABASE_URL` — 로컬 compose에서 기본값 사용 가능
- `OPENAI_API_KEY` — ingest·query 실행에 필수
- `WIKI_ROOT` — 호스트 경로면 절대경로로 치환 (컨테이너 내부면 `/app/wiki` 유지)
- `WIKI_LLM_WRITE_TOKEN` — 개발용 기본값 유지 가능, 운영에서는 필수 교체

OIDC 관련 변수(`OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`)는 로컬 개발에서는 기본값 유지해도 됩니다. 로그인 페이지의 dev 계정 로그인을 사용합니다.

### 3.3 인프라 기동

```bash
docker compose up -d
```

이 명령은 PostgreSQL, Redis, MinIO를 띄웁니다. `docker compose ps`로 3개 컨테이너가 `healthy` 상태인지 확인합니다.

### 3.4 DB 마이그레이션

```bash
pnpm db:migrate
```

Drizzle이 `packages/db/migrations/` 아래 마이그레이션을 순차 적용합니다.

### 3.5 개발 서버 기동

```bash
pnpm dev
```

- 웹: http://localhost:3010
- 워커: 별도 터미널에서 `pnpm --filter @jarvis/worker dev`

---

## 4. 3인 에이전트 하네스 (Claude Code)

Jarvis는 풀스택 기능을 3인 에이전트 팀으로 구현합니다. Claude Code에서 `jarvis-feature` 스킬을 호출하면 자동으로 오케스트레이션됩니다.

```
사용자 요청
  → jarvis-planner    (_workspace/01_planner_{slug}.md 계획 산출)
  → jarvis-builder    (_workspace/02_builder_progress.md 실제 코드 변경)
  → jarvis-integrator (검증 + 타입체크 + 린트 + 테스트)
```

### 흐름 요약

1. **planner**: 요청을 파일 단위 계획으로 쪼갭니다. 스키마·권한·i18n 키·파일 경로를 명시합니다.
2. **builder**: 계획을 따라 Drizzle 스키마 → 마이그레이션 → 서버 로직 → UI → i18n 순으로 구현합니다.
3. **integrator**: `pnpm type-check`, `pnpm lint`, 단위 테스트, schema-drift 검증을 돌립니다.

위키 도메인 작업은 추가로 [`jarvis-wiki-feature`](.claude/skills/jarvis-wiki-feature/SKILL.md) 스킬을 병행 참조합니다.

단일 파일 1~2줄 수정이나 단순 질문은 하네스를 거치지 않고 직접 응답합니다.

---

## 5. Wiki 도메인 규칙

### 5.1 auto vs manual 경계

| 경로 | 편집권 | 금지 사항 |
|------|--------|-----------|
| `wiki/{workspaceId}/auto/**` | LLM 전용 | 사람이 직접 편집 금지. 코드에서 manual 경로처럼 취급하는 UI/API 금지. |
| `wiki/{workspaceId}/manual/**` | 사람 (admin/editor 역할) | LLM이 직접 쓰기 금지. ingest/lint 잡이 manual 경로에 커밋 금지. |
| `wiki/{workspaceId}/_system/**` | 린트/감사 자동 생성 | 사람·LLM 모두 수동 편집 지양. |

### 5.2 wiki-fs 경유 규칙

- 모든 wiki 파일 변경은 `@jarvis/wiki-fs` API를 경유합니다.
- Drizzle을 통해 `wiki_page_index` 등의 projection 테이블에 **직접 쓰기 금지**. 워커 동기화 잡이 디스크 → DB projection을 담당합니다.
- `fs.writeFile('wiki/...')` 같은 직접 I/O는 `wiki-fs` 내부에서만 허용됩니다.

### 5.3 sensitivity

`wiki_page_index.sensitivity`는 `PUBLIC | INTERNAL | RESTRICTED | SECRET_REF_ONLY` 중 하나. 권한 체크와 sensitivity 필터는 **동시에** 적용합니다.

---

## 6. 브랜치 네이밍

Wiki 도메인 작업은 다음 패턴을 사용합니다.

```
feature/wiki-<slug>     # 신규 기능 (예: feature/wiki-graph-viewer)
fix/wiki-<slug>         # 버그 수정 (예: fix/wiki-ingest-dedupe)
chore/wiki-<slug>       # 리팩터·문서·의존성 (예: chore/wiki-eslint)
```

위키 외 영역은 접두 `wiki-` 없이 `feature/<slug>`, `fix/<slug>`, `chore/<slug>` 사용.

---

## 7. PR 체크리스트

PR을 올리기 전 로컬에서 다음이 모두 통과해야 합니다.

- [ ] `pnpm type-check` — TypeScript 에러 0
- [ ] `pnpm lint` — ESLint 에러 0 (warning은 허용되나 신규 warning 지양)
- [ ] `pnpm test` — 단위 테스트 전부 PASS
- [ ] `node scripts/check-schema-drift.mjs --precommit` — schema-drift 통과
- [ ] i18n 키 누락 없음 — 새 UI 문자열은 `apps/web/messages/ko.json`에 추가
- [ ] 권한 체크 누락 없음 — 모든 server action 초입에 `PERMISSION_*` 상수로 권한 확인
- [ ] Wiki 경계 준수 — `wiki/auto/` 직접 편집 UI 금지, `wiki/manual/`에 LLM 직접 쓰기 경로 없음

---

## 8. wiki-ingest 1회 실행 가이드

새 개발자가 환경 설정 검증용으로 ingest를 1회 돌려보는 절차입니다.

### 8.1 환경 상태 점검

```bash
pnpm wiki:check
```

이 명령은 `scripts/wiki-check.mjs`를 실행해 다음을 검증합니다:
- `WIKI_ROOT` 경로 존재 및 쓰기 권한
- `wiki/{workspaceId}/.git` 디렉터리 초기화 여부
- `auto/` `manual/` `_system/` 구조 존재
- `index.md`, `log.md` 존재
- DB `wiki_page_index` 테이블과 디스크 상태의 drift 개수

문제가 있으면 경고 출력과 함께 수정 지침을 보여줍니다.

### 8.2 워크스페이스 부트스트랩 (최초 1회)

워크스페이스 디렉토리가 없다면 부트스트랩합니다.

```bash
pnpm wiki:bootstrap --workspace=dev-workspace
```

- `wiki/dev-workspace/.git` 초기화
- `index.md`, `log.md`, `auto/`, `manual/`, `_system/` 생성
- DB에 workspace row 삽입

### 8.3 샘플 raw source 업로드

웹 UI(http://localhost:3010) → Admin → Upload 에서 테스트용 PDF 또는 텍스트 파일을 업로드하거나, CLI로:

```bash
pnpm wiki:upload --workspace=dev-workspace --file=./data/guidebook/sample.md
```

업로드는 MinIO에 원문을 저장하고 DB `raw_source` row를 생성합니다.

### 8.4 ingest 실행

```bash
pnpm wiki:ingest --workspace=dev-workspace --source=<raw_source_id>
```

진행 로그:
```
[Step A] Analysis LLM  — index.md 로드, 관련 페이지 후보 선정
[Step B] Generation LLM — 10~15개 페이지 본문 생성 + [[wikilink]] 삽입
[Step C] Write         — temp worktree에 patch → validate → main merge
[Step D] Review queue  — contradictions / sensitivity 변경 항목 등록
```

완료 후 확인:
```bash
git -C wiki/dev-workspace log --oneline -n 10
ls wiki/dev-workspace/auto/sources/
```

웹 UI → Wiki → `dev-workspace`에서 생성된 페이지를 조회할 수 있습니다.

### 8.5 문제 해결

| 증상 | 원인 | 조치 |
|------|------|------|
| `OPENAI_API_KEY not set` | `.env.local` 누락 | `.env.example` 복사 후 키 입력 |
| `EACCES wiki/...` | 컨테이너 경로 mount 실패 | `WIKI_ROOT`를 호스트 절대경로로 변경 |
| `wiki_page_index drift detected` | 디스크↔DB 불일치 | `pnpm wiki:resync --workspace=<id>` |
| `schema-drift: migration mismatch` | Drizzle migration 누락 | `pnpm db:generate` 후 재커밋 |

---

## 9. 추가 참고

- **상위 지식 하네스**: [`WIKI-AGENTS.md`](WIKI-AGENTS.md)
- **Claude Code 하네스**: [`CLAUDE.md`](CLAUDE.md)
- **Codex CLI 하네스**: [`AGENTS.md`](AGENTS.md)
- **변경 이력**: [`CHANGELOG.md`](CHANGELOG.md)
- **스킬**:
  - `.claude/skills/jarvis-feature/` — 풀스택 기능 오케스트레이터
  - `.claude/skills/jarvis-wiki-feature/` — 위키 도메인 전용 규칙
  - `.claude/skills/jarvis-architecture/` — 아키텍처 레퍼런스
  - `.claude/skills/jarvis-db-patterns/` — Drizzle/DB 패턴
  - `.claude/skills/jarvis-i18n/` — i18n 키 관리
