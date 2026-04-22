---
name: jarvis-feature
description: Jarvis(사내 업무 시스템 + LLM 컴파일 위키) 기능 개발의 진입점. superpowers 워크플로우(brainstorming → writing-plans → subagent-driven-development → verification-before-completion)에 Jarvis 도메인 컨텍스트(jarvis-architecture, jarvis-db-patterns, jarvis-i18n, jarvis-wiki-feature)를 주입하는 얇은 오케스트레이터. 새 기능 추가, 기존 기능 수정, 버그 수정, 리팩토링, 스키마 변경, 페이지 추가, 번역 추가, 권한 변경, "이거 구현해줘", "기능 추가", "수정해줘", "다시 실행", "재실행", "업데이트", "보완", "이전 결과 기반으로 개선" 등 Jarvis 구현 작업 요청에서 반드시 이 스킬을 사용하라.
---

# Jarvis Feature Orchestrator

Jarvis 기능 개발의 얇은 진입점. **방법론(계획·TDD·실행·리뷰·검증)은 superpowers 플러그인에 위임**하고, 이 스킬은 Jarvis 고유의 도메인 컨텍스트를 각 단계에 주입하는 역할만 한다.

## 언제 이 스킬을 사용하는가

Jarvis 프로젝트에서 아래 중 하나라도 해당되면 진입:

- 새 기능 구현 (페이지, server action, 워커 잡, API)
- 기존 기능 수정 / 개선
- 버그 수정 (단순 오타 1줄 제외)
- 스키마 변경 / 마이그레이션 추가
- 권한 체계 변경
- 번역 키 일괄 추가
- 재실행·재시도·보완 요청

단일 파일 1~2줄 수정·정보 조회는 직접 처리해도 된다. 애매하면 이 워크플로우로.

## 핵심 원칙

**Jarvis 하네스는 "도메인 지식"만 담당한다.** 방법론(TDD, 계획 작성, 서브에이전트 실행 루프, 코드 리뷰, 증거 기반 완료 검증, 병렬 디스패치, 디버깅, git worktree)은 **superpowers가 이미 담당**하므로 재발명하지 않는다.

| 역할 | 담당 |
|------|------|
| 브레인스토밍 · 요구 탐색 | `superpowers:brainstorming` |
| 구현 계획서 작성 | `superpowers:writing-plans` |
| 같은 세션에서 task-by-task 실행 + 리뷰 루프 | `superpowers:subagent-driven-development` |
| 별도 세션에서 계획 실행 | `superpowers:executing-plans` |
| TDD red-green-refactor | `superpowers:test-driven-development` |
| 완료 주장 전 증거 확보 | `superpowers:verification-before-completion` |
| 디버깅 근본 원인 | `superpowers:systematic-debugging` |
| 코드 리뷰 요청/수신 | `superpowers:requesting-code-review` / `superpowers:receiving-code-review` |
| 병렬 독립 작업 | `superpowers:dispatching-parallel-agents` |
| 격리된 워크트리 | `superpowers:using-git-worktrees` |
| 브랜치 마감 | `superpowers:finishing-a-development-branch` |
| **Jarvis 도메인 지식** | `jarvis-architecture`, `jarvis-db-patterns`, `jarvis-i18n`, `jarvis-wiki-feature` |

## Phase 0: 컨텍스트 확인

워크플로우 시작 시 기존 산출물 존재 여부를 확인한다. superpowers가 계획을 저장하는 위치는 `docs/superpowers/plans/YYYY-MM-DD-<feature>.md`이므로 거기를 먼저 본다.

```
계획 파일 없음               → 초기 실행 (Phase 1부터)
계획 파일 있음 + 새 요청     → 새 실행 (기존 계획 `_archive/`로 이동 가능)
계획 파일 있음 + 부분 수정    → 해당 task만 재실행 (subagent-driven-development 중간 재진입)
계획 파일 있음 + 진행 중단   → 미완료 task부터 재개
```

사용자가 "다시 해", "처음부터"라 하면 새 실행. "이 부분만" → 부분 재실행. "계속해" → 재개.

## Phase 1: 도메인 컨텍스트 로드 (Jarvis 고유)

요청을 보고 **필요한 도메인 스킬만** Skill 도구로 Read한다. 스킬별 트리거:

| 로드 조건 | 도메인 스킬 |
|----------|-----------|
| 항상 (어느 패키지/라우트에 넣을지 결정) | `jarvis-architecture` (**진입점**) |
| DB 스키마·마이그레이션·RBAC·sensitivity·Zod·server action·트랜잭션 | `jarvis-db-patterns` |
| UI 문자열·번역 키·보간 변수 추가 | `jarvis-i18n` |
| `wiki/**`, `packages/wiki-fs/**`, `packages/wiki-agent/**`, `packages/ai/page-first/**`, `apps/worker/src/jobs/ingest/**`, `wiki-*` 테이블, "ingest"·"위키"·"auto/manual"·"Karpathy"·"page-first" 언급 | `jarvis-wiki-feature` |

**원칙:** 해당 작업과 무관한 스킬은 로드하지 않는다(컨텍스트 낭비). 단, `jarvis-architecture`는 거의 항상 필요하므로 기본 진입점.

## Phase 2: 요구 탐색 (애매할 때만)

요청이 모호하거나 여러 해석이 가능하면 먼저 `superpowers:brainstorming`으로 요구·제약을 명료화한다. 요청이 이미 충분히 구체적이면(`"knowledge_page.pinned_at` 컬럼 추가하고 고정 버튼 구현") 바로 Phase 3으로.

## Phase 3: 계획 작성

`superpowers:writing-plans`로 구현 계획서를 작성한다. 단, **Jarvis 영향도를 누락하지 않도록** 다음을 반드시 계획에 포함시킨다(Phase 1에서 로드한 `jarvis-architecture`의 "영향도 체크리스트" 섹션에 16개 계층 전수 나열):

- DB 스키마 / Validation / 권한(34상수·5역할) / 세션 vs 권한 모델 / Sensitivity 필터
- Ask AI 6-lane 라우터 / Wiki-fs Karpathy 경계 / 검색 선택(pg-search vs precedent-search)
- 서버 액션·API / 서버 lib / UI 라우트·컴포넌트 / i18n 키 / 테스트 / 워커 잡 / LLM 호출 / Audit

해당 없음도 명시한다. 파일 변경 순서(20단계)는 `jarvis-architecture`의 "파일 변경 순서" 섹션 준수.

**계획 승인 조건:** 아키텍처 결정 / 새 PERMISSION 생성 / 파괴적 마이그레이션 / sensitivity 정책 변경이 포함되면 사용자 승인 후 Phase 4.

## Phase 4: 구현 + 리뷰 (task-by-task)

`superpowers:subagent-driven-development`를 기본으로 사용한다. implementer → spec-reviewer → code-quality-reviewer 루프. 각 서브에이전트에게 다음을 **명시적 컨텍스트로 주입**한다:

| 서브에이전트 | Jarvis 도메인 주입 |
|------------|------------------|
| implementer | `jarvis-architecture`의 파일 변경 순서 20단계 + 해당 도메인 스킬(db-patterns / i18n / wiki-feature). TDD는 `superpowers:test-driven-development` 따름. |
| spec-reviewer | `jarvis-db-patterns`의 "경계면 교차 비교 체크리스트"(shape·권한·sensitivity·nullable·마이그레이션·i18n 교차 비교). `jarvis-i18n`의 "경계면 검증" 섹션. wiki 변경이면 `jarvis-wiki-feature`의 "Karpathy 원칙 4가지" + "자주 하는 실수". |
| code-quality-reviewer | 일반 원칙 + Jarvis 특수 패턴(Ask AI는 세션 기반, Case는 독립 벡터 공간, Wiki는 projection only). |

**별도 세션 실행이 필요하면** `superpowers:executing-plans`로 대체. git worktree 격리는 `superpowers:using-git-worktrees`.

## Phase 5: 완료 전 검증

`superpowers:verification-before-completion`으로 증거 기반 완료 선언. **Jarvis 전용 검증 게이트**는 `jarvis-architecture`의 "검증 게이트 명령" 표에 있다:

- `pnpm --filter @jarvis/web type-check` / `lint` (항상)
- `pnpm test` (범위 좁혀)
- `pnpm db:generate` + `node scripts/check-schema-drift.mjs --precommit` (스키마 변경)
- `pnpm wiki:check` (wiki 도메인)
- `pnpm audit:rsc` (RSC 경계 변경)
- `pnpm eval:budget-test` (AI 파이프라인 변경)
- `pnpm --filter @jarvis/web exec playwright test` (UI 라우트 변경, PR 직전)

변경 범위 밖 게이트는 불필요. 하나라도 실패하면 우회 금지, 근본 원인 해결.

## Phase 6: 브랜치 마감

PR·merge·cleanup은 `superpowers:finishing-a-development-branch`에 위임. 이 스킬은 그 시점에 개입하지 않는다.

## Phase 7: 피드백 수집 (하네스 진화)

완료 후 사용자에게 한 문장으로 질문: "결과 또는 워크플로우에 개선할 점이 있나요?" 답이 있으면 CLAUDE.md 변경 이력에 기록하고 해당 도메인 스킬(또는 이 진입점)을 갱신한다.

## 참고 스킬 링크

- [`jarvis-architecture`](../jarvis-architecture/SKILL.md) — 모노레포·파이프라인·영향도 체크리스트·파일 변경 순서·검증 게이트
- [`jarvis-db-patterns`](../jarvis-db-patterns/SKILL.md) — 스키마 31 파일·34 권한·5 역할·sensitivity·server action·경계면 교차 비교
- [`jarvis-i18n`](../jarvis-i18n/SKILL.md) — ko.json 네임스페이스·보간 변수·경계면 검증
- [`jarvis-wiki-feature`](../jarvis-wiki-feature/SKILL.md) — Karpathy 경계·ingest 4단계·projection 무결성

## 이전 세션 학습

- i18n 보간 변수 불일치가 과거 반복 발생 → spec-reviewer가 `jarvis-i18n`의 교차 검증 필수 실행
- 계획 없이 구현 시작하면 영향도 누락 → `superpowers:writing-plans` 건너뛰지 않는다
- 경량 기조 유지: 이 오케스트레이터는 얇게, 방법론은 superpowers에 위임
