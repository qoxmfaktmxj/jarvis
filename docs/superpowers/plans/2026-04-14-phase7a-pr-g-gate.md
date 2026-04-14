# Phase-7A PR#G — Gate Judgment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record G1–G7 check results, open 7B formally, tag 7A completion.

**Architecture:** No code. One new analysis doc + spec revision entry + optional git tag. Gate pass requires Lane A/B/C/D all merged AND all 7 gates green. Failure on any gate → hotfix PR → re-judge.

**Tech Stack:** Markdown, git tag.

**Spec reference:** `docs/superpowers/specs/2026-04-14-phase7-v3-design.md` §4, §6, §2.2.

---

## 배경

Phase-7A는 4개 Lane으로 구성되어 있다 (스펙 §4 기준):
- **Lane A** = PR#1 (observability/llm_call_log) + PR#2 (cost kill-switch) → 게이트 G1, G7
- **Lane B** = PR#3 (PII redactor) + PR#6 (eval fixture/harness) → 게이트 G2, G3, G6
- **Lane C** = PR#4 (schema-drift hook) + PR#7 (document_chunks DDL) + PR#8 (docs) → 게이트 G5
- **Lane D** = PR#5 (cache key/workspace isolation) + PR#9 (CI + cross-workspace leakage) → 게이트 G4

각 Lane이 모두 main에 머지되면, 본 PR#G에서 G1–G7 게이트를 한꺼번에 실측해 Phase-7B 진입 여부를 판정한다.

**PR#G는 코드 변경이 없다.** 오직 세 가지 산출물만 다룬다:
1. `docs/analysis/07-gate-result-2026-04.md` — 게이트 결과 문서
2. 스펙 §9 Revision log에 7A 완료 엔트리 추가
3. (옵션) git tag `phase7a-complete`

플래그(`FEATURE_TWO_STEP_INGEST`, `FEATURE_HYBRID_SEARCH_MVP`)는 여기서 **절대 뒤집지 않는다.** 7B 시작 PR에서 뒤집을 때의 위치/책임자/일정만 결과 문서에 기록한다.

---

## Task 0 — 사전 조건 및 워크트리 준비

- [ ] 현재 브랜치가 `main` 기준 최신인지 확인
  ```bash
  git fetch origin
  git log origin/main --oneline | head -20
  ```
- [ ] 새 워크트리/브랜치 생성
  ```bash
  git worktree add -b claude/phase7a-pr-g-gate .claude/worktrees/phase7a-pr-g-gate origin/main
  cd .claude/worktrees/phase7a-pr-g-gate
  ```
- [ ] Today 날짜 확정: 2026-04-14 (이후 작성되는 실측 날짜는 실제 실행일로 교체)

---

## Task 1 — Lane A/B/C/D 머지 여부 확인

PR#G는 4 Lane이 **전부** main에 머지되었을 때만 의미를 가진다. 하나라도 빠져 있으면 STOP.

- [ ] Lane A (PR#1 observability + PR#2 cost kill-switch) 머지 확인 — 게이트 G1, G7 대응
  ```bash
  git log main --oneline | grep -E 'lane-a|phase7a-pr[12]'
  ```
- [ ] Lane B (PR#3 PII redactor + PR#6 eval fixture) 머지 확인 — 게이트 G2, G3, G6 대응
  ```bash
  git log main --oneline | grep -E 'lane-b|phase7a-pr[36]'
  ```
- [ ] Lane C (PR#4 schema-drift hook + PR#7 document_chunks DDL + PR#8 docs) 머지 확인 — 게이트 G5 대응
  ```bash
  git log main --oneline | grep -E 'lane-c|phase7a-pr[478]'
  ```
- [ ] Lane D (PR#5 cache key + PR#9 CI + cross-workspace leakage) 머지 확인 — 게이트 G4 대응
  ```bash
  git log main --oneline | grep -E 'lane-d|phase7a-pr[59]'
  ```
- [ ] 4개 Lane 중 하나라도 빠져 있으면 → 해당 Lane 소유자에게 핑, PR#G 작업 중단

---

## Task 2 — 결과 문서 파일 생성

- [ ] 디렉토리 확인 및 파일 생성
  ```bash
  mkdir -p docs/analysis
  touch docs/analysis/07-gate-result-2026-04.md
  ```
- [ ] 아래 템플릿을 그대로 붙여 넣는다 (이 시점엔 모든 결과가 `<pending>`/빈 칸)

```markdown
# Phase-7A Gate Result — 2026-04

**Status:** <pending | pass | fail>
**Date:** 2026-04-XX
**Judge:** <name>

## Summary
- Lanes merged: A ✅ / B ✅ / C ✅ / D ✅
- Gates: G1 ☐ G2 ☐ G3 ☐ G4 ☐ G5 ☐ G6 ☐ G7 ☐
- Decision: <GO for 7B | HOLD for hotfix>

## G1 — cost kill-switch
- Command: `pnpm eval:budget-test`
- Input: `LLM_DAILY_BUDGET_USD=0.01`
- Expected: `blocked_by=budget` row ≥1, subsequent calls blocked
- Actual output:
  ```
  <paste real output>
  ```
- Verdict: ☐ PASS / ☐ FAIL

## G2 — PII redactor unit
- Command: `pnpm --filter @jarvis/worker test pii-redactor`
- Expected: 100% pass (20+ cases)
- Actual:
  ```
  <paste>
  ```
- Verdict: ☐ PASS / ☐ FAIL

## G3 — review_queue integration
- Command: `pnpm --filter @jarvis/worker test pii-flow`
- Expected: 1 review_queue row + sensitivity upgrade
- Actual: <paste>
- Verdict: ☐ PASS / ☐ FAIL

## G4 — cross-workspace leakage
- Command: `pnpm test:integration -- cross-workspace-leakage`
- Expected: B chunks 0 count in A's top-50 for 3 query scenarios
- Actual: <paste>
- Verdict: ☐ PASS / ☐ FAIL

## G5 — schema-drift hook blocks
- Command: `node scripts/check-schema-drift.mjs --ci` on intentional drift
- Expected: exit 1, block
- Actual: <paste exit code + snippet>
- Verdict: ☐ PASS / ☐ FAIL

## G6 — eval fixture
- Command: `pnpm eval:run`
- Expected: 30 pairs, error 0, baseline numbers recorded
- Actual baseline:
  - total: 30
  - errors: <n>
  - cache_hit_rate: <pct>
  - avg_latency_ms: <n>
  - avg_cost_usd: <n>
- Verdict: ☐ PASS / ☐ FAIL
- (Baseline is recorded here for Phase-8 comparison only, NOT a bar)

## G7 — llm_call_log completeness
- Manual smoke: 10+ real calls in dev environment
- SQL verification:
  ```sql
  SELECT COUNT(*) FROM llm_call_log WHERE created_at > NOW() - INTERVAL '1 day';
  ```
- Expected: row count = real call count (no missing)
- Actual: <paste>
- Verdict: ☐ PASS / ☐ FAIL

## Overall

All 7 green → 7B unlock.
Any red → hotfix PR → re-judge.

## 7B unlock record
- Feature flags / paths to be activated in 7B start PR (per spec §6.1):
  - `FEATURE_TWO_STEP_INGEST=true` (위치: 7B PR에서 확인)
  - `FEATURE_HYBRID_SEARCH_MVP=true` (위치: 7B PR에서 확인)
  - `wiki_*` write path 활성화 (7B 작업 범위)
- Responsible person: <to-fill>
- Target start date: <to-fill>

> Note: `FEATURE_DOCUMENT_CHUNKS_WRITE`는 Lane C에서 기본 `false`로 배선됨. 7B에서 document_chunks write path 실전 도입 시 플립. **7B unlock 조건**에는 포함되지 않는다.
```

- [ ] 파일 저장 후 git status로 staged 대상 확인

---

## Task 3 — G1 실측 (cost kill-switch)

- [ ] `.env.test`에 `LLM_DAILY_BUDGET_USD=0.01` 임시 설정
- [ ] 실행
  ```bash
  pnpm eval:budget-test 2>&1 | tee /tmp/g1.log
  ```
- [ ] 출력에서 `blocked_by=budget` 라인 존재 확인
- [ ] 후속 호출이 차단(`BUDGET_EXCEEDED`)되는지 확인
- [ ] `/tmp/g1.log` 내용을 결과 문서 G1 Actual output 블록에 붙여 넣고 Verdict 체크
- [ ] FAIL이면 → Failure Playbook 참조

---

## Task 4 — G2 실측 (PII redactor unit)

- [ ] 실행
  ```bash
  pnpm --filter @jarvis/worker test pii-redactor 2>&1 | tee /tmp/g2.log
  ```
- [ ] 전체 케이스 수 ≥ 20, 실패 0 확인
- [ ] 결과 요약 라인(`Tests: N passed, 0 failed`) 및 케이스 수 G2에 붙여 넣고 Verdict 체크

---

## Task 5 — G3 실측 (review_queue 통합)

- [ ] 실행
  ```bash
  pnpm --filter @jarvis/worker test pii-flow 2>&1 | tee /tmp/g3.log
  ```
- [ ] 테스트 후 DB에서 확인
  ```sql
  SELECT id, sensitivity, status FROM review_queue ORDER BY created_at DESC LIMIT 5;
  ```
- [ ] `review_queue` 1행 생성 + 해당 문서 `sensitivity` 업그레이드 확인
- [ ] 결과를 G3에 기록, Verdict 체크

---

## Task 6 — G4 실측 (cross-workspace leakage)

- [ ] 실행
  ```bash
  pnpm test:integration -- cross-workspace-leakage 2>&1 | tee /tmp/g4.log
  ```
- [ ] 3개 쿼리 시나리오 각각에서 Workspace B의 청크가 Workspace A의 top-50에 0개인지 확인
- [ ] 테스트 통과 + 보조로 SQL 카운트 붙여 넣기
- [ ] G4에 기록, Verdict 체크

---

## Task 7 — G5 실측 (schema-drift hook)

- [ ] **G5 probe — safe method**: drift 시뮬레이션 전용 임시 worktree 사용

```bash
# Safe: isolated worktree, no risk to main working tree
git worktree add /tmp/jarvis-g5-probe main
cd /tmp/jarvis-g5-probe

# Create intentional drift: add a dummy line to a schema file, don't run db:generate
echo "// G5 drift probe" >> packages/db/schema/knowledge.ts

# Run the CI-mode hook — expect exit 1
node scripts/check-schema-drift.mjs --ci
echo "Exit code: $?"  # expect 1

# Cleanup: simply remove the worktree (original files untouched)
cd /
git worktree remove /tmp/jarvis-g5-probe --force
```

- [ ] exit code 1 확인, block 메시지 존재 확인
- [ ] G5에 exit code + 출력 snippet 기록, Verdict 체크

> **절대 금지**: 메인 워크트리에서 `git checkout --` 또는 `git restore --`로 복원하지 말 것. 사용자의 작업 중 변경을 덮어쓸 수 있다. 반드시 임시 worktree 사용.

---

## Task 8 — G6 실측 (eval fixture baseline)

- [ ] 실행
  ```bash
  pnpm eval:run 2>&1 | tee /tmp/g6.log
  ```
- [ ] fixture 30 pairs 전수 실행, error 0 확인
- [ ] baseline 수치 추출 및 G6에 기록
  - total: 30
  - errors: _n_
  - cache_hit_rate: _%_
  - avg_latency_ms: _n_
  - avg_cost_usd: _n_
- [ ] **중요:** 이 수치는 Phase-8 비교용 baseline일 뿐 **합격선 아님**. 오류 0만 합격 조건.
- [ ] Verdict 체크

---

## Task 9 — G7 실측 (llm_call_log 완전성)

- [ ] dev 환경에서 AI 호출이 발생하는 실제 플로우 10회 이상 수동 smoke
  - 검색, 답변 생성, 요약, 클러스터 digest 등 다양한 경로 커버
- [ ] SQL 검증
  ```sql
  SELECT COUNT(*) FROM llm_call_log WHERE created_at > NOW() - INTERVAL '1 day';
  ```
- [ ] row count가 실제 호출 횟수와 일치하는지 확인 (누락 없음)
- [ ] G7에 쿼리 결과 + 실제 수행 호출 수 기록, Verdict 체크

---

## Task 10 — 종합 판정

- [ ] 결과 문서 상단 Summary 갱신
  - Gates 체크박스 7개 모두 업데이트 (☑ 또는 ❌)
  - Status: 전부 PASS → `pass`, 하나라도 FAIL → `fail`
  - Decision: `GO for 7B` 또는 `HOLD for hotfix`
- [ ] Date: 실제 판정일로 교체
- [ ] Judge: 판정 책임자 이름 기입

---

## Task 11 — 7B unlock 기록 작성

결과가 GO인 경우에만 진행. HOLD이면 Task 12로 건너뜀.

- [ ] 결과 문서 `## 7B unlock record` 섹션 채우기 (스펙 §6.1 기준)
  - `FEATURE_TWO_STEP_INGEST=true` (위치는 7B PR에서 확인)
  - `FEATURE_HYBRID_SEARCH_MVP=true` (위치는 7B PR에서 확인)
  - `wiki_*` write path 활성화 (7B 작업 범위)
  - Responsible person: 7B 시작 PR 담당자 이름
  - Target start date: 7B 착수 목표일
- [ ] **이 PR에서는 플래그를 뒤집지 않는다.** 실제 true 전환은 7B 시작 PR의 책임.
- [ ] `FEATURE_DOCUMENT_CHUNKS_WRITE`는 7B unlock 조건에 **포함되지 않음**. Lane C에서 기본 `false`로 배선되어 있으며, 7B에서 document_chunks write path 실전 도입 시 별도로 플립.

---

## Task 12 — 스펙 §9 Revision log 일괄 업데이트 (centralization point)

다른 Lane PR들은 spec 파일을 건드리지 않기로 했으므로, **PR#G가 7A 결과를 스펙에 기록하는 유일한 centralization point**다. 여기서 한 번에 7A 결과를 기록한다.

- [ ] `docs/superpowers/specs/2026-04-14-phase7-v3-design.md` §9 열기
- [ ] 아래 엔트리 append
  ```markdown
  | 2026-04-XX | 7A gate 판정 (G1-G7 all green) + 7B 해제 | PR#G |
  ```
  (FAIL인 경우: `7A gate 판정 FAIL — <failed gates> hotfix 필요`)
- [ ] 날짜/결과는 실제 값으로 교체
- [ ] 이 엔트리 추가 후 commit (Task 14에서 한꺼번에 푸시)

---

## Task 13 — (옵션) git tag

GO 판정일 때만:

- [ ] 태그 생성
  ```bash
  git tag -a phase7a-complete -m "Phase-7A complete: all 7 gates green, 7B unlocked"
  git push origin phase7a-complete
  ```
- [ ] HOLD이면 태그 생성하지 않음

---

## Task 14 — Commit, Push, PR

- [ ] 스테이징 및 커밋
  ```bash
  git add docs/analysis/07-gate-result-2026-04.md docs/superpowers/specs/2026-04-14-phase7-v3-design.md
  git commit -m "docs: PR#G — Phase-7A gate judgment + 7B unlock record"
  git push -u origin claude/phase7a-pr-g-gate
  ```
- [ ] PR 생성
  - Title: `docs: PR#G — Phase-7A gate judgment + 7B unlock`
  - Body:
    - 4 Lane 머지 상태 요약
    - G1–G7 각각 PASS/FAIL 표
    - 최종 Decision (GO / HOLD)
    - GO인 경우 7B 시작 PR 담당자/일정 링크
- [ ] 리뷰어 지정: Phase-7 오너

---

## Task 15 — 머지 후 팀 공지 및 CURRENT_STATE 갱신

- [ ] PR 머지 확인
- [ ] `CURRENT_STATE.md`에 Phase-7A 완료 섹션 추가 (또는 기존 Phase 상태 갱신)
  - Phase-7A: complete (2026-04-XX)
  - Gates: 7/7 green
  - Next: Phase-7B (flag flip PR 담당자/일정)
- [ ] 팀 채널 공지: 게이트 결과 문서 링크 + 7B 착수 공지

---

## Self-Review Checklist

- [ ] 결과 문서의 모든 G1–G7 Actual 블록에 실제 출력이 들어갔는가 (플레이스홀더 `<paste>` 잔존 없음)
- [ ] 4 Lane 머지 확인을 실제 `git log`로 했는가 (추측 아님)
- [ ] G6 baseline 5개 수치가 모두 채워졌는가
- [ ] G7 SQL 카운트와 수동 호출 수가 일치하는가
- [ ] 플래그를 이 PR에서 뒤집지 않았는가 (확인: `git diff`에 `flags.ts` 변경 없음)
- [ ] 스펙 §9 revision log 엔트리 추가했는가
- [ ] GO 판정일 때만 `phase7a-complete` 태그 생성했는가
- [ ] 결과 문서 Decision, Status, Date, Judge 4필드 모두 실제 값으로 교체되었는가
- [ ] PR body에 요약표 포함되었는가

---

## Failure Playbook

게이트별 FAIL 시 대응. 게이트 ↔ 책임 Lane 매핑 (스펙 §4 기준):

| Gate | Owner Lane | Hotfix branch |
|------|-----------|---------------|
| G1 | Lane A | `claude/phase7a-hotfix-g1` |
| G2 | Lane B | `claude/phase7a-hotfix-g2` |
| G3 | Lane B | `claude/phase7a-hotfix-g3` |
| G4 | Lane D | `claude/phase7a-hotfix-g4` |
| G5 | Lane C | `claude/phase7a-hotfix-g5` |
| G6 | Lane B | `claude/phase7a-hotfix-g6` |
| G7 | Lane A | `claude/phase7a-hotfix-g7` |

### G1 FAIL (cost kill-switch 미작동)
- 원인 후보: budget check 미호출, 순서 버그, `LLM_DAILY_BUDGET_USD` 환경변수 미주입
- 대응: Lane A 재진입 → hotfix PR (`claude/phase7a-hotfix-g1`) → 수정 후 G1만 재측정 → PR#G 결과 문서 갱신 후 재머지

### G2 FAIL (PII redactor 케이스 누락/오탐)
- 원인 후보: 정규식 누락, 신규 PII 패턴 미포함
- 대응: Lane B에서 케이스 추가 + 구현 수정 → hotfix PR → G2 재측정

### G3 FAIL (review_queue 행 미생성)
- 원인 후보: 파이프라인 분기 미구현, sensitivity 업그레이드 누락
- 대응: Lane B hotfix → G2, G3 동시 재측정

### G4 FAIL (cross-workspace leakage 발견)
- **최우선 긴급**: 데이터 격리 위반. 즉시 Lane D 재진입
- 원인 후보: workspace filter 미적용 쿼리, RLS 누락, 인덱스 혼입, cache key workspace 스코프 누락
- 대응: Lane D hotfix PR → G4 재측정 + 추가 시나리오로 보강

### G5 FAIL (schema-drift hook이 막지 못함)
- 원인 후보: CI 스크립트 exit code 반환 버그, 감지 패턴 누락
- 대응: Lane C hotfix → G5 재측정 (schema-drift hook은 Lane C 소속)

### G6 FAIL (eval fixture 오류)
- 원인 후보: fixture 손상, 런타임 오류, 30 pair 미달
- 대응: Lane B hotfix → G6 재측정 (eval fixture/harness는 Lane B 소속). Baseline은 재측정 값으로 갱신.

### G7 FAIL (llm_call_log 누락)
- 원인 후보: 특정 경로(예: 캐시 히트, 스트리밍)에서 로그 write 누락
- 대응: Lane A hotfix → 누락 경로 보강 → G7 재측정

### 공통 프로토콜
1. 결과 문서의 해당 G 섹션 Verdict에 ❌ 표시 + 원인 메모 추가
2. Status = `fail`, Decision = `HOLD for hotfix`
3. hotfix PR 머지 후 PR#G 재오픈 또는 동일 브랜치에서 결과 문서만 갱신 재커밋
4. 전체 G1–G7 재측정은 선택: 영향 받은 게이트만 재측정해도 되나, 재측정 범위를 결과 문서에 명시
5. 최종 GO 판정까지 `phase7a-complete` 태그 금지
