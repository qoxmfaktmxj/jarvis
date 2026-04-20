# Jarvis — Claude Code Guide

사내 업무 시스템 + LLM 컴파일 위키 통합 (Karpathy LLM Wiki 방식). Next.js 15 모노레포(`apps/web`, `apps/worker`, `packages/*`).

## 하네스: Jarvis Feature Development

**목표:** 사내 업무 시스템 + 사내 위키 통합 프로젝트의 풀스택 기능 개발을 3인 에이전트 팀으로 실행. 경량 하네스(planner + builder + integrator), 디자인 재구성 대기 중이므로 구조·데이터 흐름 우선.

**트리거:** Jarvis 프로젝트에서 기능 추가·수정·버그 수정·리팩토링·스키마 변경·번역 추가·권한 변경 등 구현 작업을 요청받으면 `jarvis-feature` 스킬을 사용하라. 단일 파일 1~2줄 수정이나 질문은 직접 응답해도 된다.

**구성 요소:**
- 에이전트: `.claude/agents/jarvis-planner.md`, `.claude/agents/jarvis-builder.md`, `.claude/agents/jarvis-integrator.md`
- 스킬: `.claude/skills/jarvis-feature/` (오케스트레이터), `.claude/skills/jarvis-architecture/`, `.claude/skills/jarvis-db-patterns/`, `.claude/skills/jarvis-i18n/`, `.claude/skills/jarvis-wiki-feature/` (위키 도메인 레퍼런스)
- 훅: `.claude/settings.json` (PostToolUse → `scripts/check-schema-drift.mjs --hook`, advisory). CI/pre-commit은 동일 스크립트에 `--ci`/`--precommit`을 붙여 블로킹.
- Codex 공유 지시문: `AGENTS.md` (같은 하네스 원칙을 Codex CLI에서도 재사용)
- 공유 스크립트: `scripts/check-schema-drift.mjs` (Claude Code hook / Codex 수동 / CI 공용)

**변경 이력:**
| 날짜 | 변경 내용 | 대상 | 사유 |
|------|----------|------|------|
| 2026-04-10 | 초기 구성 (경량 3인 팀) | 전체 | 사내 업무 시스템 + 사내 위키 통합 프로젝트 경량 하네스 요청 |
| 2026-04-10 | Drizzle schema drift 훅 + Codex용 `AGENTS.md` 추가 | `.claude/settings.json`, `scripts/check-schema-drift.mjs`, `AGENTS.md` | 경량 훅 1(advisory) 설치 + Codex CLI에서도 동일 원칙 따르도록 지시문 미러링 |
| 2026-04-14 | schema-drift hook에 `--ci`/`--precommit` blocking 모드 추가 | `scripts/check-schema-drift.mjs`, `scripts/tests/check-schema-drift.test.mjs` | G5 게이트: 의도적 drift에서 CI exit 1 보장 (Phase-7A PR#4) |
| 2026-04-15 | Karpathy LLM Wiki 피벗 반영 — 자기정의 업데이트 | L3 자기정의 ("RAG AI 포털" → "LLM 컴파일 위키") | CLAUDE.md가 RAG 시대 정체성을 system prompt에 주입하는 drift 수정. Phase-W3 이후 실제 아키텍처 반영 |
| 2026-04-15 | `jarvis-wiki-feature` 스킬 신설 | `.claude/skills/jarvis-wiki-feature/SKILL.md` | Karpathy 피벗 후 위키 도메인(auto/manual 경계, wiki-fs 경유, DB projection only) 전용 레퍼런스 필요 |
| 2026-04-20 | 하네스 drift 수정 — "RAG AI 포털" 용어 잔존 제거 + CLAUDE.md 구성 요소에 `jarvis-wiki-feature` 추가 | `jarvis-planner.md`, `jarvis-architecture/SKILL.md`, `jarvis-feature/SKILL.md`, `CLAUDE.md` | 2026-04-15 자기정의 업데이트가 하위 에이전트·스킬에 전파되지 않았고, 신설 스킬이 구성 요소 목록에 미등록. `/harness:harness` 점검으로 발견 |
| 2026-04-20 | 하네스 전면 재작성 (Karpathy 피벗 이후 아키텍처 현행화) | `jarvis-architecture/SKILL.md` 전면 재작성 · `jarvis-wiki-feature/SKILL.md` 전면 재작성 · `jarvis-db-patterns/SKILL.md` 보강(31 스키마, 34 권한, 5 역할, Ask AI 세션 모델, Wiki projection 무결성, Case 독립 벡터 공간) · `jarvis-i18n/SKILL.md` en.json 각주 · `jarvis-planner.md` 영향도 체크리스트 확장(Ask AI/Wiki-fs/CLIProxyAPI/Audit) · `jarvis-builder.md` 파일 변경 순서 현행화(20단계) + 도메인별 특별 규칙(Wiki/Ask AI/Case) · `jarvis-integrator.md` 자동화 명령 보강(wiki:check, audit:rsc, eval:budget-test, check-schema-drift --precommit) · `jarvis-feature/SKILL.md` 오케스트레이터 자동화 체크리스트 보강 | 3개 서브에이전트 전수 스캔 결과: packages 6→8(wiki-fs/wiki-agent 신설), Ask AI 단일 claim RAG → 6-lane 라우터 + page-first retrieval, ingest 4단계 분해, 스키마 29→31 파일(case/directory/ask-conversation/llm-call-log/additional-development 등), 권한 34개/5역할, Redis 제거, CLIProxyAPI 게이트웨이 — 기존 아키텍처 스킬이 옛 RAG 시대 모델에 머물러 planner 영향도 분석 품질에 직접 타격. 3인 경량 팀 기조는 유지 |
