# Changelog

All notable changes to Jarvis will be documented in this file.
Format: [버전/날짜] — 변경 유형 — 내용

---

## [Unreleased] — Phase-W 진행 중 (2026-04-15~)

### Added
- Wiki Phase-C: GitHub Actions wiki-boundary-check, legacy-body-grep, type-check, schema-drift 워크플로
- Wiki Phase-C: Tiptap 기반 manual 편집 에디터 (C1)
- Wiki Phase-C: 읽기 전용 위키 뷰어 (C2)
- Wiki Phase-C: GraphViewer UI — vis-network 기반 (C3)
- Wiki Phase-C: Admin review-queue ApprovalDialog + server actions (C4)
- Wiki Phase-C: Eval fixture 40건 (page-first-qa 30건, multi-page-ingest 10건)
- Wiki Phase-C: wiki-check.mjs 무결성 검증 스크립트
- Wiki Phase-C: Storybook 초기 설정 (C6)
- Wiki Phase-C: Playwright E2E 시나리오 spec skeleton (C7)

---

## [2026-04-15] — Phase-W3 (경계/격리/비활성화)

### Added
- W3-T1: legacy-body-grep CI — `mdxContent` 토큰 제거, SQL 컬럼 토큰만 유지
- W3-T3: schema-drift CI — body-column-guard 테스트 스텝 추가
- W3-T4: `FEATURE_RAW_CHUNK_QUERY=false` — ask.ts chunk 경로 기본 비활성화 (legacy RAG gate)
- W3-T5: `buildWikiSensitivitySqlFilter()` — wiki 경로 전용 sensitivity SQL 헬퍼 신설, 엄격 규약 적용
- W3-T7: worker healthcheck HTTP 서버 (9090 포트, pg-boss 연결 검증)
- W3-T8: `docker-build.yml` — web + worker Dockerfile 빌드 smoke CI (GHA cache)
- v4-W3-T1: `wiki-boundary-check.yml` 활성화 + `wiki-lint/boundary.ts` — auto/manual 경계 감지
- v4-W3-T1: Admin 위키 경계 위반 대시보드 (`/admin/wiki/boundary-violations`)
- v4-W3-T2: Graphify 격리 — `GRAPHIFY_OUTPUT_PATH = 'wiki/auto/derived/code'` + `graphify-boundary.yml`
- v4-W3-T4: eval fixture 30건 (`apps/worker/eval/fixtures/2026-04/page-qa.jsonl`) + recall@5 runner
- v4-W3-T5: Admin 운영 모니터링 대시보드 (`/admin/observability/wiki`, 7개 위젯, 30s 자동 새로고침)

### Changed
- W3-T2: `FEATURE_WIKI_FS_MODE` flag — `ingest.ts` 로컬 정의 → `packages/db/feature-flags.ts` 중앙 이동
- W3-T6: `docker/Dockerfile.web` — `wiki-fs`, `wiki-agent` 패키지 COPY 추가
- W3-T6: `docker/Dockerfile.worker` — `auth`, `search`, `wiki-fs`, `wiki-agent` 패키지 COPY 추가
- W3-T7: `Dockerfile.worker` HEALTHCHECK — no-op `node -e "process.exit(0)"` → `wget http://localhost:9090/health`

### Security / RBAC (공지 필요)
- **[RBAC 변경] DEVELOPER 역할 — wiki RESTRICTED 페이지 접근 제거**
  - **변경 전:** `KNOWLEDGE_UPDATE` 보유자(`DEVELOPER`)가 wiki shortlist/AI 검색 결과에서 `RESTRICTED` 페이지를 볼 수 있었음 (SQL 필터 느슨)
  - **변경 후:** `KNOWLEDGE_REVIEW` 없으면 `RESTRICTED` 페이지가 검색·AI 결과에서 제외됨 (`buildWikiSensitivitySqlFilter` 엄격 규약)
  - **배경:** 기존 "목록엔 뜨지만 클릭하면 403" UX 불일치 해소. `wiki-sensitivity.ts`의 본문 열람 게이트와 SQL 필터 규약 통일.
  - **영향 범위:** DEVELOPER 역할 사용자. RESTRICTED 위키 열람이 필요하면 MANAGER 권한 요청 필요.
  - **롤백:** `buildKnowledgeSensitivitySqlFilter`로 shortlist/expand 호출처 revert.

---

## [2026-04-15] — Phase-W2-B (Wave 2-B 병렬 트랙)

### Added
- W3-X1: docs/plan/2026-04-W3-gate.md — Wave 3 게이트 체크리스트 템플릿 (12개 작업)
- W3-X4: apps/web/e2e/wiki-viewer.spec.ts — Wiki 뷰어 Playwright 스모크 (4 step)
- W3-X4: apps/web/e2e/wiki-graph.spec.ts — Wiki 그래프 Playwright 스모크 (4 step)
- W3-X5: apps/worker/src/lib/observability/logger.ts — pino JSON 포맷 logger (T7 wiring 대기)
- W3-X5: apps/worker/src/lib/observability/metrics.ts — pg-boss queue lag/size gauge (T7 wiring 대기)
- W3-X6: packages/db/drizzle/__drafts__/drop_document_chunks.sql — DROP 드래프트 (T4 flag=false 안정 조건)

---

## [2026-04-15] — Phase-W 피벗

### Changed
- **아키텍처 피벗**: Karpathy-first 원칙 도입 — wiki-fs 경유 + auto/manual 경계 분리
- Phase-7 RAG 시스템 위에 wiki-fs 레이어 추가

---

## [2026-04-10 이전] — Phase-7 (레거시 참조)

### Added
- Ask AI (RAG 파이프라인 v1)
- Knowledge 페이지 시스템
- 관리자 대시보드 초기 버전
- Playwright E2E 38개 테스트
- 로그인 페이지 loading overlay
