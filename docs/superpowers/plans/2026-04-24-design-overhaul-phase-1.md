# Design Overhaul — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jarvis `apps/web`의 디자인 토큰·shadcn primitive·패턴 헬퍼·디자인 시스템 문서를 Notion-aligned Hybrid 팔레트(spec §5–§9)로 전면 교체한다. **Phase 1 범위 한정**: 토큰 + 27 primitives + 4 헬퍼 + `docs/design-system.md` v3. 화면(`app/(app)/**`, `components/{project,admin,search,WikiPageView,ai,knowledge,system,attendance,notices}/**`) 리튠은 Phase 2 별도 플랜.

**Architecture:** Tailwind v4 `@theme` 블록을 신 팔레트로 재작성하되, 기존 `isu-*` / `surface-*` / `lime-*` 클래스를 **alias bridge**로 보존 (Phase 2가 소비 완료할 때까지). 4개 헬퍼(`Field`, `NativeSelect`, `StatusChip`, `PriorityChip`)는 `components/patterns/`에 Vitest TDD로 추출. primitive 27개는 token 치환 패턴을 기계적으로 적용. 최종 게이트는 lime/isu 잔존 grep + type-check×2 + test×2 + `/ui-ux-pro-max` + `/impeccable` 리뷰.

**Tech Stack:** Next.js 15 · React 19 · Tailwind CSS v4 (`@theme inline`) · shadcn/ui · Radix UI · Pretendard Variable · Vitest 3 · pnpm · Windows 개발 환경.

**Spec:** [`docs/superpowers/specs/2026-04-24-design-overhaul-design.md`](../specs/2026-04-24-design-overhaul-design.md) (커밋 `1da46e7`)

**Previews (ground truth):** [`docs/superpowers/specs/previews/*.html`](../specs/previews/)

---

## 0. Token Migration Reference (모든 primitive 태스크에서 참조)

primitive 리튠 시 기계적 치환 규칙. 반드시 이 매핑대로 교체할 것.

| 구 Class | 신 Class (Tailwind arbitrary value) | 비고 |
|---|---|---|
| `bg-isu-50` | `bg-[--brand-primary-bg]` | #f2f9ff |
| `bg-isu-100` | `bg-[--brand-primary-bg]` | 동일 매핑 |
| `bg-isu-500` / `bg-isu-600` | `bg-[--brand-primary]` | Notion Blue `#0075de` |
| `bg-isu-700` | `bg-[--brand-primary-hover]` | Active Blue `#005bab` |
| `text-isu-600` / `text-isu-700` | `text-[--brand-primary-text]` | #097fe8 |
| `text-isu-50` | `text-white` | 버튼 라벨 |
| `border-isu-200` | `border-[--border-default]` | whisper |
| `border-isu-500` | `border-[--brand-primary]` | focus |
| `ring-isu-200` | `ring-[--brand-primary-bg]` | focus ring |
| `bg-surface-50` | `bg-[--bg-surface]` | warm-50 #faf9f8 |
| `bg-surface-100` | `bg-[--bg-surface]` | warm-50 (pure white 통일) |
| `bg-surface-200` | `bg-[--bg-page]` | white — 페이지 배경 |
| `text-surface-500` | `text-[--fg-secondary]` | #615d59 |
| `text-surface-400` | `text-[--fg-muted]` | #a39e98 |
| `text-surface-700` / `text-surface-900` | `text-[--fg-primary]` | rgba(0,0,0,0.95) |
| `border-surface-100` | `border-[--border-soft]` | rgba(0,0,0,0.06) |
| `border-surface-200` | `border-[--border-default]` | rgba(0,0,0,0.1) |
| `bg-lime-*` (UI 컨텍스트) | **제거** — 해당 요소는 CTA면 `bg-[--brand-primary]`, 칩이면 `bg-[--status-decorative-*-bg]` |
| `bg-lime-*` (그래프 컨텍스트) | `bg-[--graph-node-*]` | 격리 namespace |
| `text-rose-600` | `text-[--color-red-500]` | Danger red #dc2626 |
| `bg-rose-50` | `bg-[--color-red-50]` | #fef2f2 |
| `shadow-[0_1px_2px_rgba(15,23,42,0.03)]` | `shadow-[var(--shadow-flat)]` | T3 |
| `shadow-sm` / `shadow-elev-1` | `shadow-[var(--shadow-soft)]` | T1/T2 |
| `rounded-md` (6px, 카드) | `rounded-lg` (8px) | T3에서 소폭 상향 |
| `rounded-md` (6px, 버튼/입력) | `rounded-md` 유지 | 기존 유지 |
| `rounded-2xl` / `rounded-3xl` | `rounded-xl` (12px) 또는 `rounded-2xl` (16px) | T1 카드/hero |

**칩 색상 매핑 업데이트 (§9.4):**
- `done` → `bg-[--status-done-bg] text-[--status-done-fg]` (Green #1aae39)
- `progress` → `bg-[--status-success-bg] text-[--status-success-fg]` (Teal #2a9d99) ← **신규**
- `review` / `active` → `bg-[--status-active-bg] text-[--status-active-fg]` (Notion Blue)
- `hold` / `warning` → `bg-[--status-warn-bg] text-[--status-warn-fg]` (Orange #dd5b00)
- `danger` / `urgent` / `blocked` → `bg-[--status-danger-bg] text-[--status-danger-fg]` (Red #dc2626) ← **신규**
- `neutral` / `todo` → `bg-[--status-neutral-bg] text-[--status-neutral-fg]` (warm neutral)

---

## File structure

### Create

- `apps/web/components/patterns/Field.tsx` — label + 자식 + 에러 3슬롯 래퍼
- `apps/web/components/patterns/Field.test.tsx`
- `apps/web/components/patterns/NativeSelect.tsx` — 네이티브 `<select>` compact 래퍼 (shadcn Select와 이름 충돌 회피)
- `apps/web/components/patterns/NativeSelect.test.tsx`
- `apps/web/components/patterns/StatusChip.tsx` — 상태 → 색 매핑 칩
- `apps/web/components/patterns/StatusChip.test.tsx`
- `apps/web/components/patterns/PriorityChip.tsx` — P1/P2/P3 전용
- `apps/web/components/patterns/PriorityChip.test.tsx`

### Modify (핵심)

- `apps/web/app/globals.css` — `@theme` 블록 전면 재작성 + dark mode 블록 추가 + alias bridge
- `apps/web/components/ui/*.tsx` — 27개 파일 (§9 primitive 리튠)
- `docs/design-system.md` — v2 → v3 Notion 통일판 재작성

### Reference only (커밋 `1da46e7`)

- `docs/superpowers/specs/2026-04-24-design-overhaul-design.md` — spec 본문
- `docs/superpowers/specs/previews/{login,dashboard,wiki-page,ask-ai,task-table}.html` — 시각적 ground truth

---

## Part A — Token Foundation

### Task 1: Add Notion raw palette to `@theme` (additive, 무파괴)

**목적:** 새 `--color-notion-blue`, warm neutral, semantic accents, red를 `@theme` 블록 **맨 위**에 추가. 기존 `isu-*`/`lime-*`/`surface-*`는 그대로 둠. 이 태스크 이후 빌드는 정상, 시각 변화 0.

**Files:**
- Modify: `apps/web/app/globals.css:20-90` — `@theme` 블록 상단에 추가

- [ ] **Step 1: 현재 `@theme` 블록 백업용 읽기 (mental note)**

Run: `head -90 apps/web/app/globals.css`
Expected: ISU Blue scale, Lime scale, Surface scale, shadcn bridge 섹션 확인.

- [ ] **Step 2: `@theme` 블록 시작부 바로 아래에 Notion 팔레트 토큰 삽입**

`apps/web/app/globals.css`에서 `@theme {` 다음 줄부터 `/* ── ISU Blue Scale ────` 위까지 다음 블록 추가:

```css
  /* ── Notion-aligned Palette (2026-04-24 overhaul) ─────────────── */
  /* Primary */
  --color-notion-blue:      #0075de;
  --color-notion-blue-hover:#005bab;  /* active/pressed */
  --color-notion-blue-bg:   #f2f9ff;  /* pill badge bg */
  --color-notion-blue-text: #097fe8;  /* pill badge text, focus ring */
  --color-notion-black:     rgba(0,0,0,0.95);

  /* Warm neutrals (yellow-brown undertone) */
  --color-warm-50:   #faf9f8;
  --color-warm-100:  #f6f5f4;
  --color-warm-200:  #e7e5e3;
  --color-warm-300:  #a39e98;
  --color-warm-500:  #615d59;
  --color-warm-700:  #47433f;
  --color-warm-900:  #31302e;

  /* Semantic accents (Notion 6 + red) */
  --color-teal:      #2a9d99;
  --color-teal-50:   #e8f6f5;
  --color-green:     #1aae39;
  --color-green-50:  #e7f7eb;
  --color-orange:    #dd5b00;
  --color-orange-50: #fff4e6;
  --color-pink:      #ff64c8;
  --color-pink-50:   #ffe6f5;
  --color-purple:    #391c57;
  --color-purple-50: #efeaf5;
  --color-brown:     #523410;
  --color-brown-50:  #f4eee7;
  --color-red-500:   #dc2626;
  --color-red-50:    #fef2f2;
  --color-red-200:   #fecaca;

  /* Whisper borders */
  --color-whisper:      rgba(0,0,0,0.10);
  --color-whisper-soft: rgba(0,0,0,0.06);

  /* Graph visualization (UI에선 금지, graph-* 유틸로만 노출) */
  --graph-node-1: #2a9d99;  /* Teal */
  --graph-node-2: #ff64c8;  /* Pink */
  --graph-node-3: #391c57;  /* Purple */
  --graph-node-4: #523410;  /* Brown */
  --graph-node-5: #dd5b00;  /* Orange */
  --graph-node-6: #0075de;  /* Blue */
```

- [ ] **Step 3: 빌드로 추가 토큰이 CSS로 방출되는지 확인**

Run: `pnpm -C apps/web type-check && pnpm -C apps/web type-check`
Expected: 양쪽 모두 PASS.

Run: `pnpm -C apps/web build 2>&1 | tail -20`
Expected: 빌드 성공 (warning은 허용).

- [ ] **Step 4: 시각 회귀 없음 확인**

Run: `pnpm -C apps/web dev` (백그라운드)
Open: `http://localhost:3000/ko/login` (또는 익숙한 아무 페이지)
Expected: 기존과 동일하게 보임 (아직 semantic bridge 미변경).

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/globals.css
git commit -m "feat(design): add Notion-aligned raw palette to @theme (additive)

Phase 1 T1. ISU/Lime/Surface 기존 토큰 보존. Notion Blue + warm
neutral + 6 semantic accents + red + whisper + graph-* namespace
추가. 시각 회귀 없음.

Refs: docs/superpowers/specs/2026-04-24-design-overhaul-design.md"
```

---

### Task 2: Semantic role 토큰을 신 팔레트로 rewire (페이지 배경 white화)

**목적:** shadcn `--color-background`, `--color-primary`, `--color-border`, 등을 신 팔레트로 가리키도록 교체. 이 태스크부터 페이지 배경이 warm tint에서 **pure white**로 바뀜.

**Files:**
- Modify: `apps/web/app/globals.css:~70-90` — shadcn/ui semantic token bridge 섹션

- [ ] **Step 1: 기존 shadcn bridge 블록 찾기**

`apps/web/app/globals.css`에서 `/* ── shadcn/ui semantic token bridge ─`로 시작하는 블록을 찾는다.

- [ ] **Step 2: bridge 블록을 다음 내용으로 교체 (in-place)**

```css
  /* ── shadcn/ui semantic token bridge (Notion-aligned) ─────── */
  --color-background:           #ffffff;                        /* pure white */
  --color-foreground:           var(--color-notion-black);
  --color-card:                 #ffffff;
  --color-card-foreground:      var(--color-notion-black);
  --color-popover:              #ffffff;
  --color-popover-foreground:   var(--color-notion-black);
  --color-primary:              var(--color-notion-blue);
  --color-primary-foreground:   #ffffff;
  --color-secondary:            var(--color-warm-50);
  --color-secondary-foreground: var(--color-notion-black);
  --color-muted:                var(--color-warm-50);
  --color-muted-foreground:     var(--color-warm-500);
  --color-accent:               var(--color-notion-blue-bg);    /* lime 제거, Notion Blue tint */
  --color-accent-foreground:    var(--color-notion-blue-text);
  --color-destructive:          var(--color-red-500);
  --color-destructive-foreground: #ffffff;
  --color-border:               var(--color-whisper);
  --color-input:                var(--color-whisper);
  --color-ring:                 var(--color-notion-blue-text);

  /* Role aliases (primitive에서 직접 참조) */
  --bg-page:                    #ffffff;
  --bg-surface:                 var(--color-warm-50);
  --fg-primary:                 var(--color-notion-black);
  --fg-secondary:               var(--color-warm-500);
  --fg-muted:                   var(--color-warm-300);
  --brand-primary:              var(--color-notion-blue);
  --brand-primary-hover:        var(--color-notion-blue-hover);
  --brand-primary-bg:           var(--color-notion-blue-bg);
  --brand-primary-text:         var(--color-notion-blue-text);
  --border-default:             var(--color-whisper);
  --border-soft:                var(--color-whisper-soft);
  --border-focus:               var(--color-notion-blue-text);

  /* Status role tokens (StatusChip에서 참조) */
  --status-done-bg:     var(--color-green-50);
  --status-done-fg:     var(--color-green);
  --status-success-bg:  var(--color-teal-50);
  --status-success-fg:  var(--color-teal);
  --status-active-bg:   var(--color-notion-blue-bg);
  --status-active-fg:   var(--color-notion-blue-text);
  --status-warn-bg:     var(--color-orange-50);
  --status-warn-fg:     var(--color-orange);
  --status-danger-bg:   var(--color-red-50);
  --status-danger-fg:   var(--color-red-500);
  --status-neutral-bg:  var(--color-warm-50);
  --status-neutral-fg:  var(--color-warm-700);
  --status-decorative-pink-bg:   var(--color-pink-50);
  --status-decorative-pink-fg:   var(--color-pink);
  --status-decorative-purple-bg: var(--color-purple-50);
  --status-decorative-purple-fg: var(--color-purple);
  --status-decorative-brown-bg:  var(--color-brown-50);
  --status-decorative-brown-fg:  var(--color-brown);

  /* Shadow tokens (§5.2) */
  --shadow-soft:  rgba(0,0,0,0.04) 0 4px 18px,
                  rgba(0,0,0,0.027) 0 2.025px 7.84688px,
                  rgba(0,0,0,0.02) 0 0.8px 2.925px,
                  rgba(0,0,0,0.01) 0 0.175px 1.04062px;
  --shadow-deep:  rgba(0,0,0,0.01) 0 1px 3px,
                  rgba(0,0,0,0.02) 0 3px 7px,
                  rgba(0,0,0,0.02) 0 7px 15px,
                  rgba(0,0,0,0.04) 0 14px 28px,
                  rgba(0,0,0,0.05) 0 23px 52px;
  --shadow-flat:  0 1px 2px rgba(15,23,42,0.03);
```

- [ ] **Step 3: 빌드 검증**

Run: `pnpm -C apps/web type-check && pnpm -C apps/web type-check`
Expected: PASS.

Run: `pnpm -C apps/web build 2>&1 | tail -20`
Expected: 빌드 성공.

- [ ] **Step 4: 시각 스모크 테스트**

Run: `pnpm -C apps/web dev`
Open: `http://localhost:3000/ko/login`
Expected: **배경이 흰색**으로 바뀌고, 버튼이 약간 다른 블루 톤. 레이아웃 파손 없음. 구 `surface-*`/`isu-*` 클래스를 쓴 요소는 자신만의 색을 유지 (alias bridge는 T3에서 설치).

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/globals.css
git commit -m "feat(design): rewire shadcn semantic tokens to Notion palette

Phase 1 T2. 페이지 배경 pure white, primary=Notion Blue, accent는
lime-50 대신 Notion Blue tint로. --bg-*/--fg-*/--brand-*/--border-*/
--status-*/--shadow-* role tokens 신설."
```

---

### Task 3: Alias bridge — 기존 `isu-*`/`surface-*`/`lime-*` 유틸을 신 팔레트로 리다이렉트

**목적:** Phase 2가 모든 화면을 새 토큰으로 마이그레이션하기 전까지 기존 `bg-isu-*`, `text-surface-*`, `bg-lime-*` 클래스를 쓰는 화면이 계속 정상으로 보이게 한다. **임시** 레이어.

**Files:**
- Modify: `apps/web/app/globals.css:~22-57` — ISU + Lime + Surface 스케일을 alias로 교체

- [ ] **Step 1: 기존 ISU/Lime/Surface 토큰의 oklch 값 교체**

`apps/web/app/globals.css`에서 ISU/Lime/Surface 스케일을 다음으로 **in-place 교체** (토큰 이름은 유지, 값만 신 팔레트로 연결):

```css
  /* ── Alias bridge: ISU Blue → Notion Blue scale (Phase 2에서 제거) ── */
  --color-isu-50:  #f2f9ff;  /* → notion-blue-bg */
  --color-isu-100: #e0eeff;
  --color-isu-200: #c9dfff;
  --color-isu-300: #99c2ff;
  --color-isu-400: #4a97e3;
  --color-isu-500: #1a87e5;
  --color-isu-600: #0075de;  /* = notion-blue (primary) */
  --color-isu-700: #005bab;  /* = notion-blue-hover */
  --color-isu-800: #004a89;
  --color-isu-900: #003970;
  --color-isu-950: #002855;

  /* ── Alias bridge: Lime → neutral (Lime UI 사용은 금지, graph-only) ── */
  /* 기존 lime-* 유틸을 쓰는 화면이 UI에 색을 노출 못하게 neutral로 매핑.
   * 그래프 시각화는 bg-[--graph-node-*] 유틸을 사용. */
  --color-lime-50:  var(--color-warm-50);
  --color-lime-100: var(--color-warm-100);
  --color-lime-200: var(--color-warm-200);
  --color-lime-300: var(--color-warm-200);
  --color-lime-400: var(--color-warm-300);
  --color-lime-500: var(--color-warm-500);
  --color-lime-600: var(--color-warm-700);
  --color-lime-700: var(--color-warm-900);

  /* ── Alias bridge: Surface → warm neutrals (Phase 2에서 제거) ── */
  --color-surface-50:  #ffffff;              /* 페이지 배경 → pure white */
  --color-surface-100: var(--color-warm-50); /* 섹션 → warm-50 */
  --color-surface-200: var(--color-whisper); /* 보더 → whisper */
  --color-surface-300: rgba(0,0,0,0.16);
  --color-surface-400: var(--color-warm-300);
  --color-surface-500: var(--color-warm-500);
  --color-surface-600: var(--color-warm-700);
  --color-surface-700: var(--color-warm-900);
  --color-surface-800: #242322;
  --color-surface-900: var(--color-notion-black);
  --color-surface-950: rgba(0,0,0,0.98);
```

- [ ] **Step 2: 기존 semantic status(success/warning/danger/info) 토큰 교체 (동일 파일)**

ISU/Lime/Surface 블록 아래의 semantic status 블록도 신 팔레트로 교체:

```css
  /* ── Semantic Status (Notion-aligned) ──────────────────────── */
  --color-success:        var(--color-teal);
  --color-success-subtle: var(--color-teal-50);
  --color-success-strong: #1f7a77;
  --color-warning:        var(--color-orange);
  --color-warning-subtle: var(--color-orange-50);
  --color-warning-strong: #b04800;
  --color-danger:         var(--color-red-500);
  --color-danger-subtle:  var(--color-red-50);
  --color-info:           var(--color-notion-blue);
  --color-info-subtle:    var(--color-notion-blue-bg);
```

- [ ] **Step 3: 빌드 + 시각 회귀 체크**

Run: `pnpm -C apps/web type-check && pnpm -C apps/web type-check`
Expected: PASS.

Run: `pnpm -C apps/web dev`
Open: `http://localhost:3000/ko/dashboard` (또는 `bg-isu-*`, `text-surface-*`를 많이 쓰는 화면)
Expected: 화면이 "신 팔레트로 보이지만" 여전히 정상 기능. 보라색 기운(ISU hue 260)이 사라지고 Notion Blue 느낌으로 이동. Lime 악센트 영역은 회색 tone으로 바뀜 (의도).

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/globals.css
git commit -m "feat(design): alias-bridge isu-/surface-/lime- tokens to Notion palette

Phase 1 T3. Phase 2가 화면별로 새 클래스로 마이그레이션 완료할
때까지 기존 유틸 클래스(bg-isu-600, text-surface-500, bg-lime-*
등)가 신 팔레트 값으로 resolve되게 임시 매핑. Lime은 UI에서
노출 안 되도록 warm neutral로 무력화. graph-* namespace는 독립
유지.

Phase 2 최종 PR에서 이 alias 블록 전체 제거 예정."
```

---

### Task 4: Dark mode 토큰 블록 추가

**목적:** `:root[data-theme="dark"]` 선택자로 다크 모드 오버라이드 설치. 기본값은 light. 다크 모드 진입은 Phase 2에서 토글 UI 추가.

**Files:**
- Modify: `apps/web/app/globals.css` — 파일 말미에 `:root[data-theme="dark"]` 블록 추가 (`@theme` 바깥, `@media (prefers-color-scheme: dark)`도 함께)

- [ ] **Step 1: globals.css 말미로 이동, 기존 dark 블록 확인**

Run: `grep -n "data-theme\|prefers-color-scheme" apps/web/app/globals.css`
Expected: 기존 dark mode 블록이 있으면 그 위치 파악. 없으면 파일 말미에 신규 추가.

- [ ] **Step 2: 기존 dark 블록 제거 후 다음 블록 추가 (파일 말미)**

```css
/* ══════════════════════════════════════════════════════════════════
 * Dark mode (Phase 1 T4)
 * ══════════════════════════════════════════════════════════════════ */

:root[data-theme="dark"] {
  --color-background:           #191918;
  --color-foreground:           rgba(255,255,255,0.95);
  --color-card:                 #191918;
  --color-card-foreground:      rgba(255,255,255,0.95);
  --color-popover:              #242322;
  --color-popover-foreground:   rgba(255,255,255,0.95);
  --color-primary:              #529cca;
  --color-primary-foreground:   #ffffff;
  --color-secondary:            #242322;
  --color-secondary-foreground: rgba(255,255,255,0.95);
  --color-muted:                #242322;
  --color-muted-foreground:     #a8a4a0;
  --color-accent:               rgba(82,156,202,0.12);
  --color-accent-foreground:    #74b3d8;
  --color-destructive:          #ff6b6b;
  --color-destructive-foreground: #ffffff;
  --color-border:               rgba(255,255,255,0.094);
  --color-input:                rgba(255,255,255,0.094);
  --color-ring:                 #74b3d8;

  --bg-page:                    #191918;
  --bg-surface:                 #242322;
  --fg-primary:                 rgba(255,255,255,0.95);
  --fg-secondary:               #a8a4a0;
  --fg-muted:                   #7c7874;
  --brand-primary:              #529cca;
  --brand-primary-hover:        #74b3d8;
  --brand-primary-bg:           rgba(82,156,202,0.12);
  --brand-primary-text:         #74b3d8;
  --border-default:             rgba(255,255,255,0.094);
  --border-soft:                rgba(255,255,255,0.06);
  --border-focus:               #74b3d8;

  --status-done-bg:              rgba(26,174,57,0.15);
  --status-done-fg:              #4ccf64;
  --status-success-bg:           rgba(42,157,153,0.15);
  --status-success-fg:           #5cc5c1;
  --status-active-bg:            rgba(82,156,202,0.15);
  --status-active-fg:            #74b3d8;
  --status-warn-bg:              rgba(221,91,0,0.18);
  --status-warn-fg:              #ff8844;
  --status-danger-bg:            rgba(220,38,38,0.18);
  --status-danger-fg:            #ff6b6b;
  --status-neutral-bg:           rgba(255,255,255,0.06);
  --status-neutral-fg:           #a8a4a0;
  --status-decorative-pink-bg:   rgba(255,100,200,0.15);
  --status-decorative-pink-fg:   #ff85d3;
  --status-decorative-purple-bg: rgba(124,92,169,0.20);
  --status-decorative-purple-fg: #b598d5;
  --status-decorative-brown-bg:  rgba(176,128,84,0.18);
  --status-decorative-brown-fg:  #c9a583;

  --shadow-soft: rgba(0,0,0,0.30) 0 4px 18px,
                 rgba(0,0,0,0.20) 0 1px 4px;
  --shadow-deep: rgba(0,0,0,0.40) 0 14px 28px,
                 rgba(0,0,0,0.30) 0 4px 10px;
  --shadow-flat: 0 1px 2px rgba(0,0,0,0.4);

  /* Bridge in dark mode — 기존 isu-*/surface-*/lime-*를 다크 팔레트로 */
  --color-isu-50:      rgba(82,156,202,0.15);
  --color-isu-100:     rgba(82,156,202,0.22);
  --color-isu-500:     #529cca;
  --color-isu-600:     #74b3d8;
  --color-isu-700:     #99c9e5;
  --color-surface-50:  #191918;
  --color-surface-100: #242322;
  --color-surface-200: rgba(255,255,255,0.094);
  --color-surface-500: #a8a4a0;
  --color-surface-700: #c9c5c0;
  --color-surface-900: rgba(255,255,255,0.95);
  --color-lime-50:     #242322;
  --color-lime-100:    #2d2c2a;
  --color-lime-600:    #a8a4a0;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
  }
}
```

- [ ] **Step 3: 다크모드 수동 토글 테스트**

Run: `pnpm -C apps/web dev`
Open: `http://localhost:3000/ko/login`
Browser Devtools Console:
```js
document.documentElement.dataset.theme = 'dark'
```
Expected: 배경이 `#191918` warm-near-black으로, 텍스트가 near-white로, 버튼이 lighter blue `#529cca`로 전환. 토글 해제는 `delete document.documentElement.dataset.theme`.

- [ ] **Step 4: Type-check + build**

Run: `pnpm -C apps/web type-check && pnpm -C apps/web type-check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/globals.css
git commit -m "feat(design): add dark mode token block + bridge

Phase 1 T4. :root[data-theme='dark'] 오버라이드로 Notion warm-dark
팔레트(#191918 page / #242322 surface / lighter blue #529cca) 설치.
alias bridge도 다크용 값으로 미러. UI 다크모드 토글은 Phase 2에서
추가."
```

---

## Part B — Pattern Helpers (TDD)

### Task 5: `StatusChip` 컴포넌트 (TDD)

**목적:** 상태 키(`done`, `progress`, `review`, `hold`, `danger`, ...)를 받아 통일된 칩으로 렌더. T3 (dense) 기본 + T1/T2 옵션 사이즈. spec §9.4의 매핑을 단일 소스로.

**Files:**
- Create: `apps/web/components/patterns/StatusChip.tsx`
- Create: `apps/web/components/patterns/StatusChip.test.tsx`

- [ ] **Step 1: 테스트 파일 작성 (실패할 것)**

`apps/web/components/patterns/StatusChip.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { StatusChip, STATUS_LABELS } from "./StatusChip";

describe("StatusChip", () => {
  it("renders done with green palette tokens", () => {
    const html = renderToStaticMarkup(<StatusChip status="done" />);
    expect(html).toContain("bg-[--status-done-bg]");
    expect(html).toContain("text-[--status-done-fg]");
    expect(html).toContain(STATUS_LABELS.done);
  });

  it("renders danger with red palette tokens and border", () => {
    const html = renderToStaticMarkup(<StatusChip status="danger" />);
    expect(html).toContain("bg-[--status-danger-bg]");
    expect(html).toContain("text-[--status-danger-fg]");
    expect(html).toContain("border-[--color-red-200]");
  });

  it("treats unknown status as neutral", () => {
    // @ts-expect-error intentionally wrong
    const html = renderToStaticMarkup(<StatusChip status="mystery" />);
    expect(html).toContain("bg-[--status-neutral-bg]");
  });

  it("respects size='lg' (T1) padding", () => {
    const html = renderToStaticMarkup(<StatusChip status="active" size="lg" />);
    expect(html).toContain("px-2.5");
    expect(html).toContain("text-[12px]");
  });

  it("defaults to T3 sm with 10.5px text", () => {
    const html = renderToStaticMarkup(<StatusChip status="active" />);
    expect(html).toContain("text-[10.5px]");
  });

  it("renders custom label prop over default", () => {
    const html = renderToStaticMarkup(<StatusChip status="done" label="완료됨" />);
    expect(html).toContain("완료됨");
    expect(html).not.toContain(STATUS_LABELS.done);
  });

  it("shows status dot by default", () => {
    const html = renderToStaticMarkup(<StatusChip status="progress" />);
    expect(html).toContain("rounded-full"); // dot + chip both full; chip has "rounded-full"
    expect(html.match(/rounded-full/g)?.length).toBeGreaterThanOrEqual(2); // dot + chip
  });

  it("hides status dot when dot={false}", () => {
    const html = renderToStaticMarkup(<StatusChip status="progress" dot={false} />);
    expect(html.match(/rounded-full/g)?.length).toBe(1); // only chip
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `pnpm -C apps/web vitest run components/patterns/StatusChip.test.tsx`
Expected: FAIL with "Cannot find module './StatusChip'".

- [ ] **Step 3: `StatusChip.tsx` 구현**

`apps/web/components/patterns/StatusChip.tsx`:

```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

export type StatusKey =
  | "neutral"
  | "todo"
  | "active"
  | "progress"
  | "review"
  | "done"
  | "success"
  | "warning"
  | "hold"
  | "danger"
  | "urgent"
  | "blocked"
  | "decorative-pink"
  | "decorative-purple"
  | "decorative-brown";

type StyleMap = { chip: string; dot: string };

const STATUS_STYLES: Record<StatusKey, StyleMap> = {
  neutral:              { chip: "bg-[--status-neutral-bg] text-[--status-neutral-fg]",                 dot: "bg-[--fg-muted]" },
  todo:                 { chip: "bg-[--status-neutral-bg] text-[--status-neutral-fg]",                 dot: "bg-[--fg-muted]" },
  active:               { chip: "bg-[--status-active-bg] text-[--status-active-fg]",                   dot: "bg-[--brand-primary]" },
  progress:             { chip: "bg-[--status-success-bg] text-[--status-success-fg]",                 dot: "bg-[--color-teal]" },
  review:               { chip: "bg-[--status-active-bg] text-[--status-active-fg]",                   dot: "bg-[--brand-primary]" },
  done:                 { chip: "bg-[--status-done-bg] text-[--status-done-fg]",                       dot: "bg-[--color-green]" },
  success:              { chip: "bg-[--status-success-bg] text-[--status-success-fg]",                 dot: "bg-[--color-teal]" },
  warning:              { chip: "bg-[--status-warn-bg] text-[--status-warn-fg]",                       dot: "bg-[--color-orange]" },
  hold:                 { chip: "bg-[--status-warn-bg] text-[--status-warn-fg]",                       dot: "bg-[--color-orange]" },
  danger:               { chip: "bg-[--status-danger-bg] text-[--status-danger-fg] border border-[--color-red-200]", dot: "bg-[--color-red-500]" },
  urgent:               { chip: "bg-[--status-danger-bg] text-[--status-danger-fg] border border-[--color-red-200]", dot: "bg-[--color-red-500]" },
  blocked:              { chip: "bg-[--status-danger-bg] text-[--status-danger-fg] border border-[--color-red-200]", dot: "bg-[--color-red-500]" },
  "decorative-pink":    { chip: "bg-[--status-decorative-pink-bg] text-[--status-decorative-pink-fg]",     dot: "bg-[--color-pink]" },
  "decorative-purple":  { chip: "bg-[--status-decorative-purple-bg] text-[--status-decorative-purple-fg]", dot: "bg-[--color-purple]" },
  "decorative-brown":   { chip: "bg-[--status-decorative-brown-bg] text-[--status-decorative-brown-fg]",   dot: "bg-[--color-brown]" },
};

export const STATUS_LABELS: Record<StatusKey, string> = {
  neutral: "대기",
  todo: "할 일",
  active: "진행 중",
  progress: "진행 중",
  review: "리뷰",
  done: "완료",
  success: "성공",
  warning: "주의",
  hold: "보류",
  danger: "위험",
  urgent: "긴급",
  blocked: "차단",
  "decorative-pink": "고객",
  "decorative-purple": "관리",
  "decorative-brown": "아카이브",
};

export type StatusChipSize = "sm" | "md" | "lg";

const SIZE_CLASS: Record<StatusChipSize, string> = {
  sm: "text-[10.5px] px-2 py-0.5 gap-1",    // T3 기본
  md: "text-[11px] px-2 py-0.5 gap-1",       // T2
  lg: "text-[12px] px-2.5 py-0.5 gap-1.5 tracking-[0.125px]", // T1
};

export interface StatusChipProps {
  status: StatusKey;
  label?: string;
  size?: StatusChipSize;
  dot?: boolean;
  className?: string;
}

export function StatusChip({ status, label, size = "sm", dot = true, className }: StatusChipProps) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.neutral;
  const text = label ?? STATUS_LABELS[status] ?? String(status);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-semibold",
        SIZE_CLASS[size],
        style.chip,
        className,
      )}
    >
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", style.dot)} aria-hidden />}
      {text}
    </span>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm -C apps/web vitest run components/patterns/StatusChip.test.tsx`
Expected: 7/7 PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/patterns/StatusChip.tsx apps/web/components/patterns/StatusChip.test.tsx
git commit -m "feat(patterns): add StatusChip with Notion-aligned status palette

Phase 1 T5. 15개 status key를 Notion palette + Danger red로 매핑.
T1(lg)/T2(md)/T3(sm) 사이즈, 한글 기본 라벨, optional dot.
spec §9.4 mapping을 단일 SSoT로."
```

---

### Task 6: `PriorityChip` 컴포넌트 (TDD)

**목적:** P1/P2/P3 우선순위 전용 칩. StatusChip과 시각적으로 구분되게 **uppercase tracking-wide**, dot 없음.

**Files:**
- Create: `apps/web/components/patterns/PriorityChip.tsx`
- Create: `apps/web/components/patterns/PriorityChip.test.tsx`

- [ ] **Step 1: 테스트 파일 작성**

`apps/web/components/patterns/PriorityChip.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { PriorityChip } from "./PriorityChip";

describe("PriorityChip", () => {
  it("P1 renders with red palette and border", () => {
    const html = renderToStaticMarkup(<PriorityChip priority="P1" />);
    expect(html).toContain("bg-[--color-red-50]");
    expect(html).toContain("text-[--color-red-500]");
    expect(html).toContain("border-[--color-red-200]");
    expect(html).toContain(">P1<");
  });

  it("P2 renders with orange palette", () => {
    const html = renderToStaticMarkup(<PriorityChip priority="P2" />);
    expect(html).toContain("bg-[--color-orange-50]");
    expect(html).toContain("text-[--color-orange]");
  });

  it("P3 renders with neutral palette", () => {
    const html = renderToStaticMarkup(<PriorityChip priority="P3" />);
    expect(html).toContain("bg-[--bg-surface]");
    expect(html).toContain("text-[--fg-secondary]");
  });

  it("uses uppercase tracking-wide typography (not StatusChip shape)", () => {
    const html = renderToStaticMarkup(<PriorityChip priority="P1" />);
    expect(html).toContain("uppercase");
    expect(html).toContain("tracking-[0.08em]");
  });

  it("does not render a dot (priority is static, not stateful)", () => {
    const html = renderToStaticMarkup(<PriorityChip priority="P1" />);
    // chip has rounded-full; there should be NO second rounded-full (no dot).
    expect(html.match(/rounded-full/g)?.length).toBe(1);
  });
});
```

- [ ] **Step 2: 실행 → 실패 확인**

Run: `pnpm -C apps/web vitest run components/patterns/PriorityChip.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: `PriorityChip.tsx` 구현**

```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

export type PriorityKey = "P1" | "P2" | "P3";

const PRIORITY_STYLE: Record<PriorityKey, string> = {
  P1: "bg-[--color-red-50] text-[--color-red-500] border border-[--color-red-200]",
  P2: "bg-[--color-orange-50] text-[--color-orange]",
  P3: "bg-[--bg-surface] text-[--fg-secondary]",
};

export interface PriorityChipProps {
  priority: PriorityKey;
  className?: string;
}

export function PriorityChip({ priority, className }: PriorityChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-bold",
        "text-[9.5px] px-1.5 py-0.5 uppercase tracking-[0.08em]",
        PRIORITY_STYLE[priority],
        className,
      )}
    >
      {priority}
    </span>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm -C apps/web vitest run components/patterns/PriorityChip.test.tsx`
Expected: 5/5 PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/patterns/PriorityChip.tsx apps/web/components/patterns/PriorityChip.test.tsx
git commit -m "feat(patterns): add PriorityChip (P1/P2/P3)

Phase 1 T6. Red/Orange/Neutral 팔레트, uppercase tracking-wide,
no dot (static 속성). StatusChip과 시각적으로 구분."
```

---

### Task 7: `Field` 컴포넌트 (TDD)

**목적:** 폼 필드 label + input slot + error slot + col-span 제어 통일 래퍼. spec §9.5의 폼 카드 내부에서 쓰임.

**Files:**
- Create: `apps/web/components/patterns/Field.tsx`
- Create: `apps/web/components/patterns/Field.test.tsx`

- [ ] **Step 1: 테스트**

`apps/web/components/patterns/Field.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { Field } from "./Field";

describe("Field", () => {
  it("renders label with uppercase tracking typography", () => {
    const html = renderToStaticMarkup(
      <Field label="Title">
        <input />
      </Field>
    );
    expect(html).toContain("uppercase");
    expect(html).toContain("tracking-[0.12em]");
    expect(html).toContain("text-[10px]");
    expect(html).toContain(">Title<");
  });

  it("wraps in <label> for click-to-focus", () => {
    const html = renderToStaticMarkup(
      <Field label="Email">
        <input />
      </Field>
    );
    expect(html).toMatch(/^<label/);
  });

  it("applies md:col-span-2 when span=2", () => {
    const html = renderToStaticMarkup(
      <Field label="Description" span={2}>
        <textarea />
      </Field>
    );
    expect(html).toContain("md:col-span-2");
  });

  it("renders error slot when error prop is set", () => {
    const html = renderToStaticMarkup(
      <Field label="Email" error="이메일 형식이 올바르지 않습니다">
        <input />
      </Field>
    );
    expect(html).toContain("이메일 형식이 올바르지 않습니다");
    expect(html).toContain("text-[--color-red-500]");
  });

  it("does not render error slot when error is undefined", () => {
    const html = renderToStaticMarkup(
      <Field label="Email">
        <input />
      </Field>
    );
    expect(html).not.toContain("text-[--color-red-500]");
  });

  it("label gets --fg-secondary color", () => {
    const html = renderToStaticMarkup(
      <Field label="Title">
        <input />
      </Field>
    );
    expect(html).toContain("text-[--fg-secondary]");
  });
});
```

- [ ] **Step 2: 실행 → 실패 확인**

Run: `pnpm -C apps/web vitest run components/patterns/Field.test.tsx`
Expected: FAIL.

- [ ] **Step 3: 구현**

```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

export interface FieldProps {
  label: string;
  span?: 1 | 2;
  error?: string;
  className?: string;
  children: React.ReactNode;
}

export function Field({ label, span = 1, error, className, children }: FieldProps) {
  return (
    <label className={cn("flex flex-col gap-1.5 min-w-0", span === 2 && "md:col-span-2", className)}>
      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[--fg-secondary]">
        {label}
      </span>
      {children}
      {error && (
        <span className="text-[11px] font-medium text-[--color-red-500]">{error}</span>
      )}
    </label>
  );
}
```

- [ ] **Step 4: 테스트 통과**

Run: `pnpm -C apps/web vitest run components/patterns/Field.test.tsx`
Expected: 6/6 PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/patterns/Field.tsx apps/web/components/patterns/Field.test.tsx
git commit -m "feat(patterns): add Field wrapper (label + slot + error)

Phase 1 T7. 10px uppercase tracking-wide 라벨, optional col-span=2,
conditional error 슬롯. 폼 카드 4-part 패턴에서 재사용."
```

---

### Task 8: `NativeSelect` 컴포넌트 (TDD)

**목적:** 엔터프라이즈 밀도(T3) 전용 네이티브 `<select>` 래퍼. shadcn `<Select>` (Popover 기반)는 유지하되, T3 폼에서는 이걸 사용.

**Files:**
- Create: `apps/web/components/patterns/NativeSelect.tsx`
- Create: `apps/web/components/patterns/NativeSelect.test.tsx`

- [ ] **Step 1: 테스트**

`apps/web/components/patterns/NativeSelect.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { NativeSelect } from "./NativeSelect";

describe("NativeSelect", () => {
  const opts = [
    { value: "todo", label: "할 일" },
    { value: "done", label: "완료" },
  ];

  it("renders <select> with provided options", () => {
    const html = renderToStaticMarkup(
      <NativeSelect value="todo" onChange={() => {}} options={opts} />
    );
    expect(html).toContain("<select");
    expect(html).toContain(">할 일<");
    expect(html).toContain(">완료<");
  });

  it("applies 32px height in default (T3) size", () => {
    const html = renderToStaticMarkup(
      <NativeSelect value="todo" onChange={() => {}} options={opts} />
    );
    expect(html).toContain("h-8");
    expect(html).toContain("text-[13px]");
  });

  it("applies compact 28px height when compact prop is true", () => {
    const html = renderToStaticMarkup(
      <NativeSelect value="todo" onChange={() => {}} options={opts} compact />
    );
    expect(html).toContain("h-7");
    expect(html).toContain("text-[12px]");
  });

  it("uses --bg-page background and --border-default border", () => {
    const html = renderToStaticMarkup(
      <NativeSelect value="todo" onChange={() => {}} options={opts} />
    );
    expect(html).toContain("bg-[--bg-page]");
    expect(html).toContain("border-[--border-default]");
  });

  it("shows disabled state styling", () => {
    const html = renderToStaticMarkup(
      <NativeSelect value="todo" onChange={() => {}} options={opts} disabled />
    );
    expect(html).toContain("disabled");
    expect(html).toContain("opacity-60");
  });
});
```

- [ ] **Step 2: 실행 → 실패 확인**

Run: `pnpm -C apps/web vitest run components/patterns/NativeSelect.test.tsx`
Expected: FAIL.

- [ ] **Step 3: 구현**

```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

export interface NativeSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface NativeSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<NativeSelectOption>;
  compact?: boolean;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}

export function NativeSelect({
  value,
  onChange,
  options,
  compact = false,
  disabled = false,
  className,
  ariaLabel,
}: NativeSelectProps) {
  return (
    <div className={cn("relative", disabled && "opacity-60 pointer-events-none", className)}>
      <select
        aria-label={ariaLabel}
        className={cn(
          "flex w-full appearance-none rounded-md border border-[--border-default]",
          "bg-[--bg-page] pr-8 pl-3 text-[--fg-primary]",
          "shadow-[0_1px_2px_rgba(15,23,42,0.02)] tabular-nums",
          "focus:border-[--brand-primary] focus:outline-none focus:ring-2 focus:ring-[--brand-primary-bg]",
          compact ? "h-7 text-[12px] min-w-[120px]" : "h-8 text-[13px]",
        )}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} disabled={opt.disabled}>
            {opt.label}
          </option>
        ))}
      </select>
      <svg
        className="pointer-events-none absolute right-3 top-1/2 h-3 w-3 -translate-y-1/2 text-[--fg-muted]"
        viewBox="0 0 12 12"
        fill="none"
        aria-hidden
      >
        <path d="M3 5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
```

- [ ] **Step 4: 테스트 통과**

Run: `pnpm -C apps/web vitest run components/patterns/NativeSelect.test.tsx`
Expected: 5/5 PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/patterns/NativeSelect.tsx apps/web/components/patterns/NativeSelect.test.tsx
git commit -m "feat(patterns): add NativeSelect (T3 compact wrapper)

Phase 1 T8. 네이티브 <select> + chevron icon overlay. h-8/h-7
two-size, aria-label, disabled 스타일. shadcn Select와 병존
(이름 충돌 회피)."
```

---

## Part C — Primitive Retune

**공통 주의:**
- Token Migration Reference (섹션 0) 표대로 class name 기계적 치환
- `cva()` variant 테이블이 있으면 각 variant의 배경/텍스트/보더 토큰 전부 교체
- 5개 프리뷰 HTML을 reference로 대조 (`docs/superpowers/specs/previews/`)
- 각 태스크마다 커밋 후 `pnpm -C apps/web type-check && pnpm -C apps/web type-check`

### Task 9: `button.tsx` 리튠

**목적:** spec §9.1의 variant 표를 실제 `cva()`에 반영. `accent` variant 제거 (Lime). `danger` variant 추가.

**Files:**
- Modify: `apps/web/components/ui/button.tsx`

- [ ] **Step 1: 현재 파일 읽기**

Run: `cat apps/web/components/ui/button.tsx`
Expected: `cva`로 variant: default / secondary / ghost / outline / link / accent 등 정의.

- [ ] **Step 2: variant 테이블 교체**

`button.tsx`에서 `buttonVariants = cva(...)` 의 variants.variant 객체를 다음으로 교체:

```ts
variant: {
  default:   "bg-[--brand-primary] text-white shadow-[var(--shadow-flat)] hover:bg-[--brand-primary-hover] focus-visible:ring-2 focus-visible:ring-[--border-focus] focus-visible:ring-offset-2",
  secondary: "bg-[--bg-surface] text-[--fg-primary] border border-[--border-default] hover:bg-white hover:border-[rgba(0,0,0,0.16)]",
  ghost:     "bg-transparent text-[--fg-primary] hover:bg-[--bg-surface]",
  outline:   "bg-[--bg-page] border border-[--border-default] text-[--fg-primary] hover:bg-[--bg-surface]",
  danger:    "bg-transparent text-[--color-red-500] hover:bg-[--color-red-50]",
  link:      "text-[--brand-primary-text] underline-offset-2 hover:underline bg-transparent",
},
```

그리고 `size` 블록은 다음으로:

```ts
size: {
  default: "h-9 px-4 py-2 text-[14px]",
  sm:      "h-8 px-3 text-[12.5px]",
  lg:      "h-10 px-5 text-[15px]",
  icon:    "h-8 w-8",
},
```

`accent` variant를 쓰던 호출부가 Phase 2에서 나타날 수 있음 — 지금은 `accent: variant.default`처럼 **deprecated alias**로 추가:

```ts
// DEPRECATED: Phase 2에서 전 호출부 제거 예정
accent: "bg-[--brand-primary] text-white shadow-[var(--shadow-flat)] hover:bg-[--brand-primary-hover]",
```

- [ ] **Step 3: Type-check**

Run: `pnpm -C apps/web type-check && pnpm -C apps/web type-check`
Expected: PASS.

- [ ] **Step 4: 시각 확인**

Run: `pnpm -C apps/web dev`
Open: `http://localhost:3000/ko/dashboard` (아무 버튼 있는 페이지)
Expected: Primary 버튼이 Notion Blue `#0075de`, Secondary는 warm-50 배경, Danger는 투명+red-50 호버.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/ui/button.tsx
git commit -m "feat(ui): retune button to Notion-aligned variants

Phase 1 T9. default/secondary/ghost/outline/danger/link variants
+ sizes sm/default/lg/icon. accent variant는 deprecated alias로
유지 (Phase 2에서 호출부 전부 제거 후 삭제)."
```

---

### Task 10: `input.tsx` + `textarea.tsx` + `label.tsx` 리튠

**목적:** 폼 인풋 공통 스타일 토큰 치환. spec §9.2 기준. 기본 h-8 (T3) / focus ring = Notion Blue tint.

**Files:**
- Modify: `apps/web/components/ui/input.tsx`
- Modify: `apps/web/components/ui/textarea.tsx`
- Modify: `apps/web/components/ui/label.tsx`

- [ ] **Step 1: `input.tsx` className 교체**

`Input`의 `className` 기본값을 다음으로:

```tsx
"flex h-8 w-full rounded-md border border-[--border-default] bg-[--bg-page] px-3 py-1.5 text-[13px] text-[--fg-primary] " +
"shadow-[0_1px_2px_rgba(15,23,42,0.02)] transition-colors tabular-nums " +
"placeholder:text-[--fg-muted] " +
"focus:border-[--brand-primary] focus:outline-none focus:ring-2 focus:ring-[--brand-primary-bg] " +
"disabled:opacity-60 disabled:cursor-not-allowed " +
"file:border-0 file:bg-transparent file:text-[13px] file:font-medium"
```

- [ ] **Step 2: `textarea.tsx` className 교체**

```tsx
"flex min-h-[76px] w-full rounded-md border border-[--border-default] bg-[--bg-page] px-3 py-2 text-[13px] text-[--fg-primary] " +
"shadow-[0_1px_2px_rgba(15,23,42,0.02)] transition-colors leading-relaxed " +
"placeholder:text-[--fg-muted] " +
"focus:border-[--brand-primary] focus:outline-none focus:ring-2 focus:ring-[--brand-primary-bg] " +
"disabled:opacity-60 disabled:cursor-not-allowed resize-y"
```

- [ ] **Step 3: `label.tsx` className 교체**

shadcn Label 기본:

```tsx
"text-[12px] font-medium leading-none text-[--fg-primary] peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
```

- [ ] **Step 4: Type-check**

Run: `pnpm -C apps/web type-check && pnpm -C apps/web type-check`
Expected: PASS.

- [ ] **Step 5: 시각 확인 + Commit**

Run: `pnpm -C apps/web dev` → 아무 폼 페이지
Expected: 인풋 높이 32px, focus 시 Notion Blue 보더 + light blue ring.

```bash
git add apps/web/components/ui/input.tsx apps/web/components/ui/textarea.tsx apps/web/components/ui/label.tsx
git commit -m "feat(ui): retune input/textarea/label to Notion tokens

Phase 1 T10. h-8 기본, focus=Notion Blue border + blue-tint ring,
placeholder=--fg-muted, tabular-nums."
```

---

### Task 11: `select.tsx` (shadcn popover-based) 리튠

**목적:** shadcn `<Select>` (Radix Popover)의 trigger/content/item 스타일을 신 토큰으로. T3 폼에서는 `NativeSelect` 사용, 복잡한 UX는 이것 사용.

**Files:**
- Modify: `apps/web/components/ui/select.tsx`

- [ ] **Step 1: 기존 파일 읽기 → 각 subcomponent class 찾기**

`SelectTrigger`, `SelectContent`, `SelectItem`, `SelectScrollUpButton` 각각의 className을 신 토큰으로 교체.

- [ ] **Step 2: className 교체**

`SelectTrigger`:
```tsx
"flex h-9 w-full items-center justify-between rounded-md border border-[--border-default] bg-[--bg-page] px-3 py-2 text-[13px] text-[--fg-primary] " +
"shadow-[0_1px_2px_rgba(15,23,42,0.02)] " +
"placeholder:text-[--fg-muted] " +
"focus:border-[--brand-primary] focus:outline-none focus:ring-2 focus:ring-[--brand-primary-bg] " +
"disabled:cursor-not-allowed disabled:opacity-60 " +
"[&>span]:line-clamp-1"
```

`SelectContent`:
```tsx
"relative z-50 min-w-[8rem] overflow-hidden rounded-md border border-[--border-default] bg-[--bg-page] text-[--fg-primary] " +
"shadow-[var(--shadow-soft)] " +
"data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 " +
"data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2"
```

`SelectItem`:
```tsx
"relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-[13px] outline-none " +
"hover:bg-[--bg-surface] " +
"focus:bg-[--brand-primary-bg] focus:text-[--brand-primary-text] " +
"data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
```

- [ ] **Step 3: Type-check + 시각 확인**

Run: `pnpm -C apps/web type-check && pnpm -C apps/web type-check`
Open: shadcn Select 사용하는 페이지 (예: ProjectForm의 status select 필드면 상기 NativeSelect로 바꾼 이후에도 일부 popover UX 남을 수 있음)
Expected: open 시 부드러운 warm-white 드롭다운, hover 블루 tint.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/ui/select.tsx
git commit -m "feat(ui): retune select (shadcn/radix) to Notion tokens

Phase 1 T11. Trigger h-9, content shadow-soft multi-layer,
hover/focus blue tint."
```

---

### Task 12: `card.tsx` 리튠

**목적:** Card 기본이 T2/T3 공용 카드. spec §9.3.

**Files:**
- Modify: `apps/web/components/ui/card.tsx`

- [ ] **Step 1: `Card` className 교체**

```tsx
"rounded-lg border border-[--border-default] bg-[--bg-page] text-[--fg-primary] shadow-[var(--shadow-flat)]"
```

- [ ] **Step 2: `CardHeader`**

```tsx
"flex items-center gap-2 border-b border-[--border-default] bg-[--bg-surface] px-5 py-3"
```

- [ ] **Step 3: `CardTitle`**

```tsx
"text-[13px] font-semibold text-[--fg-primary] leading-tight"
```

- [ ] **Step 4: `CardDescription`**

```tsx
"text-[11px] text-[--fg-secondary] mt-0.5"
```

- [ ] **Step 5: `CardContent`**

```tsx
"p-5"
```

- [ ] **Step 6: `CardFooter`**

```tsx
"flex items-center gap-3 border-t border-[--border-soft] bg-[--bg-surface]/60 px-5 py-3"
```

- [ ] **Step 7: Type-check + Commit**

```bash
pnpm -C apps/web type-check && pnpm -C apps/web type-check
git add apps/web/components/ui/card.tsx
git commit -m "feat(ui): retune card to whisper border + warm-50 header/footer

Phase 1 T12. rounded-lg, shadow-flat 기본. CardHeader bg-[--bg-surface]
+ border-b whisper, CardFooter bg-[--bg-surface]/60 + border-t soft."
```

---

### Task 13: `table.tsx` + `scroll-area.tsx` 리튠

**목적:** 엔터프라이즈 T3 테이블. 헤더 11px uppercase tracking, 행 hover=`--brand-primary-bg`.

**Files:**
- Modify: `apps/web/components/ui/table.tsx`
- Modify: `apps/web/components/ui/scroll-area.tsx`

- [ ] **Step 1: `table.tsx` — 각 subcomponent className 교체**

- `Table`: `"w-full caption-bottom text-[13px]"`
- `TableHeader`: `"bg-[--bg-surface]"`
- `TableBody`: `"[&_tr:last-child]:border-0"`
- `TableFooter`: `"bg-[--bg-surface] font-medium border-t border-[--border-default]"`
- `TableRow`: `"group border-b border-[--border-soft] transition-colors hover:bg-[--brand-primary-bg] data-[state=selected]:bg-[--brand-primary-bg]"`
- `TableHead`: `"h-9 px-4 text-left align-middle text-[11px] font-semibold uppercase tracking-[0.1em] text-[--fg-secondary] [&:has([role=checkbox])]:pr-0"`
- `TableCell`: `"px-4 py-2.5 align-middle text-[--fg-primary] [&:has([role=checkbox])]:pr-0"`
- `TableCaption`: `"mt-4 text-[12px] text-[--fg-muted]"`

- [ ] **Step 2: `scroll-area.tsx` 스크롤바 색 치환**

`ScrollBar`의 thumb: `bg-[--border-default]` → hover `bg-[--color-warm-300]`.

- [ ] **Step 3: Type-check + Commit**

```bash
pnpm -C apps/web type-check && pnpm -C apps/web type-check
git add apps/web/components/ui/table.tsx apps/web/components/ui/scroll-area.tsx
git commit -m "feat(ui): retune table + scroll-area for T3 density

Phase 1 T13. TH uppercase tracking-wide 11px, TR hover brand-primary-bg
(Notion Blue tint), scrollbar whisper thumb."
```

---

### Task 14: `badge.tsx` + `alert.tsx` 리튠

**목적:** Badge는 StatusChip과 동일한 칩 시스템이되 cva variant 기반. Alert는 inline notification (error strip 패턴).

**Files:**
- Modify: `apps/web/components/ui/badge.tsx`
- Modify: `apps/web/components/ui/alert.tsx`

- [ ] **Step 1: `badge.tsx` variants 교체**

```ts
{
  default:     "bg-[--brand-primary] text-white",
  secondary:   "bg-[--bg-surface] text-[--fg-primary]",
  destructive: "bg-[--color-red-50] text-[--color-red-500] border border-[--color-red-200]",
  outline:     "bg-transparent text-[--fg-primary] border border-[--border-default]",
  success:     "bg-[--status-done-bg] text-[--status-done-fg]",
  warning:     "bg-[--status-warn-bg] text-[--status-warn-fg]",
  info:        "bg-[--status-active-bg] text-[--status-active-fg]",
}
```

base: `"inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-[0.125px]"`

- [ ] **Step 2: `alert.tsx` variants 교체**

```ts
{
  default:     "bg-[--bg-surface] border-[--border-default] text-[--fg-primary]",
  destructive: "bg-[--color-red-50] border-[--color-red-200] text-[--color-red-500]",
  warning:     "bg-[--status-warn-bg] border-[rgba(221,91,0,0.2)] text-[--status-warn-fg]",
  info:        "bg-[--status-active-bg] border-[rgba(0,117,222,0.15)] text-[--status-active-fg]",
  success:     "bg-[--status-done-bg] border-[rgba(26,174,57,0.2)] text-[--status-done-fg]",
}
```

`Alert` base: `"relative w-full rounded-lg border px-4 py-3 text-[13px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:h-4 [&>svg]:w-4 [&>svg~*]:pl-7"`

- [ ] **Step 3: Type-check + Commit**

```bash
pnpm -C apps/web type-check && pnpm -C apps/web type-check
git add apps/web/components/ui/badge.tsx apps/web/components/ui/alert.tsx
git commit -m "feat(ui): retune badge + alert with status palette

Phase 1 T14. Badge pill 11px tracking, Alert rounded-lg warm-50 기본,
destructive=red-50/red-500/red-200."
```

---

### Task 15: `dialog.tsx` + `sheet.tsx` 리튠

**목적:** 모달/시트. `rounded-xl` (12px) + `--shadow-deep` 5-layer.

**Files:**
- Modify: `apps/web/components/ui/dialog.tsx`
- Modify: `apps/web/components/ui/sheet.tsx`

- [ ] **Step 1: `dialog.tsx` — Content/Header/Footer**

`DialogOverlay`: `"fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px]"`
`DialogContent`: `"fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border border-[--border-default] bg-[--bg-page] p-6 shadow-[var(--shadow-deep)] rounded-xl"`
`DialogHeader`: `"flex flex-col gap-1"` (padding은 Content가 이미 p-6)
`DialogTitle`: `"text-[16px] font-semibold text-[--fg-primary] leading-tight"`
`DialogDescription`: `"text-[13px] text-[--fg-secondary]"`
`DialogFooter`: `"flex flex-row-reverse gap-2 pt-2"`

- [ ] **Step 2: `sheet.tsx` — Side variant className**

`SheetContent` side=right/left:
```ts
"fixed inset-y-0 right-0 h-full w-3/4 max-w-sm border-l border-[--border-default] bg-[--bg-page] p-6 shadow-[var(--shadow-deep)] sm:max-w-md"
```
side=top/bottom 마찬가지로 `border-[--border-default]` + `bg-[--bg-page]`.

- [ ] **Step 3: Type-check + Commit**

```bash
pnpm -C apps/web type-check && pnpm -C apps/web type-check
git add apps/web/components/ui/dialog.tsx apps/web/components/ui/sheet.tsx
git commit -m "feat(ui): retune dialog + sheet (rounded-xl, shadow-deep)

Phase 1 T15. Modals get rounded-xl + 5-layer shadow-deep for
modal-level elevation."
```

---

### Task 16: `popover.tsx` + `dropdown-menu.tsx` + `tooltip.tsx` 리튠

**목적:** 플로팅 UI 통일. shadow-soft + 얇은 whisper 보더.

**Files:**
- Modify: `apps/web/components/ui/popover.tsx`
- Modify: `apps/web/components/ui/dropdown-menu.tsx`
- Modify: `apps/web/components/ui/tooltip.tsx`

- [ ] **Step 1: `popover.tsx` Content**

```tsx
"z-50 w-72 rounded-lg border border-[--border-default] bg-[--bg-page] p-4 text-[--fg-primary] shadow-[var(--shadow-soft)] outline-none"
```

- [ ] **Step 2: `dropdown-menu.tsx`**

`DropdownMenuContent`: `"z-50 min-w-[8rem] overflow-hidden rounded-md border border-[--border-default] bg-[--bg-page] p-1 text-[--fg-primary] shadow-[var(--shadow-soft)]"`
`DropdownMenuItem`: `"relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-[13px] outline-none hover:bg-[--bg-surface] focus:bg-[--brand-primary-bg] focus:text-[--brand-primary-text] data-[disabled]:pointer-events-none data-[disabled]:opacity-50"`
`DropdownMenuLabel`: `"px-2 py-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-[--fg-muted]"`
`DropdownMenuSeparator`: `"-mx-1 my-1 h-px bg-[--border-soft]"`
`DropdownMenuShortcut`: `"ml-auto text-[11px] text-[--fg-muted] font-mono tabular-nums"`

- [ ] **Step 3: `tooltip.tsx`**

`TooltipContent`: `"z-50 overflow-hidden rounded-md bg-[--color-warm-900] px-2.5 py-1.5 text-[11px] text-white shadow-md"` (다크 tooltip)

- [ ] **Step 4: Type-check + Commit**

```bash
pnpm -C apps/web type-check && pnpm -C apps/web type-check
git add apps/web/components/ui/popover.tsx apps/web/components/ui/dropdown-menu.tsx apps/web/components/ui/tooltip.tsx
git commit -m "feat(ui): retune popover/dropdown/tooltip floating UI

Phase 1 T16. shadow-soft + whisper border, dropdown item focus=
brand-primary-bg, tooltip stays dark (warm-900) for contrast."
```

---

### Task 17: `toast.tsx` + `toaster.tsx` 리튠

**목적:** 알림 토스트. variant별 status color.

**Files:**
- Modify: `apps/web/components/ui/toast.tsx`
- Modify: `apps/web/components/ui/toaster.tsx`

- [ ] **Step 1: `toast.tsx` — Toast variants**

```ts
{
  default: "border-[--border-default] bg-[--bg-page] text-[--fg-primary]",
  destructive: "border-[--color-red-200] bg-[--color-red-50] text-[--color-red-500]",
  success: "border-[rgba(26,174,57,0.2)] bg-[--status-done-bg] text-[--status-done-fg]",
  warning: "border-[rgba(221,91,0,0.2)] bg-[--status-warn-bg] text-[--status-warn-fg]",
}
```

base: `"group pointer-events-auto relative flex w-full items-center justify-between gap-3 overflow-hidden rounded-lg border p-4 pr-6 shadow-[var(--shadow-soft)] transition-all text-[13px]"`

- [ ] **Step 2: `toaster.tsx`**

만약 커스텀 스타일이 있다면 container의 bg / border 토큰 확인. 없으면 `toast.tsx`만 수정하면 충분.

- [ ] **Step 3: Type-check + Commit**

```bash
pnpm -C apps/web type-check && pnpm -C apps/web type-check
git add apps/web/components/ui/toast.tsx apps/web/components/ui/toaster.tsx
git commit -m "feat(ui): retune toast/toaster with status variants

Phase 1 T17. default/destructive/success/warning 4 variants with
Notion palette semantic backgrounds."
```

---

### Task 18: `tabs.tsx` + `accordion.tsx` + `form.tsx` 리튠

**목적:** 디스클로저 + 폼 레이어.

**Files:**
- Modify: `apps/web/components/ui/tabs.tsx`
- Modify: `apps/web/components/ui/accordion.tsx`
- Modify: `apps/web/components/ui/form.tsx`

- [ ] **Step 1: `tabs.tsx`**

`TabsList`: `"inline-flex h-9 items-center justify-center rounded-md bg-[--bg-surface] p-1 text-[--fg-secondary]"`
`TabsTrigger`: `"inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1 text-[12.5px] font-medium ring-offset-[--bg-page] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--brand-primary-bg] disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-[--bg-page] data-[state=active]:text-[--brand-primary-text] data-[state=active]:shadow-[var(--shadow-flat)]"`
`TabsContent`: `"mt-3 ring-offset-[--bg-page] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--brand-primary-bg]"`

bottom-border 탭 스타일 (`ProjectTabs` 패턴)이 필요하다면 별도 TabsListVariant:
```ts
"inline-flex h-10 items-center gap-6 border-b border-[--border-default]"
```
그리고 active `TabsTrigger`는 `"border-b-2 border-[--brand-primary] text-[--brand-primary-text]"`.

이 variant는 별도 prop(`variant="underline"`)으로 노출.

- [ ] **Step 2: `accordion.tsx`**

`AccordionItem`: `"border-b border-[--border-soft]"`
`AccordionTrigger`: `"flex flex-1 items-center justify-between py-3 text-[14px] font-medium text-[--fg-primary] transition-all hover:underline [&[data-state=open]>svg]:rotate-180"`
`AccordionContent`: `"overflow-hidden text-[13px] text-[--fg-secondary] data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down"`

- [ ] **Step 3: `form.tsx` — FormMessage**

```tsx
"text-[11px] font-medium text-[--color-red-500]"
```
`FormLabel`: label.tsx와 동일 규칙.
`FormDescription`: `"text-[12px] text-[--fg-secondary]"`

- [ ] **Step 4: Type-check + Commit**

```bash
pnpm -C apps/web type-check && pnpm -C apps/web type-check
git add apps/web/components/ui/tabs.tsx apps/web/components/ui/accordion.tsx apps/web/components/ui/form.tsx
git commit -m "feat(ui): retune tabs/accordion/form primitives

Phase 1 T18. Tabs pill-style 기본 + underline variant. Accordion
border-soft. FormMessage red-500."
```

---

### Task 19: `checkbox.tsx` + `radio-group.tsx` + `switch.tsx` 리튠

**목적:** 선택 컨트롤. checked 상태는 Notion Blue.

**Files:**
- Modify: `apps/web/components/ui/checkbox.tsx`
- Modify: `apps/web/components/ui/radio-group.tsx`
- Modify: `apps/web/components/ui/switch.tsx`

- [ ] **Step 1: `checkbox.tsx`**

`Checkbox` root className:
```tsx
"peer h-4 w-4 shrink-0 rounded-[4px] border border-[--border-default] bg-[--bg-page] " +
"ring-offset-[--bg-page] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--brand-primary-bg] " +
"disabled:cursor-not-allowed disabled:opacity-50 " +
"data-[state=checked]:bg-[--brand-primary] data-[state=checked]:border-[--brand-primary] data-[state=checked]:text-white"
```

Check icon (inner): keep default.

- [ ] **Step 2: `radio-group.tsx`**

`RadioGroupItem`:
```tsx
"aspect-square h-4 w-4 rounded-full border border-[--border-default] bg-[--bg-page] text-[--brand-primary] " +
"ring-offset-[--bg-page] focus:outline-none focus-visible:ring-2 focus-visible:ring-[--brand-primary-bg] " +
"disabled:cursor-not-allowed disabled:opacity-50 " +
"data-[state=checked]:border-[--brand-primary]"
```

Inner circle indicator: `"h-2 w-2 rounded-full bg-[--brand-primary]"`.

- [ ] **Step 3: `switch.tsx`**

`Switch` root:
```tsx
"peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors " +
"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--brand-primary-bg] focus-visible:ring-offset-2 " +
"disabled:cursor-not-allowed disabled:opacity-50 " +
"data-[state=checked]:bg-[--brand-primary] data-[state=unchecked]:bg-[--color-warm-200]"
```

`SwitchThumb`: `"pointer-events-none block h-4 w-4 rounded-full bg-white shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0"`

- [ ] **Step 4: Type-check + Commit**

```bash
pnpm -C apps/web type-check && pnpm -C apps/web type-check
git add apps/web/components/ui/checkbox.tsx apps/web/components/ui/radio-group.tsx apps/web/components/ui/switch.tsx
git commit -m "feat(ui): retune checkbox/radio/switch checked=Notion Blue

Phase 1 T19. data-[state=checked] uses --brand-primary for all
three. Switch track unchecked=warm-200."
```

---

### Task 20: 토큰-only sweep — `avatar` + `skeleton` + `separator` + `calendar` + `popover` 보강

**목적:** 변경 폭이 작은 시각 primitive들의 배경/보더만 치환.

**Files:**
- Modify: `apps/web/components/ui/avatar.tsx`
- Modify: `apps/web/components/ui/skeleton.tsx`
- Modify: `apps/web/components/ui/separator.tsx`
- Modify: `apps/web/components/ui/calendar.tsx`

- [ ] **Step 1: `avatar.tsx`**

`Avatar` root: `"relative flex h-8 w-8 shrink-0 overflow-hidden rounded-full"` (unchanged)
`AvatarFallback`: `"flex h-full w-full items-center justify-center rounded-full bg-[--brand-primary-bg] text-[--brand-primary-text] text-[11px] font-semibold"`

- [ ] **Step 2: `skeleton.tsx`**

```tsx
"animate-pulse rounded-md bg-[--bg-surface]"
```

- [ ] **Step 3: `separator.tsx`**

```tsx
"shrink-0 bg-[--border-default] data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px"
```

- [ ] **Step 4: `calendar.tsx`**

react-day-picker CSS 토큰(이 파일의 `classNames` 맵)에서:
- `day_selected`: `"bg-[--brand-primary] text-white hover:bg-[--brand-primary-hover]"`
- `day_today`: `"bg-[--brand-primary-bg] text-[--brand-primary-text]"`
- `day_range_middle`: `"bg-[--brand-primary-bg] text-[--brand-primary-text]"`
- `day`: `"text-[--fg-primary] hover:bg-[--bg-surface] rounded-md"`
- `head_cell`: `"text-[11px] font-semibold uppercase tracking-[0.1em] text-[--fg-muted]"`
- `caption_label`: `"text-[13px] font-semibold text-[--fg-primary]"`
- `nav_button`: `"hover:bg-[--bg-surface] rounded-md"`

- [ ] **Step 5: Type-check + Commit**

```bash
pnpm -C apps/web type-check && pnpm -C apps/web type-check
git add apps/web/components/ui/avatar.tsx apps/web/components/ui/skeleton.tsx apps/web/components/ui/separator.tsx apps/web/components/ui/calendar.tsx
git commit -m "feat(ui): token-only sweep for avatar/skeleton/separator/calendar

Phase 1 T20. Avatar fallback=brand-primary-bg, skeleton=bg-surface,
separator=border-default, calendar day_selected=brand-primary."
```

---

## Part D — Docs & Validation

### Task 21: `docs/design-system.md` v3 재작성

**목적:** v2 가이드를 v3 Notion 통일판으로 전면 교체. Phase 2 진행자가 이 문서만 읽고 새 화면 리튠 가능해야 함.

**Files:**
- Modify: `docs/design-system.md` — 전체 rewrite (old content는 git history 보존)

- [ ] **Step 1: 현 `docs/design-system.md` 내용 확인 (아카이브 여부 결정)**

Run: `head -20 docs/design-system.md`
Expected: v2 "ISU Blue + Lime" 내용.

- [ ] **Step 2: 파일 전체 교체 (신 내용)**

`docs/design-system.md` 내용을 다음 구조로 새로 작성 (핵심만 요약, spec과 중복 금지 — spec을 canonical source로 참조):

```markdown
# Jarvis · Design System v3 — Notion-aligned Hybrid

> **v2 문서는 `git log docs/design-system.md`에서 확인.**
> **Canonical spec:** `docs/superpowers/specs/2026-04-24-design-overhaul-design.md`
> **Previews:** `docs/superpowers/specs/previews/*.html`

## 0. 이 문서 사용법

새 화면 만들거나 기존 화면 리튠할 때 **먼저 이 문서를 읽고**, 필요 시
spec을 파고든다. Phase 2 화면 리튠의 standing reference.

---

## 1. 핵심 원칙 (한 줄 요약)

> **Notion chrome (warm neutrals + pure white + whisper borders + Notion Blue)
> + 엔터프라이즈 밀도 유지. Pretendard Variable. Lime 금지 (graph 제외).**

- 페이지 배경은 `--bg-page` (pure white)
- 섹션 교대 배경 금지, 리듬은 보더·shadow·간격으로만
- Primary CTA·링크·focus 색은 오직 `--brand-primary` (Notion Blue `#0075de`)
- Red `#dc2626`만 destructive·error에
- 한글 블록에 음수 letter-spacing 금지 (`:lang(ko)` selector 사용)

## 2. 3-Tier 밀도 모델

| Tier | 용도 | Body | H1/Hero | Card radius | Card shadow |
|---|---|---|---|---|---|
| **T1 Spacious** | Wiki 본문, Ask AI 대화, Login, 404 | 16px/1.7 | 48px/700/-1.5px | 12-16px | shadow-soft |
| **T2 Balanced** | KPI, 요약 카드, 리스트 | 13-14px/1.5 | 30px/700/-0.625px | 10-12px | shadow-soft |
| **T3 Dense** | 테이블, 폼, 어드민 | 13-13.5px/1.5 | 14px/600 | 8px | shadow-flat |

화면별 매핑은 spec §8 참조.

## 3. 주요 토큰

(raw 값은 `apps/web/app/globals.css`에서 SSoT. 여기선 role만.)

```css
--bg-page / --bg-surface
--fg-primary / --fg-secondary / --fg-muted
--brand-primary / --brand-primary-hover / --brand-primary-bg / --brand-primary-text
--border-default / --border-soft / --border-focus
--status-{done,success,active,warn,danger,neutral,decorative-{pink,purple,brown}}-{bg,fg}
--shadow-soft / --shadow-deep / --shadow-flat
--color-red-{50,200,500}
--graph-node-{1..6}  ← UI 금지, graph 시각화 전용
```

## 4. 패턴 헬퍼 (항상 이걸 써라)

- `StatusChip` (`components/patterns/StatusChip.tsx`) — 상태 칩
- `PriorityChip` (`components/patterns/PriorityChip.tsx`) — P1/P2/P3
- `Field` (`components/patterns/Field.tsx`) — 폼 필드 래퍼
- `NativeSelect` (`components/patterns/NativeSelect.tsx`) — T3 네이티브 select

## 5. 신 화면 체크리스트

- [ ] 이 화면은 T1/T2/T3 중 어느 tier인가? 결정 후 해당 tier 스케일 따름
- [ ] 페이지 루트는 `bg-[--bg-page]` 또는 unset (자동 흰색)
- [ ] 카드는 `bg-white border border-[--border-default] rounded-{lg|xl} shadow-[var(--shadow-{flat|soft})]`
- [ ] 버튼은 shadcn `<Button>` — variant로 색 제어
- [ ] 칩은 `<StatusChip>` 또는 `<PriorityChip>` — 직접 className 만들지 말 것
- [ ] 폼 필드는 `<Field label="…">` 로 감쌈
- [ ] 숫자가 들어가는 셀은 `tabular-nums` 기본 (body 단위에서 자동 적용됨)
- [ ] 아이콘은 `lucide-react` 전용, 크기 tier별(§6.4)

## 6. 금지 사항 (하지 마)

- ❌ 인라인 hex/rgb 컬러 (`#2b5bff`, `rgb(...)`) — 토큰만
- ❌ `bg-isu-*`, `text-surface-*`, `bg-lime-*` (Phase 2에서 전부 제거, 새 작업엔 쓰지 말 것)
- ❌ `rounded-2xl`/`rounded-3xl` — T1 hero 카드(`rounded-xl` 16px)만 예외
- ❌ `bg-card` 토큰 (deprecated) — `bg-white` 또는 `bg-[--bg-page]` 사용
- ❌ `text-rose-*` — red는 `text-[--color-red-500]`로 통일
- ❌ `shadow-lg`+ — `shadow-[var(--shadow-deep)]`만 예외 (모달)
- ❌ 배경색 교대 (`bg-surface-100` 섹션 배경) — pure white만
- ❌ Lime 색상 (그래프 제외)
- ❌ 호버 시 `scale(1.05)` / `scale(0.9)` — 내부 툴에 과함

## 7. 다크 모드

`:root[data-theme="dark"]` 자동 오버라이드. 토큰이 모두 dark-aware라 새 코드에서 추가 작업 불필요.

토글 UI는 Phase 2에서 추가.

## 8. 다국어

- 한글은 `font-feature-settings: "ss01", "tnum", "lnum"` + letter-spacing 0
- 음수 letter-spacing은 Latin/숫자에만: `.hero-title:lang(ko) { letter-spacing: 0 }`
- 모든 UI 텍스트는 `apps/web/messages/{ko,en}.json`

## 9. 참고 링크

- Spec: `docs/superpowers/specs/2026-04-24-design-overhaul-design.md`
- Previews: `docs/superpowers/specs/previews/*.html`
- Phase 1 구현 플랜: `docs/superpowers/plans/2026-04-24-design-overhaul-phase-1.md`
```

- [ ] **Step 3: 커밋**

```bash
git add docs/design-system.md
git commit -m "docs(design): rewrite design-system.md for v3 (Notion-aligned Hybrid)

Phase 1 T21. v2 ISU+Lime 가이드를 v3 Notion-aligned로 전면 교체.
Spec을 canonical로 참조, 여기선 principle + 3-tier model +
pattern helper 사용법 + 금지 사항 + 체크리스트 요약. v2 본문은
git log에서 확인 가능."
```

---

### Task 22: Lime/isu 잔존 grep check + type/test gate

**목적:** Phase 1 완료 직전 자동 검증. primitive·헬퍼에 잔존한 옛 토큰 참조가 없는지 확인.

**Files:**
- No file changes (검증만)

- [ ] **Step 1: UI primitives + patterns에 lime-* 흔적 확인**

Run: `grep -rn "lime-" apps/web/components/ui apps/web/components/patterns`
Expected: **0 matches** (graph-only 분리 원칙).

만약 매치가 있으면 해당 파일 열어 Token Migration Reference (섹션 0)에 따라 교체 → 재커밋.

- [ ] **Step 2: patterns/ 에 isu-*, surface-* 잔존 확인**

Run: `grep -rn "isu-\|surface-" apps/web/components/patterns`
Expected: 0 matches (헬퍼는 신 토큰만).

만약 매치가 있으면 즉시 교체 커밋.

- [ ] **Step 3: UI primitives의 isu-*, surface-* 확인**

Run: `grep -rn "isu-\|surface-" apps/web/components/ui`
Expected: 0 matches (27개 primitive 전부 신 토큰).

매치 있으면 해당 primitive Task 9-20 재방문.

- [ ] **Step 4: Type-check 2회 + test 2회 (user 정책: TDD는 2회 연쇄)**

Run:
```bash
pnpm -C apps/web type-check && pnpm -C apps/web type-check
pnpm -C apps/web test && pnpm -C apps/web test
```
Expected: 모두 PASS.

- [ ] **Step 5: 4개 헬퍼 테스트 수 확인**

Run: `pnpm -C apps/web vitest run components/patterns`
Expected: 최소 7+5+6+5 = 23 tests PASS (StatusChip 7 / PriorityChip 5 / Field 6 / NativeSelect 5).

- [ ] **Step 6: 빌드 확인**

Run: `pnpm -C apps/web build 2>&1 | tail -30`
Expected: 성공.

- [ ] **Step 7: 검증 commit (체크리스트 결과를 문서에 기록)**

검증만 했을 때는 commit 불필요. 만약 step 1-3에서 수정이 있었다면 해당 파일별 커밋.

---

### Task 23: `/ui-ux-pro-max` + `/impeccable` 리뷰 적용

**목적:** Phase 1 spec + 프리뷰 + 코드 결과물을 두 리뷰 스킬에 제출해 이슈 반영.

**Files:**
- 리뷰 결과에 따라 spec/design-system.md/primitives 중 일부 수정 가능

- [ ] **Step 1: `/ui-ux-pro-max` 리뷰 invoke**

대화에서: "`/ui-ux-pro-max` 스킬을 사용해 `docs/superpowers/specs/2026-04-24-design-overhaul-design.md`의 타이포·색·컴포넌트 원칙이 Notion/Linear 급 기준을 충족하는지 감사. 미흡한 항목은 action item 리스트."

Expected: 이슈 리스트 + 권장 수정.

- [ ] **Step 2: `/impeccable` 리뷰 invoke**

"`/impeccable` 스킬로 `docs/superpowers/specs/previews/*.html` 5개 프리뷰의 aesthetic 품질, AI slop 패턴, 시각 완성도를 평가."

Expected: 프리뷰 HTML 개선 권장사항.

- [ ] **Step 3: 이슈 심각도에 따라 fix**

- **Critical (시각 붕괴·접근성 실패):** 해당 Task 9-20 또는 spec 되돌아가 즉시 수정.
- **Major (권장 변경):** 별도 Task 24/25로 후속 plan에 추가 (사용자 승인 후 진행).
- **Minor (취향 차이):** fix는 Phase 2로 이월하거나 무시 판단.

- [ ] **Step 4: 리뷰 이슈 정리 + 커밋 (fix가 있었다면)**

```bash
git add <fixed files>
git commit -m "fix(design): address /ui-ux-pro-max + /impeccable review issues

Phase 1 T23. 리뷰 피드백: <요약 3~5 bullet>. Major/Minor는 Phase 2
또는 별도 fix PR로 이월."
```

- [ ] **Step 5: Phase 1 완료 선언**

Run: `git log --oneline origin/main..HEAD`
Expected: 20+ 커밋, 각 Phase 1 TN 태그.

Run: `pnpm -C apps/web type-check && pnpm -C apps/web test && pnpm -C apps/web build`
Expected: 전부 통과.

**Phase 1 완료 기준 (spec §17):**
- [ ] `components/ui/*` 27개 파일 모두 신 토큰 사용
- [ ] 4개 헬퍼 추출 완료
- [ ] 5개 프리뷰 HTML 커밋되어 있음 (선행 커밋 `1da46e7`에서 완료)
- [ ] `docs/design-system.md` v3 재작성 커밋
- [ ] Lime grep = 0 (UI), `isu-*`/`surface-*` grep = 0 (primitives/patterns)
- [ ] type-check + test + build 통과

---

## 자가 검토 (이 플랜 발행 후 실행자 리뷰용)

다음 체크리스트를 플랜 실행 중/후에 스스로 점검:

**Spec coverage:**
- spec §5 토큰 — Task 1-4 ✓
- spec §6 타이포 — globals.css + 각 primitive의 font/size className으로 반영 ✓
- spec §7 Tier×component 매트릭스 — 각 primitive의 default size가 T3/T2 겸용 + lg가 T1 ✓
- spec §8 화면 매핑 — **Phase 1 범위 밖** (Phase 2에서 적용)
- spec §9 component specs — Task 9-20 ✓
- spec §10 motion — `.shimmer`/`GlobeLoader` 유지, Notion scale 도입 안함 (Task 9의 스타일에서 제외) ✓
- spec §11 접근성 — focus ring 모든 primitive에 `--border-focus` ✓
- spec §13 i18n — Phase 2 화면 작업에서 체크 (Phase 1 primitive는 문자열 없음)
- spec §14 롤아웃 Phase 1 — 이 플랜 전체 ✓
- spec §15 리뷰 — Task 23 ✓
- spec §17 success criteria Phase 1 — Task 22 + 23 Step 5 ✓

**Placeholder scan:**
- "TBD / TODO / implement later" 없음 (재검증 필요)
- 각 primitive 태스크에 구체적 className 코드 포함 ✓
- 테스트 코드 전부 실제 assert 있음 ✓

**Type consistency:**
- `StatusKey`, `PriorityKey`, `StatusChipSize` 타입이 태스크 간 일관
- `--brand-primary` 등 토큰 이름이 spec §5.2와 일치 ✓
- `cva()` variant 이름이 button / badge / alert / toast에서 충돌 없음 (default/destructive/success/warning/outline 등 공통 네이밍)

---

## 실행 핸드오프

Plan complete and saved to `docs/superpowers/plans/2026-04-24-design-overhaul-phase-1.md`. 실행 방법 2가지:

**1. Subagent-Driven (추천)** — 각 Task마다 fresh subagent 디스패치 + 사이사이 리뷰 체크포인트. 속도·안전성 balanced.

**2. Inline Execution** — 이 세션에서 `executing-plans` 스킬로 batch 실행 + 체크포인트에서 리뷰.

**Which approach?**
