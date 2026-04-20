---
name: jarvis-feature
description: Jarvis(사내 업무 시스템 + LLM 컴파일 위키) 기능 개발 전체 워크플로우 오케스트레이터. jarvis-planner → jarvis-builder → jarvis-integrator 3인 팀으로 풀스택 기능을 구현한다. 새 기능 추가, 기존 기능 수정, 버그 수정, 리팩토링, 스키마 변경, 페이지 추가, 번역 추가, 권한 변경 등 Jarvis 프로젝트의 모든 구현 작업에 반드시 이 스킬을 사용하라. "이거 구현해줘", "기능 추가해줘", "수정해줘", "다시 실행", "재실행", "업데이트", "보완", "이전 결과 기반으로 개선" 같은 표현에서도 트리거된다.
---

# Jarvis Feature Orchestrator

Jarvis(사내 업무 시스템 + LLM 컴파일 위키) 기능 개발을 `jarvis-planner` → `jarvis-builder` → `jarvis-integrator` 3인 에이전트 팀으로 실행하는 오케스트레이터. 경량 하네스이며, 3인 팀 모두 `.claude/agents/` 정의를 따른다.

## 언제 이 스킬을 사용하는가

Jarvis 프로젝트에서 아래 어느 하나라도 해당되면 이 워크플로우로 진입한다:
- 새 기능 구현 (페이지, server action, 워커 잡, API)
- 기존 기능 수정 / 개선
- 버그 수정 (단순 오타 1줄 수정 제외)
- 스키마 변경 / 마이그레이션 추가
- 권한 체계 변경
- 번역 키 일괄 추가
- 재실행·재시도·보완 요청

단일 파일 1~2줄 수정이면 팀을 동원하지 않고 직접 수정해도 된다. 애매하면 팀으로.

## 실행 모드

**에이전트 팀 (기본).** `TeamCreate`로 3인 팀을 구성하고 `TaskCreate`로 작업을 할당. 팀원은 `SendMessage`로 직접 조율. 파이프라인 패턴이지만 team 모드로 유연성 확보 (builder가 planner에게 역질문 가능).

## Phase 0: 컨텍스트 확인

워크플로우 시작 시 `_workspace/` 존재 여부를 확인해 실행 모드를 결정한다:

```
_workspace/ 없음              → 초기 실행
_workspace/ 있음 + 새 요청     → 이전을 _workspace_prev_{timestamp}/로 이동, 새 실행
_workspace/ 있음 + 부분 수정    → 부분 재실행 (해당 에이전트만 재호출)
_workspace/ 있음 + 진행 중단   → 미완료 지점부터 재개
```

**판단 기준:**
- 사용자가 "다시 해", "처음부터"라고 하면 → 새 실행 + 아카이브
- "이 부분만 수정", "이거 틀렸어" → 부분 재실행
- 침묵 + 새 기능명 → 초기 또는 새 실행 (이전 기능과 무관하면)
- "계속해", "이어서" → 진행 중단 지점부터 재개

## Phase 1: 기능 요청 명료화

사용자 요청을 받으면:

1. **요청 해석**: 무엇을 구현해야 하는가? 기존 어느 영역에 붙는가?
2. **범위 확인**: 한 번에 너무 많으면 쪼갠다. 예 — "대시보드 개선" → "어떤 위젯?"
3. **애매하면 질문**: 팀을 소집하기 전에 사용자에게 1~2개만 핵심 질문. 계획자가 또 묻게 하지 않는다.

**건너뛸 수 있을 때:** 요청이 충분히 구체적이면 (예: "`knowledge_page.pinned_at` 컬럼 추가하고 고정 버튼 구현") 바로 Phase 2로.

## Phase 2: 팀 구성 및 계획 단계

### 2-1. 팀 생성

```
TeamCreate(
  team_name="jarvis-feature-team",
  members=["jarvis-planner", "jarvis-builder", "jarvis-integrator"]
)
```

각 에이전트는 `.claude/agents/*.md`에 정의됨. 호출 시 `model: "opus"` 명시.

### 2-2. 계획 작업 할당

`jarvis-planner`에게 첫 작업:
```
TaskCreate(
  assignee="jarvis-planner",
  title="기능 {이름} 영향도 분석 및 작업 분해",
  body="""
  기능 요청: {요청 원문}
  산출물: _workspace/01_planner_{feature-slug}.md
  - 영향도 체크리스트 전 계층 기입
  - 빌더 작업 순서 명시
  - 통합 검증자 체크포인트 포함
  참조 스킬: jarvis-architecture (필수 진입점), jarvis-db-patterns (DB/권한 변경 시), jarvis-wiki-feature (wiki 도메인 시), jarvis-i18n (UI 문자열 시)
  """
)
```

계획자는 영향도 분석이 끝나면 `SendMessage`로 오케스트레이터에게 보고.

### 2-3. 계획 리뷰 (오케스트레이터 판단)

- **명백히 부족**: 계획자에게 재작업 요청 (빠진 계층 명시)
- **사용자 확인 필요**: 아키텍처 결정 / RBAC 결정 / 파괴적 변경 / 마이그레이션 포함 시 사용자에게 계획 요약 제시 후 승인 받기
- **충분**: Phase 3으로

## Phase 3: 빌드 단계

### 3-1. 빌드 작업 할당

`jarvis-builder`에게:
```
TaskCreate(
  assignee="jarvis-builder",
  title="기능 {이름} 구현",
  body="""
  계획 파일: _workspace/01_planner_{feature-slug}.md
  진행 파일: _workspace/02_builder_progress.md
  - 파일 변경 순서는 의존성 순서 (스키마 → validation → server → UI → i18n)
  - 각 파일 변경 후 progress 업데이트
  - 계획과 충돌 시 planner에게 역질문
  """
)
```

### 3-2. 빌드 모니터링

빌더가 중간에 역질문을 보내면 (`SendMessage` → planner), 팀 내에서 자체 해결. 오케스트레이터는 관여하지 않는다. 단, **사용자 결정이 필요한 수준**의 질문(새 PERMISSION 생성, 스키마 파괴적 변경 등)은 오케스트레이터가 포착해 사용자에게 에스컬레이션.

### 3-3. 빌드 완료 신호

빌더가 progress 파일의 "진행 중"을 모두 "완료"로 옮기고 오케스트레이터에게 "빌드 완료" 메시지를 보내면 Phase 4로.

## Phase 4: 통합 검증 단계

### 4-1. 검증 작업 할당

`jarvis-integrator`에게:
```
TaskCreate(
  assignee="jarvis-integrator",
  title="기능 {이름} 경계면 정합성 검증",
  body="""
  계획: _workspace/01_planner_{feature-slug}.md
  진행: _workspace/02_builder_progress.md
  보고서: _workspace/03_integrator_report.md
  필수 자동화:
  - pnpm --filter @jarvis/web type-check
  - pnpm --filter @jarvis/web lint
  - 관련 unit test
  - node scripts/check-schema-drift.mjs --precommit (스키마 변경 시)
  - pnpm wiki:check (wiki 도메인 변경 시)
  - pnpm audit:rsc (RSC 컴포넌트 이동/추가 시)
  - pnpm eval:budget-test (AI 파이프라인 변경 시)
  필수 교차 비교:
  - server action shape ↔ 클라이언트 훅
  - i18n 키 + 보간 변수
  - 권한 / sensitivity 누락 (Ask AI는 세션 기반, 나머지는 requirePermission)
  - Wiki 경계: auto/manual 위반, wiki-fs 우회, DB body 쓰기, raw chunk RAG
  """
)
```

### 4-2. 검증 실패 시

`jarvis-integrator`는 실패 항목을 `jarvis-builder`에게 `SendMessage`로 되돌린다. 빌더가 수정 후 다시 검증자에게 넘긴다. 반복.

**반복 한도: 2회.** 같은 실패가 2회 이상 반복되면 검증자가 계획자에게 에스컬레이션 (계획 단계에서 놓친 것일 가능성). 계획자가 계획 수정 → 빌드 → 검증 재시작.

오케스트레이터는 3회 이상 반복되면 사용자에게 보고.

### 4-3. 검증 통과

`_workspace/03_integrator_report.md`의 모든 항목이 OK이면 Phase 5로.

## Phase 5: 최종 보고 및 팀 정리

### 5-1. 사용자 보고

```markdown
# {기능 이름} 구현 완료

## 변경 요약
- {핵심 변경 3~5줄}

## 변경된 파일
- {경로}: {무엇}
- ...

## 검증 결과
- type-check: OK
- lint: OK
- unit test: OK
- shape / i18n / 권한 / sensitivity: 모두 OK

## 미해결 이슈 (있다면)
- {이슈}

## 다음 권장 작업 (선택)
- {E2E 테스트 추가, 수동 QA, 배포 등}

산출물:
- _workspace/01_planner_*.md
- _workspace/02_builder_progress.md
- _workspace/03_integrator_report.md
```

### 5-2. 피드백 수집 (Phase 7 진화 대비)

사용자에게 간단히 질문: "결과에서 개선할 부분 있나요? 워크플로우 자체에 고칠 점이 있나요?" 없으면 넘어간다.

### 5-3. 팀 정리

팀을 해체한다 (`TeamDelete` 또는 유사). 다음 세션에서 새로 만든다. `_workspace/`는 보존 — 감사·재실행·drift 감지에 필요.

## 데이터 전달 프로토콜

| 채널 | 용도 |
|------|------|
| 태스크 (TaskCreate/Update) | 작업 단위 배정, 진행 추적 |
| 메시지 (SendMessage) | 역질문, 반려, 검증 결과, 협업 조율 |
| 파일 (`_workspace/`) | 계획서, 진행 파일, 검증 보고서, 대용량 산출물 |
| 실제 소스 변경 | 빌더가 직접 수정 (Write/Edit), 검증자는 Read만 |

**파일 경로 컨벤션:**
```
_workspace/
├─ 01_planner_{feature-slug}.md   (계획)
├─ 02_builder_progress.md         (빌드 진행)
├─ 03_integrator_report.md        (검증 보고서)
└─ (보조 아티팩트가 있으면 04_*, 05_*)
```

## 에러 핸들링

| 상황 | 전략 |
|------|------|
| 에이전트 1회 실패 | 에러 원인 포함해 재시도 요청 |
| 에이전트 2회 실패 | 이전 Phase로 에스컬레이션 (검증→빌드→계획) |
| 에이전트 3회 실패 | 사용자에게 보고, 하네스 진화 대상 후보 |
| 계획이 실제 코드와 심각 불일치 | 계획 전면 재작성, 이전 계획을 `_workspace/01_planner_*_v1.md`로 보존 |
| type-check/lint 실패 | 검증자가 빌더에게 되돌림 (직접 수정 금지) |
| 파괴적 변경 감지 | 사용자 승인 필수, 승인 전 실행 금지 |

## 팀 크기 정당성

3인 팀 (planner + builder + integrator)은 Jarvis 규모에 맞춘 경량 설정:
- 2인(계획+빌드)은 경계면 버그를 놓침 — 과거 세션에서 i18n 키 mismatch 반복 발생
- 4인 이상(frontend/backend 분리)은 Jarvis의 풀스택 성격과 맞지 않음. Next.js App Router는 RSC와 클라이언트가 같은 파일·같은 디렉토리에 섞여서 분리 오버헤드가 큼.
- 디자인 전면 재구성이 예정되어 있어 frontend 전담이 불필요

## 테스트 시나리오

### 정상 흐름
1. 사용자: "지식 문서에 고정(pin) 기능 추가해줘"
2. 오케스트레이터: Phase 0 확인 → `_workspace/` 없음 → 초기 실행
3. Phase 1: 요청 명료 → 질문 없이 진행
4. Phase 2: 팀 생성 → planner에게 계획 작업
5. planner: `01_planner_pin-feature.md` 작성 (스키마·권한·i18n·페이지 전부 명시)
6. Phase 3: builder에게 구현 작업
7. builder: 스키마 → migration → validation → server action → UI → i18n 순서로 구현, progress 업데이트
8. Phase 4: integrator가 type-check + shape 비교 + i18n 검증 → 모두 OK
9. Phase 5: 사용자에게 완료 보고, 팀 정리

### 에러 흐름 (i18n 불일치)
1. ~~Phase 1~3 동일~~
2. Phase 4: integrator가 `Knowledge.Detail.pinnedAt` 보간 변수 불일치 발견 (ko.json `{date}` vs 컴포넌트 `when`)
3. integrator → builder `SendMessage`: "P1 이슈. 변수명 통일 필요."
4. builder 수정 (ko.json 또는 컴포넌트 중 1곳), progress 업데이트
5. integrator 재검증 → OK
6. Phase 5 진행

## 이전 세션 학습

- i18n 보간 변수 불일치가 과거 세션에서 반복 발생 → integrator의 i18n 교차 검증을 필수 체크리스트에 추가
- 계획 없이 바로 빌드로 들어가면 영향도 누락 → planner 단계를 건너뛰지 않는다
- 경량 하네스 기조 유지: 3인 이상 확장 금지 (진화 단계에서도)
