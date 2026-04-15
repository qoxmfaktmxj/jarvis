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
