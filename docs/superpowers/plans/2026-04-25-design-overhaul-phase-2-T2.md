# Design Overhaul — Phase 2 T2 (Balanced) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Phase 2 T1(Spacious) 후속으로 **T2 Balanced** 화면군(Dashboard widgets + KPI grid · AskSidebar · Search result · Knowledge sidebar · WikiPageView InfraRunbookHeader · 그 외 §8 T2 항목)의 구 토큰(`isu-*`/`surface-*`/`lime-*`/`rose-*`) 사용처를 신 토큰으로 전수 교체한다. T1에서 이월된 비차단 cleanup TODO도 이 PR에서 함께 처리할지 task별로 결정.

**Architecture:** T1과 동일한 기계적 token 치환 + Phase 1 §0 매핑 표 적용. T2는 카드/리스트/요약 중심(Balanced tier — `--shadow-soft`, `rounded-[10px]`, `p-5`)이라 hover 상태가 많아 `hover:bg-[--brand-primary-bg]` 패턴(spec §9.6) 빈번. 도메인 단위 commit 분할(7~8 commits) + 단일 verification gate.

**Tech Stack:** Next.js 15 · React 19 · Tailwind v4 (`bg-[--token]` arbitrary value) · shadcn/ui · Vitest 3 · pnpm 10 · Windows + git bash.

**Spec:** [`docs/superpowers/specs/2026-04-24-design-overhaul-design.md`](../specs/2026-04-24-design-overhaul-design.md) (§7 Tier matrix · §8 T2 scope · §9 component specs · §17 success criteria)

**Phase 1 plan (token migration table):** [`docs/superpowers/plans/2026-04-24-design-overhaul-phase-1.md`](2026-04-24-design-overhaul-phase-1.md) §0

**T1 plan (already merged in `d5a3ae5`):** 디스크에서 삭제됨(memory rule). 참고 필요시 `git show 8bad2d2..d5a3ae5 --stat` 또는 PR diff.

**Previews:** `docs/superpowers/specs/previews/{dashboard,ask-ai}.html` (Dashboard hero+KPI / Ask AI sidebar)

---

## 0. Token Migration Reference

T1 plan §0 매핑 표를 그대로 사용. 주요 변경/엄격 룰:

| 구 Class | 신 Class | 비고 |
|---|---|---|
| `bg-isu-*` | `bg-[--brand-primary*]` 계열 | Phase 1 §0 그대로 |
| `bg-surface-50` | `bg-[--bg-surface]` | warm-50 |
| `bg-surface-100` | `bg-[--bg-page]` (페이지 루트) 또는 `bg-[--bg-surface]` (offset 카드/리스트) | 문맥 |
| `text-surface-400` | `text-[--fg-muted]` | |
| `text-surface-500/600` | `text-[--fg-secondary]` | |
| **`text-surface-700/800/900`** | **`text-[--fg-primary]`** | T1 review에서 -700이 -secondary로 잘못 매핑됐던 사례. 엄격 적용 |
| `border-surface-100` | `border-[--border-soft]` | rgba 0.06 |
| `border-surface-200/300` | `border-[--border-default]` | rgba 0.10 |
| `text-rose-*` | `text-[--color-red-500]` | |
| `bg-rose-50` / `border-rose-200` | `bg-[--color-red-50]` / `border-[--color-red-200]` | |
| Tailwind native `text-red-*` / `bg-red-*` / `border-red-*` (T2 scope 안에서 만나면) | `text-[--color-red-500]` / `bg-[--color-red-50]` / `border-[--color-red-200]` | T1 hygiene와 동일 정책. 같은 라인을 이미 건드릴 때 함께 정리 |

**T1 review에서 학습한 hard rules:**
- Primary CTA bg = `bg-[--brand-primary]` — **never** `bg-[--fg-primary]`
- Primary CTA focus ring = `ring-[--border-focus]` — **never** `ring-[--brand-primary]`
- Input focus ring = `ring-[--brand-primary-bg]` (spec §9.2)
- Hover on rows/list items: `hover:bg-[--brand-primary-bg]` (spec §9.6 table pattern) — T2에서 매우 빈번
- 인라인 hex/rgb 금지 (`bg-[#xxxxxx]`) — semantic token 사용
- Border 토큰을 fill 배경으로 쓰지 말 것 (`bg-[--border-default]`은 의미 오류 — `bg-[--bg-surface]` 또는 `bg-[--color-warm-200]`)
- 코드 블록(`<pre>`) 배경은 `bg-[--bg-surface]` (preview `wiki-page.html:99` 기준 — T1에서 검증됨, T2 코드 블록도 동일)

**lime decision tree** (T1과 동일):
- selected/active → `--brand-primary-bg`
- success confirmation → `--status-success-fg/bg` (Teal)
- done state → `--status-done-fg/bg` (Green, distinct from success)
- decorative → `--status-decorative-{purple,pink,brown}-*`
- neutral highlight → `--status-neutral-*`

---

## 1. T2 Scope (spec §8)

### 1.1 In-scope

T1 baseline grep(`8bad2d2..d5a3ae5` 머지 후) 기준:

| # | 도메인 | 파일 | stale lines |
|---|---|---|---|
| A | Dashboard widgets (KPI 그리드 + 사이드 위젯) | `apps/web/app/(app)/dashboard/_components/{MyTasks,QuickLinks,RecentActivity,SearchTrends,StalePages,Stat}*.tsx` (6 파일) | 37 |
| B | AskSidebar 클러스터 | `apps/web/components/ai/AskSidebar.tsx`, `AskSidebarDateGroup.tsx`, `AskSidebarItem.tsx` | 20 |
| C | Wiki InfraRunbookHeader (회색지대 §8) | `apps/web/components/WikiPageView/InfraRunbookHeader.tsx` | 14 |
| D | Knowledge PageMetaSidebar | `apps/web/components/knowledge/PageMetaSidebar.tsx` | 7 |
| E | Search result card | `apps/web/components/search/ResultCard.tsx` | 8 |
| F | KpiTile pattern (Phase 1 helper, T2에서 호출되며 토큰 정합성 확인) | `apps/web/components/patterns/KpiTile.tsx` | Task 0에서 0 확인 (verify only) |
| G | Knowledge CategoryGrid (spec §8) | `apps/web/components/knowledge/CategoryGrid.tsx` | Task 0에서 존재·잔존 확인 (verify or migrate) |
| H | Notices list (spec §8) | `apps/web/components/notices/*` | Task 0에서 존재·잔존 확인 |
| I | Systems health card (spec §8) | `apps/web/components/system/SystemCard.tsx` | Task 0에서 존재·잔존 확인 |
| J | Attendance calendar (spec §8) | `apps/web/components/attendance/AttendanceCalendar.tsx` | Task 0에서 존재·잔존 확인 |

**총 알려진 stale 86 lines** + F/G/H/I/J에서 추가 발견 가능. Task 0 baseline에서 정확히 카운트.

### 1.2 Out-of-scope (T3 또는 별도 PR)

- **T3 Dense:** 모든 테이블·폼(`*Table.tsx`, `*Form.tsx`), Org Tree, MenuEditor, SettingsForm, AccessPanel, filter toolbar
- **`globals.css` alias bridge 제거** (`--color-isu-*`, `--color-lime-*`, `--color-surface-*`, `::selection`, `--color-sidebar-accent`, 옛 `@utility shadow-elev/focus-ring-brand/bg-grid/shimmer`): T3 PR 마지막에서
- **404/error 페이지 신규 생성:** 별도 feature task
- **Storybook stories:** 별도 PR (test-irrelevant)

### 1.3 Cleanup TODOs ported from T1 final review

T1 머지(`d5a3ae5`) 후 main에 잔존하는 비차단 hygiene 항목. 각 항목의 처리 시점을 T2 plan에서 결정:

#### Minor — T2 PR에 포함 권장 (T2 작업 중 같은 라인 건드릴 때)

- [ ] **C-1** `apps/web/app/(app)/profile/_components/ProfileInfo.tsx` — `text-foreground`, `text-muted-foreground` (shadcn alias bridge) → 신 토큰 직접 사용. Profile은 T1에서 마이그레이션됐지만 shadcn alias가 잔존. T3 alias 제거와 함께 정리해도 OK.
- [ ] **C-2** `apps/web/app/(app)/profile/_components/QuickMenuEditor.tsx:95` — error branch `text-destructive` (shadcn alias). 같은 conditional의 success branch는 이미 `text-[--status-success-fg]`로 마이그레이션됨. error는 `text-[--color-red-500]`로 통일 권장.
- [ ] **C-3** `apps/web/components/WikiPageView/WikiPageView.tsx:309` — 이미지 `shadow-[0_1px_2px_rgba(15,23,42,0.04)]` → `shadow-[var(--shadow-flat)]` (Phase 1 매핑 표). 가시성 낮음.
- [ ] **C-4** `apps/web/components/WikiPageView/WikiPageView.tsx:21-23, 31-33` — `public`(emerald) / `restricted`(amber) sensitivity chip+bar는 Tailwind native. 신 토큰에 `--status-public-*` / `--status-restricted-*`가 없음. 두 가지 옵션:
  - (a) 새 토큰 추가 후 마이그레이션 (spec 확장 필요 — 별도 결정)
  - (b) 그대로 유지 (Tailwind native이지만 hex가 아니라 OK)

#### Stretch — T2/T3 별도 commit (선택)

- [ ] **C-5** `apps/web/app/globals.css:219` — `--color-sidebar-accent: var(--color-lime-400)` → Notion Blue 또는 warm 직접 참조 (lime alias 의존성 제거)
- [ ] **C-6** `apps/web/app/globals.css:305-308` — `::selection` lime/isu alias → warm/notion-black 직접 참조
- [ ] **C-7** `--shadow-elev-*` 토큰 정비/삭제 (Phase 1 도입된 후 unused 가능성)
- [ ] **C-8** `apps/web/components/ui/button.tsx` destructive variant 토큰 통일 — `bg-destructive` 등 shadcn alias → `bg-[--color-red-500]` 직접
- [ ] **C-9** `apps/web/components/patterns/PriorityChip.tsx` — P3 라벨 `text-[--fg-secondary]` 등 → `text-[--status-neutral-*]` (semantic 명확화)

#### T3 final (필수, T3 PR 마지막 commit)

- [ ] **C-10** `apps/web/app/globals.css` alias bridge tokens 전수 제거: `--color-isu-*`, `--color-surface-*`, `--color-lime-*`, `--color-sidebar-accent`, `::selection lime/isu` references, 옛 `@utility {shadow-elev*, focus-ring-brand, bg-grid, shimmer}` 정리. spec §17 성공 기준.

### 1.4 검증 게이트 (T1과 동일, Task 7에서 실행)

| 명령 (cwd: `apps/web`) | 시점 |
|---|---|
| `pnpm type-check` ×2 | 매 task |
| `pnpm test -- --run <범위>` | 해당 파일 test 존재 시 |
| `pnpm test -- --run` ×2 (전체) | Task 7 |
| `pnpm build` | Task 7 |
| `grep -rE "stale tokens" T2 paths` → 0 | Task 7 |
| Dev server visual smoke (light + dark) | Task 7 (선택) |
| Playwright `--grep "@smoke"` | Task 7 (선택) |

> RSC boundary / DB / LLM 호출 변경 없음 → `pnpm audit:rsc`, `pnpm wiki:check`, `pnpm eval:budget-test`, `node scripts/check-schema-drift.mjs --precommit` 불필요.

---

## 2. File structure

### 2.1 Modify (확정)

- `apps/web/app/(app)/dashboard/_components/MyTasksWidget.tsx`
- `apps/web/app/(app)/dashboard/_components/QuickLinksWidget.tsx`
- `apps/web/app/(app)/dashboard/_components/RecentActivityWidget.tsx`
- `apps/web/app/(app)/dashboard/_components/SearchTrendsWidget.tsx`
- `apps/web/app/(app)/dashboard/_components/StalePagesWidget.tsx`
- `apps/web/app/(app)/dashboard/_components/StatCard.tsx`
- `apps/web/components/ai/AskSidebar.tsx`
- `apps/web/components/ai/AskSidebarDateGroup.tsx`
- `apps/web/components/ai/AskSidebarItem.tsx`
- `apps/web/components/WikiPageView/InfraRunbookHeader.tsx`
- `apps/web/components/knowledge/PageMetaSidebar.tsx`
- `apps/web/components/search/ResultCard.tsx`

### 2.2 Modify (Task 0에서 존재·잔존 확인 후 결정)

- `apps/web/components/knowledge/CategoryGrid.tsx` — spec §8 T2 항목
- `apps/web/components/notices/*.tsx` — spec §8 T2 항목 (디렉토리 존재 확인 필요)
- `apps/web/components/system/SystemCard.tsx` — spec §8 T2 항목
- `apps/web/components/attendance/AttendanceCalendar.tsx` — spec §8 T2 항목

### 2.3 Read-only references

- `apps/web/app/globals.css` — 토큰 정의 (T2에서 수정 금지, T3에서 alias 제거)
- `apps/web/components/ui/*` — Phase 1 완료 (수정 금지)
- `apps/web/components/patterns/*.tsx` — Phase 1 helpers (필요시 verify only)
- `docs/superpowers/specs/previews/{dashboard,ask-ai}.html` — visual ground truth

### 2.4 Create

없음. 순수 token 치환.

---

## 3. Tasks

### Task 0: Baseline 재스냅샷 + verify-only 도메인 확인

**Files:** 없음

- [ ] **Step 1: type-check baseline**
  `cd apps/web && pnpm type-check` → 0 errors
- [ ] **Step 2: 전체 test baseline**
  `cd apps/web && pnpm test -- --run` → 50 files / 313+ tests pass
- [ ] **Step 3: T2 scope grep snapshot**

```bash
cd apps/web && grep -rEcH "(bg|text|border|ring|hover:bg|hover:text|focus:ring)-(isu|surface|lime|rose)-[0-9]+" \
  "app/(app)/dashboard/_components/" \
  "components/ai/AskSidebar.tsx" "components/ai/AskSidebarDateGroup.tsx" "components/ai/AskSidebarItem.tsx" \
  "components/WikiPageView/InfraRunbookHeader.tsx" \
  "components/knowledge/PageMetaSidebar.tsx" \
  "components/knowledge/CategoryGrid.tsx" \
  "components/search/ResultCard.tsx" \
  "components/notices/" \
  "components/system/SystemCard.tsx" \
  "components/attendance/AttendanceCalendar.tsx" \
  2>/dev/null | grep -v ":0$"
```

기록한 카운트로 후속 task 사이즈 결정.

- [ ] **Step 4: KpiTile.tsx 0건 verify-only**
  spec §8에서 KPI grid를 T2로 분류. `components/patterns/KpiTile.tsx`은 Phase 1 helper로 이미 신 토큰 사용 가정. grep 0이면 skip; 비-0이면 task로 추가.
- [ ] **Step 5: 존재 확인이 필요한 디렉토리/파일 검증**
  `components/notices/`, `components/knowledge/CategoryGrid.tsx`, `components/system/SystemCard.tsx`, `components/attendance/AttendanceCalendar.tsx` — 존재하지 않으면 plan에서 out-of-scope로 표시.

### Task 1: Dashboard widgets 마이그레이션

**Files (6):**
- `apps/web/app/(app)/dashboard/_components/MyTasksWidget.tsx` (6)
- `apps/web/app/(app)/dashboard/_components/QuickLinksWidget.tsx` (5)
- `apps/web/app/(app)/dashboard/_components/RecentActivityWidget.tsx` (9)
- `apps/web/app/(app)/dashboard/_components/SearchTrendsWidget.tsx` (8)
- `apps/web/app/(app)/dashboard/_components/StalePagesWidget.tsx` (5)
- `apps/web/app/(app)/dashboard/_components/StatCard.tsx` (4)

**Total:** 37 stale lines.

T2 Balanced context: 카드 grid · `--shadow-soft` · `rounded-[10px]` · `p-5`. Hover은 `hover:bg-[--brand-primary-bg]` 권장 (spec §9.6).

- [ ] **Step 1**: 6 파일 Read
- [ ] **Step 2**: Phase 1 §0 매핑대로 Edit (각 파일별)
- [ ] **Step 3**: dashboard test 실행 (`pnpm test -- --run "(app)/dashboard"`)
- [ ] **Step 4**: type-check + grep 0 검증
- [ ] **Step 5**: Commit `refactor(design): migrate Dashboard widgets to Notion tokens (T2)`

### Task 2: Ask AI Sidebar 마이그레이션

**Files (3):**
- `apps/web/components/ai/AskSidebar.tsx` (14)
- `apps/web/components/ai/AskSidebarDateGroup.tsx` (1)
- `apps/web/components/ai/AskSidebarItem.tsx` (5)

**Total:** 20 stale lines.

T1과 짝을 이루는 사이드바. Hover/selected state 매핑 주의:
- Selected conversation row → `bg-[--brand-primary-bg]` (Notion Blue tinted)
- Hover row → `hover:bg-[--bg-surface]` 또는 `hover:bg-[--brand-primary-bg]` (preview 비교)

- [ ] Steps 1-5: Task 1과 동일 패턴
- Commit: `refactor(design): migrate Ask AI Sidebar to Notion tokens (T2)`

### Task 3: Wiki InfraRunbookHeader 마이그레이션

**Files:**
- `apps/web/components/WikiPageView/InfraRunbookHeader.tsx` (14)

회색지대 — Wiki 페이지 본문(T1 완료) 위쪽 메타 패널. T1에서 의도적으로 보존됨.

- [ ] Steps 1-5
- Commit: `refactor(design): migrate WikiPageView InfraRunbookHeader to Notion tokens (T2)`

### Task 4: Knowledge sidebar + Search result card

**Files:**
- `apps/web/components/knowledge/PageMetaSidebar.tsx` (7)
- `apps/web/components/search/ResultCard.tsx` (8)

작은 두 파일. 같은 commit으로 묶기 또는 분리(implementer 결정).

- [ ] Steps 1-5
- Commit: `refactor(design): migrate Knowledge sidebar + Search result to Notion tokens (T2)` (or split)

### Task 5: §8 T2 그 외 (Task 0에서 stale > 0인 항목만)

CategoryGrid · notices/* · SystemCard · AttendanceCalendar 중 **Task 0에서 stale > 0이 확인된 것만** 마이그레이션. 0이면 skip.

- [ ] Steps 1-5 (per file)
- Commits: 도메인별 분리 권장

### Task 6: T1에서 이월된 cleanup (선택)

§1.3의 C-1 ~ C-4 (Minor) 중 T2 작업 라인과 겹치는 것을 같은 commit에 포함.
C-5 ~ C-9 (Stretch) — T2에서 별도 commit으로 처리할지 T3로 미룰지 implementer 판단.

- [ ] 항목별 commit 또는 patch단위 묶음
- Commit prefix: `refactor(design): T1 cleanup follow-up` 등

### Task 7: 최종 verification gate

T1과 동일 게이트:

- [ ] T2 scope 전수 grep = 0 (위 §1.4 명령 그대로)
- [ ] type-check ×2
- [ ] pnpm test ×2 (전체)
- [ ] pnpm build
- [ ] Dev server visual smoke (대시보드, Ask AI 좌측 사이드바, 위키 페이지 메타 패널, 검색 결과, knowledge 사이드바, 시스템/근태 카드 — light + dark)
- [ ] Playwright `@smoke` (선택)
- [ ] PR 준비 — `feat/design-overhaul-phase-2-T2` 브랜치 push + PR draft

---

## 4. Self-review checklist

### 4.1 Spec coverage (§17)

| Criterion | Verdict 기대 |
|---|---|
| T2 scope `lime-*` 0건 | PASS |
| T2 scope `isu-*` 0건 | PASS |
| T2 scope `surface-*` 0건 | PASS |
| T2 scope `text-rose-*` 0건 | PASS |
| 인라인 hex/rgb T2 scope 0건 | PASS |
| `globals.css` alias bridge 제거 | DEFERRED (T3) |
| 다크 모드 대비 깨짐 없음 | 수동 verify (light/dark) |

### 4.2 Type consistency

`text-surface-700/800/900 → --fg-primary` 엄격 적용. Primary CTA bg/ring 룰 위반 없음. Border 토큰을 fill bg로 쓰지 말 것.

### 4.3 Lime decisions (T2 scope에서 발견시)

T1 결정 트리 그대로 적용. 각 인스턴스에 대해 surrounding JSX에서 의미 추론 후 `--brand-primary-bg` / `--status-{success,done,decorative}-*` / `--status-neutral-*` 중 선택.

---

## 5. Execution handoff

**Subagent-Driven (권장):** task당 fresh subagent + spec-reviewer + code-quality-reviewer. T1에서 효과 입증 (3건의 매핑 오류 + 1건의 spec §9.1 위반 catch).

**중요 운영 룰 (T1 학습):**
- 모든 subagent prompt에 worktree 경로 명시 + `git rev-parse --abbrev-ref HEAD` 검증을 commit 전 강제 (T1 Task 1에서 잘못된 worktree에 commit한 이슈 방지). 자세한 내용은 [`feedback_subagent_worktree.md`](../../../.claude/projects/.../memory/feedback_subagent_worktree.md) — 사용자 메모리 파일이라 경로 회사 환경 상이.
- spec-reviewer가 critical/important 이슈 제기 시 — implementer가 fix → re-review (skill 권장). 단 fix가 spec/preview에 reasonable한지 controller가 사전 판단(T1 Task 5 `<pre>` 블록은 preview에 부합해 reviewer 의견 기각).

**Inline (`executing-plans`):** 한 세션 일괄. T2는 Tasks 1-5가 mostly mechanical이라 inline도 무방.

진입 시점에 사용자가 선택. 기본은 subagent-driven-development.

---

## 6. Out-of-scope record (T3 PR 진입 시 참조)

T3 plan은 T2 머지 후 별도 작성:

- 모든 테이블/폼 마이그레이션
- alias bridge 제거 (`--color-isu-*` etc.)
- T1/T2 누적 cleanup TODO C-5 ~ C-9 처리
- spec §17 success criteria 전수 충족 (lime/isu/surface/rose 0건 across `apps/web/`, alias 토큰 0건, 인라인 hex 0건, dark mode 검증)
- `/design-review` 전 화면 sweep (T3 머지 후)
- 5 user 실사용 (대시보드 1h · Ask AI 10회 · 위키 편집 3건 · 테이블 필터)
