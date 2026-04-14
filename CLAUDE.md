# Jarvis — Claude Code Guide

사내 업무 시스템 + 사내 위키 + RAG AI 포털 통합. Next.js 15 모노레포(`apps/web`, `apps/worker`, `packages/*`).

## 하네스: Jarvis Feature Development

**목표:** 사내 업무 시스템 + 사내 위키 통합 프로젝트의 풀스택 기능 개발을 3인 에이전트 팀으로 실행. 경량 하네스(planner + builder + integrator), 디자인 재구성 대기 중이므로 구조·데이터 흐름 우선.

**트리거:** Jarvis 프로젝트에서 기능 추가·수정·버그 수정·리팩토링·스키마 변경·번역 추가·권한 변경 등 구현 작업을 요청받으면 `jarvis-feature` 스킬을 사용하라. 단일 파일 1~2줄 수정이나 질문은 직접 응답해도 된다.

**구성 요소:**
- 에이전트: `.claude/agents/jarvis-planner.md`, `.claude/agents/jarvis-builder.md`, `.claude/agents/jarvis-integrator.md`
- 스킬: `.claude/skills/jarvis-feature/` (오케스트레이터), `.claude/skills/jarvis-architecture/`, `.claude/skills/jarvis-db-patterns/`, `.claude/skills/jarvis-i18n/`
- 훅: `.claude/settings.json` (PostToolUse → `scripts/check-schema-drift.mjs --hook`, advisory). CI/pre-commit은 동일 스크립트에 `--ci`/`--precommit`을 붙여 블로킹.
- Codex 공유 지시문: `AGENTS.md` (같은 하네스 원칙을 Codex CLI에서도 재사용)
- 공유 스크립트: `scripts/check-schema-drift.mjs` (Claude Code hook / Codex 수동 / CI 공용)

**변경 이력:**
| 날짜 | 변경 내용 | 대상 | 사유 |
|------|----------|------|------|
| 2026-04-10 | 초기 구성 (경량 3인 팀) | 전체 | 사내 업무 시스템 + 사내 위키 통합 프로젝트 경량 하네스 요청 |
| 2026-04-10 | Drizzle schema drift 훅 + Codex용 `AGENTS.md` 추가 | `.claude/settings.json`, `scripts/check-schema-drift.mjs`, `AGENTS.md` | 경량 훅 1(advisory) 설치 + Codex CLI에서도 동일 원칙 따르도록 지시문 미러링 |
| 2026-04-14 | schema-drift hook에 `--ci`/`--precommit` blocking 모드 추가 | `scripts/check-schema-drift.mjs`, `scripts/tests/check-schema-drift.test.mjs` | G5 게이트: 의도적 drift에서 CI exit 1 보장 (Phase-7A PR#4) |
