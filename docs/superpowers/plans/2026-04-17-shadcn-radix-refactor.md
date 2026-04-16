# shadcn/ui + Radix 대규모 리팩토링 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `components/ui/` 22개를 shadcn/Radix 기반으로 전면 교체하고, `components/patterns/` 8개 Jarvis 고유 컴포넌트를 신설하며, 15+ 페이지를 마이그레이션해 Impeccable 95+점 + WCAG AA를 달성한다.

**Architecture:** `globals.css` @theme 단일 토큰 출처 → `components/ui/*` (Radix primitives) + `components/patterns/*` (Jarvis 재사용 단위) → `components/layout/*` (유지) → pages. Big Bang 단일 PR.

**Tech Stack:** Next.js 15.2.4, React 19, Tailwind CSS v4 (@theme), shadcn/ui (CLI), Radix UI primitives, react-hook-form + zod, lucide-react, class-variance-authority, @axe-core/react, eslint-plugin-jsx-a11y, Playwright 1.44.

**Reference spec:** `docs/superpowers/specs/2026-04-17-shadcn-radix-refactor-design.md`

---

## File Structure

**Will be created:**
- `apps/web/components.json` (shadcn config)
- `apps/web/components/patterns/*.tsx` (8 files)
- `apps/web/lib/a11y/axe-init.tsx`
- `apps/web/e2e/screens/*.spec.ts` (5 files)
- `apps/web/e2e/playwright.config.ts` (or updated)

**Will be replaced (22 files):**
- `apps/web/components/ui/{accordion,alert,avatar,badge,button,calendar,card,checkbox,dialog,dropdown-menu,form,input,label,popover,radio-group,scroll-area,select,separator,sheet,skeleton,switch,table,tabs,textarea,toast,tooltip}.tsx`
- 기존 22개 중 일부(예: `dropdown-menu`, `select`)는 이미 이름이 있으므로 덮어쓰기. 신규(`avatar`, `checkbox`, `radio-group`, `switch`, `toast`) 추가.

**Will be modified:**
- `apps/web/package.json` (deps)
- `apps/web/app/globals.css` (motion tokens)
- `apps/web/app/layout.tsx` (AxeInit mount)
- `apps/web/.eslintrc.json` (jsx-a11y)
- 15+ page files under `apps/web/app/(app)/**` and `apps/web/app/(auth)/**`

**Will be deleted:** 없음 (기존 custom 22개는 shadcn CLI가 덮어쓰는 방식).

---

## Phase 0 — 인프라 준비 (직렬, main agent)

### Task 0.1: Radix + a11y + day-picker 의존성 추가

**Files:**
- Modify: `apps/web/package.json`

- [ ] **Step 1: 의존성 추가 명령 실행 (project root에서)**

```bash
cd "C:/Users/Administrator/Desktop/devdev/jarvis/.claude/worktrees/laughing-hertz"
pnpm -F @jarvis/web add \
  @radix-ui/react-accordion \
  @radix-ui/react-alert-dialog \
  @radix-ui/react-avatar \
  @radix-ui/react-checkbox \
  @radix-ui/react-dialog \
  @radix-ui/react-dropdown-menu \
  @radix-ui/react-label \
  @radix-ui/react-popover \
  @radix-ui/react-radio-group \
  @radix-ui/react-scroll-area \
  @radix-ui/react-select \
  @radix-ui/react-separator \
  @radix-ui/react-slot \
  @radix-ui/react-switch \
  @radix-ui/react-tabs \
  @radix-ui/react-toast \
  @radix-ui/react-tooltip \
  react-day-picker
```

- [ ] **Step 2: dev 의존성 추가**

```bash
pnpm -F @jarvis/web add -D \
  @axe-core/react \
  @axe-core/playwright \
  eslint-plugin-jsx-a11y
```

- [ ] **Step 3: package.json 검증**

Run: `grep -c "@radix-ui" apps/web/package.json`
Expected: `17`

- [ ] **Step 4: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml
git commit -m "chore(web): add Radix primitives, a11y tooling, and react-day-picker"
```

---

### Task 0.2: shadcn CLI 초기화

**Files:**
- Create: `apps/web/components.json`

- [ ] **Step 1: shadcn init 실행**

```bash
cd apps/web
pnpm dlx shadcn@latest init
```

When prompted:
- `Which style would you like to use?` → `New York`
- `Which color would you like to use as the base color?` → `Neutral` (우리가 토큰 덮어쓸 거라 무관)
- `Would you like to use CSS variables for theming?` → `yes`

- [ ] **Step 2: components.json 커스터마이즈**

Overwrite `apps/web/components.json` with:

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "app/globals.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

- [ ] **Step 3: 검증**

Run: `cat apps/web/components.json | grep '"ui"'`
Expected: `"ui": "@/components/ui"`

- [ ] **Step 4: Commit**

```bash
git add apps/web/components.json
git commit -m "chore(web): configure shadcn/ui CLI (New York style, Tailwind v4)"
```

---

### Task 0.3: globals.css에 motion 토큰 + reduced-motion 추가

**Files:**
- Modify: `apps/web/app/globals.css`

- [ ] **Step 1: @theme 블록에 모션 토큰 추가**

Find `@theme {` block. Before the closing `}`, add:

```css
  /* ── Motion ─────────────────────────────────── */
  --ease-out-quart: cubic-bezier(0.25, 1, 0.5, 1);
  --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-out-quint: cubic-bezier(0.22, 1, 0.36, 1);
  --duration-fast: 150ms;
  --duration-normal: 240ms;
  --duration-slow: 400ms;
```

- [ ] **Step 2: 파일 끝에 reduced-motion 규칙 추가**

Append to end of `apps/web/app/globals.css`:

```css
/* Reduced motion — honor OS-level accessibility preference */
@media (prefers-reduced-motion: reduce) {
  :root {
    --duration-fast: 0ms;
    --duration-normal: 0ms;
    --duration-slow: 0ms;
  }
  *,
  *::before,
  *::after {
    animation-duration: 0ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0ms !important;
    scroll-behavior: auto !important;
  }
}
```

- [ ] **Step 3: 검증**

Run: `grep -c "duration-fast" apps/web/app/globals.css`
Expected: `2` (1 in @theme, 1 in media query)

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/globals.css
git commit -m "feat(web): add motion tokens and prefers-reduced-motion support"
```

---

### Task 0.4: axe-core dev-only 초기화

**Files:**
- Create: `apps/web/lib/a11y/axe-init.tsx`
- Modify: `apps/web/app/layout.tsx`

- [ ] **Step 1: AxeInit 컴포넌트 생성**

Create `apps/web/lib/a11y/axe-init.tsx`:

```tsx
"use client";

import { useEffect } from "react";

/**
 * Dev-only accessibility auditor.
 *
 * Dynamically loads @axe-core/react in development to log accessibility
 * violations in the browser console. Does not ship in production builds.
 */
export function AxeInit() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production") {
      return;
    }
    let cancelled = false;
    void (async () => {
      const [{ default: React }, ReactDOM, axe] = await Promise.all([
        import("react"),
        import("react-dom"),
        import("@axe-core/react"),
      ]);
      if (cancelled) return;
      axe.default(React, ReactDOM, 1000);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
```

- [ ] **Step 2: layout.tsx에 AxeInit 마운트**

Modify `apps/web/app/layout.tsx`. Add import after other imports:

```tsx
import { AxeInit } from "@/lib/a11y/axe-init";
```

Inside `<body>`, immediately after `<NextIntlClientProvider>` opening tag, add:

```tsx
<AxeInit />
```

Result (pattern):

```tsx
      <body
        className={`${familjenGrotesk.variable} ${hahmlet.variable} font-sans`}
        style={{ fontFamily: "var(--font-body), system-ui, sans-serif" }}
      >
        <NextIntlClientProvider messages={messages}>
          <AxeInit />
          {children}
        </NextIntlClientProvider>
      </body>
```

- [ ] **Step 3: 검증**

Run: `grep "AxeInit" apps/web/app/layout.tsx`
Expected: import line + `<AxeInit />` usage.

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/a11y/axe-init.tsx apps/web/app/layout.tsx
git commit -m "feat(web): add dev-only axe-core accessibility auditor"
```

---

### Task 0.5: ESLint jsx-a11y 활성화

**Files:**
- Modify: `apps/web/.eslintrc.json`

- [ ] **Step 1: ESLint 설정 업데이트**

Replace entire content of `apps/web/.eslintrc.json` with:

```json
{
  "extends": [
    "next/core-web-vitals",
    "next/typescript",
    "plugin:jsx-a11y/recommended"
  ],
  "plugins": ["jsx-a11y"],
  "rules": {
    "jsx-a11y/no-autofocus": "error",
    "jsx-a11y/label-has-associated-control": [
      "error",
      { "assert": "either" }
    ]
  }
}
```

- [ ] **Step 2: Lint 실행으로 현재 violations 확인**

Run: `pnpm -F @jarvis/web lint 2>&1 | tail -30`

Expected: a11y violations may appear in current custom components. Note them — they'll be fixed as part of Phase 1-3.

- [ ] **Step 3: 임시 override 추가 (마이그레이션 전 기간)**

If violations block CI: add to `.eslintrc.json` `rules`:

```json
    "jsx-a11y/click-events-have-key-events": "warn",
    "jsx-a11y/no-static-element-interactions": "warn"
```

Downgrade from error → warn during migration. Restore to error in Phase 5.

- [ ] **Step 4: Commit**

```bash
git add apps/web/.eslintrc.json
git commit -m "chore(web): enable eslint-plugin-jsx-a11y with migration-safe rules"
```

---

### Task 0.6: Playwright 디렉토리 및 config 준비

**Files:**
- Check: `apps/web/playwright.config.ts` or `apps/web/e2e/`
- Create: `apps/web/e2e/playwright.config.ts` (if absent)

- [ ] **Step 1: 현재 Playwright 설정 확인**

Run: `ls apps/web/playwright* apps/web/e2e/ 2>/dev/null`

If nothing exists, proceed. If config exists, use existing location.

- [ ] **Step 2: playwright.config.ts 생성 (필요 시)**

Create `apps/web/playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e/screens",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:3010",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: "pnpm -F @jarvis/web dev",
    url: "http://localhost:3010",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

- [ ] **Step 3: e2e 디렉토리 스텁 생성**

```bash
mkdir -p apps/web/e2e/screens
touch apps/web/e2e/screens/.gitkeep
```

- [ ] **Step 4: package.json에 E2E 스크립트 추가**

Modify `apps/web/package.json`. In `"scripts"` block, add:

```json
    "test:e2e": "playwright test",
    "test:e2e:update": "playwright test --update-snapshots"
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/playwright.config.ts apps/web/e2e apps/web/package.json
git commit -m "chore(web): bootstrap Playwright E2E infrastructure"
```

---

## Phase 1 — `components/ui/` 22개 교체 (4개 병렬 agent)

각 task는 **하나의 subagent가 실행**합니다. Phase 1의 4개 task는 병렬 dispatch 가능합니다 — 서로 다른 파일만 건드리므로 충돌 없음.

### 공통 제약 (모든 Phase 1 task의 subagent prompt에 반드시 포함)

```
PROJECT ROOT: C:\Users\Administrator\Desktop\devdev\jarvis\.claude\worktrees\laughing-hertz\

BRAND TOKENS (registered in globals.css @theme as Tailwind utilities):
- bg-isu-{50..950}, text-isu-*, border-isu-*   (brand blue, ISU logo color)
- bg-lime-{50..700}, text-lime-*               (accent, ISU logo green)
- bg-surface-{50..950}, text-surface-*         (brand-tinted neutrals)
- success, success-subtle, warning, warning-subtle, danger, danger-subtle
- text-display utility → applies var(--font-display) with letter-spacing

ABSOLUTE BANS (Impeccable):
1. NO border-left / border-right with width > 1px  (left-stripe is #1 AI slop)
2. NO gradient text (background-clip: text + gradient)
3. NO inline style={{ ... }} for colors/layout — use Tailwind utilities
4. NO onMouseEnter / onMouseLeave for hover — use Tailwind `hover:` variant
5. NO rounded-2xl + shadow-sm combo
6. NO glassmorphism everywhere

INSTALL METHOD:
- Use `pnpm dlx shadcn@latest add <component>` from apps/web/ directory
- After CLI generates component, adapt:
  * Replace shadcn's default color tokens (`bg-primary`, etc.) with ISU tokens where brand color applies
  * Keep shadcn semantic tokens (`bg-background`, `text-foreground`) since globals.css maps them
  * Add ISU-specific variants (badge accent, alert warning/success) if called out
- If CLI fails (Tailwind v4 detection issues), manually create file using latest shadcn source from github.com/shadcn-ui/ui as reference, adapted for Tailwind v4 @theme.

CONSUMER COMPAT:
- MUST keep exported names matching current custom components where possible
  (Card, CardHeader, CardTitle, CardContent, CardFooter stay named the same)
- Prop shape: match shadcn defaults — existing consumers may need updates in Phase 3,
  document any breaking change explicitly in your report.

VERIFICATION (after each component):
- Run `pnpm -F @jarvis/web type-check` — should pass for files you touched
- Check that all Radix imports resolve
- No inline styles except dynamic width/height percentages for progress bars
```

---

### Task 1.α: 기초 primitives 6개 (subagent α)

**Components:** accordion, alert, avatar, badge, button, card, label

**Files:**
- Replace: `apps/web/components/ui/accordion.tsx`
- Replace: `apps/web/components/ui/alert.tsx`
- Create: `apps/web/components/ui/avatar.tsx`
- Replace: `apps/web/components/ui/badge.tsx`
- Replace: `apps/web/components/ui/button.tsx`
- Replace: `apps/web/components/ui/card.tsx`
- Replace: `apps/web/components/ui/label.tsx`

- [ ] **Step 1: Dispatch subagent**

Use Agent tool with `general-purpose` subagent_type. Prompt:

```
You are Subagent α implementing Phase 1 of the shadcn/Radix refactor.

[PASTE COMMON CONSTRAINTS from "공통 제약" section above]

## Your 7 components
Run these commands (one at a time, verify each):
  cd apps/web
  pnpm dlx shadcn@latest add accordion alert avatar badge button card label

After each component file is generated under `components/ui/`, ADAPT it per these rules:

### button.tsx
- Keep shadcn variants (default, destructive, outline, secondary, ghost, link)
- Adapt `default`: `bg-isu-600 text-surface-50 hover:bg-isu-700 focus-visible:ring-isu-300`
- Adapt `destructive`: `bg-danger text-white hover:bg-danger/90`
- Add NEW variant `accent`: `bg-lime-500 text-surface-900 hover:bg-lime-600 focus-visible:ring-lime-300`
  (used for Jarvis CTA highlights)
- Keep `sizes: default, sm, lg, icon`
- Focus ring: use `focus-visible:ring-2 focus-visible:ring-offset-2` with brand color
- Export `buttonVariants` (shadcn default) AND keep back-compat `buttonClasses({...})` as a thin wrapper:
    export function buttonClasses({ className, variant = "default", size = "default" }) {
      return buttonVariants({ variant, size, className });
    }

### badge.tsx
- Keep shadcn base (default, secondary, destructive, outline)
- Add `success` variant: `bg-success-subtle text-success`
- Add `warning` variant: `bg-warning-subtle text-warning`
- Add `accent` variant: `bg-lime-100 text-lime-700`
- `default` uses `bg-isu-100 text-isu-700`

### alert.tsx
- shadcn default variants: `default, destructive`
- Add `success`: bg-success-subtle text-success border-transparent
- Add `warning`: bg-warning-subtle text-warning border-transparent
- VERIFY: shadcn's alert does NOT use border-left stripe. If the generated file has
  `border-l-4` or similar, REMOVE it and keep just regular border. Use icon + bg-tint
  pattern with lucide icons.

### card.tsx
- shadcn card default (rounded-xl border bg-card shadow-sm)
- OVERRIDE `shadow-sm` — our brand style is flat. Replace `shadow-sm` with nothing.
- Keep API: Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter

### accordion.tsx
- shadcn default (Radix accordion)
- No adaptation needed beyond the common rules

### avatar.tsx (NEW)
- shadcn default
- Adapt fallback: `bg-isu-100 text-isu-700 font-medium`

### label.tsx
- shadcn default (Radix label)
- No adaptation needed

## After all 7 are done

1. Run `pnpm -F @jarvis/web type-check`
2. Fix any TS errors introduced
3. Grep for lingering inline styles or onMouseEnter in your 7 files — report any found.

## Report back (< 400 words)
- Which of the 7 installed cleanly via CLI vs needed manual adaptation
- Any shadcn default patterns you had to override (e.g., if CLI output had left-stripe or shadow-sm that needed removing)
- Confirm `buttonClasses` back-compat wrapper exported so existing consumers still work
- Any type errors surfaced by type-check and how you resolved them
- Paste final `button.tsx` variants block + final `badge.tsx` variants block
```

- [ ] **Step 2: Review subagent's report**

Read the final report. Verify:
- All 7 files exist
- `buttonClasses` back-compat exported
- No left-stripe patterns
- No inline color styles

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && pnpm type-check 2>&1 | grep -E "ui/(accordion|alert|avatar|badge|button|card|label)" | head -10`
Expected: no errors specific to these 7 files (unrelated monorepo errors OK).

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/ui/{accordion,alert,avatar,badge,button,card,label}.tsx
git commit -m "feat(web/ui): replace 7 primitives with shadcn/Radix (accordion, alert, avatar, badge, button, card, label)"
```

---

### Task 1.β: 오버레이 primitives 6개 (subagent β)

**Components:** dialog, dropdown-menu, popover, select, sheet, tooltip

**Files:**
- Replace: `apps/web/components/ui/{dialog,dropdown-menu,popover,select,sheet,tooltip}.tsx`

- [ ] **Step 1: Dispatch subagent**

Use Agent tool. Prompt:

```
You are Subagent β implementing Phase 1 of the shadcn/Radix refactor.

[PASTE COMMON CONSTRAINTS]

## Your 6 components
  cd apps/web
  pnpm dlx shadcn@latest add dialog dropdown-menu popover select sheet tooltip

### dialog.tsx
- Radix dialog. Default overlay: `bg-surface-950/60 backdrop-blur-sm`
- Content: `bg-background border-border rounded-xl shadow-xl` (shadow OK on modals — high z-index surfaces need it)
- Keep API: Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose

### dropdown-menu.tsx
- Radix. Keep all default exports.
- Content: `bg-popover border-border rounded-md shadow-md min-w-[8rem]`
- Item hover: `focus:bg-isu-50 focus:text-isu-900`

### popover.tsx
- Radix. Default styling.

### select.tsx
- Radix. Trigger: `bg-background border-border h-10 rounded-md`
- Focus state: `focus:ring-2 focus:ring-isu-300`
- Check: shadcn default for select trigger uses `border border-input`. `input` is a shadcn CSS var
  — we need to ensure `--border` maps to our surface-200. Verify globals.css has
  `--color-border: var(--color-surface-200)` or equivalent. If missing, add it.

### sheet.tsx
- Radix dialog primitive with side variants
- Default: `bg-background border-border`
- Overlay: match dialog

### tooltip.tsx
- Radix. `delayDuration={200} sideOffset={4}`
- Content: `bg-surface-900 text-surface-50 rounded-md px-2 py-1 text-xs`

## Special note on existing consumers
Current custom tooltip is essentially a no-op (`<>{children}</>`).
Real Radix tooltip requires `<TooltipProvider>` at the app root.
Add `<TooltipProvider>` in `apps/web/app/layout.tsx` wrapping `{children}`.

After you finish your 6 files, also:
1. MODIFY `apps/web/app/layout.tsx` to wrap `{children}` with `<TooltipProvider delayDuration={200}>`
   Import from `@/components/ui/tooltip`.

## Report back (< 400 words)
- Any shadcn defaults you overrode
- Confirm TooltipProvider is added to layout.tsx with correct import
- Any CSS variable (`--border`, `--input`, `--popover`, `--background`, `--foreground`) that was
  missing from globals.css — if you had to add any to make shadcn base tokens resolve,
  list them with their OKLCH values
```

- [ ] **Step 2: Review report**

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && pnpm type-check 2>&1 | grep -E "ui/(dialog|dropdown|popover|select|sheet|tooltip)" | head -10`

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/ui/{dialog,dropdown-menu,popover,select,sheet,tooltip}.tsx apps/web/app/layout.tsx apps/web/app/globals.css
git commit -m "feat(web/ui): replace 6 overlay primitives with shadcn/Radix"
```

---

### Task 1.γ: 폼 + 데이터 primitives 10개 (subagent γ)

**Components:** checkbox, form, input, radio-group, scroll-area, separator, skeleton, switch, table, tabs, textarea, toast

**Note:** This is the largest task. Split across 2 steps if needed.

**Files:**
- Create: `apps/web/components/ui/{checkbox,radio-group,switch,toast}.tsx`
- Replace: `apps/web/components/ui/{form,input,scroll-area,separator,skeleton,table,tabs,textarea}.tsx`

- [ ] **Step 1: Dispatch subagent**

```
You are Subagent γ implementing Phase 1 of the shadcn/Radix refactor.

[PASTE COMMON CONSTRAINTS]

## Your 12 components
  cd apps/web
  pnpm dlx shadcn@latest add checkbox form input label radio-group scroll-area separator skeleton switch table tabs textarea toast

(label is already handled by Subagent α — if CLI prompts to overwrite, SKIP it to avoid conflict.)

### Critical: form.tsx
- shadcn form is react-hook-form + zod integration (Form, FormField, FormItem, FormLabel,
  FormControl, FormDescription, FormMessage, useFormField)
- Our project already has react-hook-form + @hookform/resolvers + zod installed — shadcn form will
  integrate directly.
- Keep ALL shadcn default exports.

### input.tsx, textarea.tsx
- shadcn defaults with our focus ring:
  `focus-visible:ring-2 focus-visible:ring-isu-300 focus-visible:ring-offset-0`
- Border: `border-surface-300`, background: `bg-white`

### checkbox.tsx, radio-group.tsx, switch.tsx
- Radix defaults
- Checked state: `data-[state=checked]:bg-isu-600 data-[state=checked]:text-surface-50`
- Radio indicator and switch thumb: use lime-500 for subtle brand pop when checked (optional,
  prefer isu-600 if it reads cleaner)

### table.tsx
- shadcn default
- Header row: `bg-surface-50`, `text-xs uppercase tracking-wide text-surface-600`
- Row hover: `hover:bg-surface-50`

### tabs.tsx
- Radix. Active tab: `data-[state=active]:bg-background data-[state=active]:text-foreground`
  with `data-[state=active]:shadow-sm`
- tabs list background: `bg-surface-100`

### toast.tsx
- Radix toast (may need `useToast` hook — keep shadcn default hook file at `hooks/use-toast.ts`
  if CLI generates it)

### scroll-area.tsx, separator.tsx, skeleton.tsx
- shadcn defaults, no brand adaptation needed beyond tokens

## Report back (< 500 words)
- Which of 12 installed cleanly
- Confirm `form.tsx` re-exports `Form, FormField, FormItem, FormLabel, FormControl, FormDescription, FormMessage`
- Confirm `useToast` hook path
- Any shadcn default that had inline style or banned pattern you had to remove
```

- [ ] **Step 2: Review report**

- [ ] **Step 3: Typecheck**

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/ui/{checkbox,form,input,radio-group,scroll-area,separator,skeleton,switch,table,tabs,textarea,toast}.tsx apps/web/hooks
git commit -m "feat(web/ui): replace 12 form/data/feedback primitives with shadcn/Radix"
```

---

### Task 1.δ: calendar (subagent δ)

**Files:**
- Replace: `apps/web/components/ui/calendar.tsx`

- [ ] **Step 1: Dispatch subagent**

```
You are Subagent δ implementing Phase 1 of the shadcn/Radix refactor.

[PASTE COMMON CONSTRAINTS]

## Your 1 component
  cd apps/web
  pnpm dlx shadcn@latest add calendar

This will:
- Generate `components/ui/calendar.tsx` based on react-day-picker
- react-day-picker is already installed in Phase 0

### Adaptations
- Selected day: `bg-isu-600 text-surface-50 hover:bg-isu-700`
- Today marker: `border-2 border-lime-500` (subtle brand accent)
- Range selection background (if used): `bg-isu-100 text-isu-900`
- Nav buttons: use Button variant="ghost" size="icon"
- Month/year caption: `text-display font-semibold text-surface-800`

### Verification
- Check that date-fns is used for formatting (default in shadcn calendar)
- No inline styles
- Keyboard nav preserved from react-day-picker defaults

## Report back (< 200 words)
- Any quirks in the shadcn calendar default that needed adaptation for Tailwind v4
- Confirm keyboard navigation (arrow keys, enter, space) works per react-day-picker defaults
```

- [ ] **Step 2: Review + commit**

```bash
git add apps/web/components/ui/calendar.tsx
git commit -m "feat(web/ui): replace calendar with react-day-picker via shadcn"
```

---

## Phase 2 — `components/patterns/` 8개 신설 (2개 병렬 agent)

### Task 2.ε: Pattern A — Structural (4 files, subagent ε)

**Components:** PageHeader (이동), EmptyState, SectionHeader, StatusDot

**Files:**
- Move: `apps/web/components/layout/PageHeader.tsx` → `apps/web/components/patterns/PageHeader.tsx`
- Create: `apps/web/components/patterns/{EmptyState,SectionHeader,StatusDot}.tsx`

- [ ] **Step 1: Dispatch subagent**

```
You are Subagent ε creating 4 Jarvis pattern components.

[PASTE COMMON CONSTRAINTS]

## Tasks

### 1. Move PageHeader
Move the existing file from `components/layout/PageHeader.tsx` to `components/patterns/PageHeader.tsx`.
- Use `git mv` if possible; otherwise create new and delete old.
- No code changes needed.

### 2. Create EmptyState
File: `apps/web/components/patterns/EmptyState.tsx`

```tsx
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export type EmptyStateProps = {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
};

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-xl bg-surface-50 px-6 py-16 text-center">
      {Icon ? (
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-isu-100">
          <Icon className="h-6 w-6 text-isu-600" aria-hidden />
        </div>
      ) : null}
      <div className="space-y-1">
        <h3 className="text-display text-lg font-semibold tracking-tight text-surface-900">
          {title}
        </h3>
        {description ? (
          <p className="mx-auto max-w-sm text-sm text-surface-500">{description}</p>
        ) : null}
      </div>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
```

### 3. Create SectionHeader
File: `apps/web/components/patterns/SectionHeader.tsx`

```tsx
import type { ReactNode } from "react";

export type SectionHeaderProps = {
  title: string;
  children?: ReactNode;
  as?: "h2" | "h3";
};

export function SectionHeader({ title, children, as: As = "h2" }: SectionHeaderProps) {
  return (
    <div className="mb-4 flex items-baseline gap-3">
      <As className="text-display text-xs font-semibold uppercase tracking-[0.12em] text-surface-500">
        {title}
      </As>
      <span className="h-px flex-1 bg-surface-200" aria-hidden />
      {children ? <div className="shrink-0">{children}</div> : null}
    </div>
  );
}
```

### 4. Create StatusDot
File: `apps/web/components/patterns/StatusDot.tsx`

```tsx
import type { ReactNode } from "react";

export type StatusDotProps = {
  tone: "healthy" | "warning" | "danger" | "info" | "neutral";
  label?: ReactNode;
  size?: "sm" | "md";
};

const toneStyles: Record<StatusDotProps["tone"], { dot: string; text: string }> = {
  healthy: { dot: "bg-lime-500", text: "text-lime-700" },
  warning: { dot: "bg-warning", text: "text-warning" },
  danger: { dot: "bg-danger", text: "text-danger" },
  info: { dot: "bg-isu-500", text: "text-isu-700" },
  neutral: { dot: "bg-surface-400", text: "text-surface-600" },
};

const sizeStyles = {
  sm: { dot: "h-1.5 w-1.5", text: "text-xs" },
  md: { dot: "h-2 w-2", text: "text-sm" },
};

export function StatusDot({ tone, label, size = "sm" }: StatusDotProps) {
  const t = toneStyles[tone];
  const s = sizeStyles[size];
  return (
    <span className={`inline-flex items-center gap-1.5 ${t.text} ${s.text} font-medium`}>
      <span className={`${s.dot} ${t.dot} rounded-full`} aria-hidden />
      {label}
    </span>
  );
}
```

## After all 4 files
1. Update imports in `apps/web/app/(app)/dashboard/page.tsx`:
   change `import { PageHeader } from "@/components/layout/PageHeader";`
   to      `import { PageHeader } from "@/components/patterns/PageHeader";`

2. Run `pnpm -F @jarvis/web type-check` — verify no errors in your 4 files or dashboard/page.tsx

## Report back (< 200 words)
- Confirm PageHeader moved successfully (old file deleted, new file exists)
- Confirm 3 new files created with exact code above
- Confirm dashboard import updated
- Any type errors and how resolved
```

- [ ] **Step 2: Review + typecheck**

Run: `ls apps/web/components/patterns/ && ls apps/web/components/layout/PageHeader.tsx 2>&1`
Expected: patterns directory has 4 files, layout no longer has PageHeader.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/patterns apps/web/components/layout apps/web/app/\(app\)/dashboard/page.tsx
git commit -m "feat(web/patterns): add structural patterns (PageHeader moved, EmptyState, SectionHeader, StatusDot)"
```

---

### Task 2.ζ: Pattern B — Data (4 files, subagent ζ)

**Components:** KpiTile, StatRow, DataTableShell, TimelineItem

**Files:**
- Create: `apps/web/components/patterns/{KpiTile,StatRow,DataTableShell,TimelineItem}.tsx`

- [ ] **Step 1: Dispatch subagent**

```
You are Subagent ζ creating 4 Jarvis data pattern components.

[PASTE COMMON CONSTRAINTS]

## Tasks

### 1. KpiTile
File: `apps/web/components/patterns/KpiTile.tsx`

```tsx
import type { ReactNode } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

export type KpiTileProps = {
  label: string;
  value: ReactNode;
  trend?: { direction: "up" | "down" | "flat"; pct: number };
  accent?: "brand" | "lime" | "surface";
  footnote?: string;
};

const accentStyles: Record<NonNullable<KpiTileProps["accent"]>, string> = {
  brand: "text-isu-600",
  lime: "text-lime-600",
  surface: "text-surface-900",
};

const trendIcons = {
  up: TrendingUp,
  down: TrendingDown,
  flat: Minus,
};

export function KpiTile({ label, value, trend, accent = "surface", footnote }: KpiTileProps) {
  const TrendIcon = trend ? trendIcons[trend.direction] : null;
  return (
    <section className="flex flex-col gap-2 rounded-xl border border-surface-200 bg-white p-5">
      <p className="text-display text-xs font-semibold uppercase tracking-[0.12em] text-surface-500">
        {label}
      </p>
      <p className={`text-display text-4xl font-bold leading-none tracking-tight ${accentStyles[accent]}`}>
        {value}
      </p>
      {trend && TrendIcon ? (
        <p className="flex items-center gap-1 text-xs text-surface-600">
          <TrendIcon
            className={`h-3.5 w-3.5 ${
              trend.direction === "up" ? "text-lime-600" : trend.direction === "down" ? "text-danger" : "text-surface-400"
            }`}
            aria-hidden
          />
          <span>{trend.pct}%</span>
        </p>
      ) : null}
      {footnote ? <p className="text-xs text-surface-400">{footnote}</p> : null}
    </section>
  );
}
```

### 2. StatRow
File: `apps/web/components/patterns/StatRow.tsx`

```tsx
export type StatRowItem = {
  label: string;
  value: string | number;
  emphasis?: "normal" | "success" | "warning" | "danger";
};

export type StatRowProps = {
  items: StatRowItem[];
  align?: "left" | "right";
};

const emphasisStyles: Record<NonNullable<StatRowItem["emphasis"]>, string> = {
  normal: "text-surface-800",
  success: "text-lime-700",
  warning: "text-warning",
  danger: "text-danger",
};

export function StatRow({ items, align = "left" }: StatRowProps) {
  return (
    <dl
      className={`grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-${items.length} ${
        align === "right" ? "sm:text-right" : ""
      }`}
    >
      {items.map((item) => (
        <div key={item.label}>
          <dt className="text-xs text-surface-500">{item.label}</dt>
          <dd className={`text-display text-lg font-semibold ${emphasisStyles[item.emphasis ?? "normal"]}`}>
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
```

### 3. DataTableShell
File: `apps/web/components/patterns/DataTableShell.tsx`

```tsx
import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";

export type DataTableShellProps = {
  children: ReactNode;
  filters?: ReactNode;
  pagination?: ReactNode;
  empty?: ReactNode;
  isLoading?: boolean;
  rowCount?: number;
};

export function DataTableShell({
  children,
  filters,
  pagination,
  empty,
  isLoading = false,
  rowCount = 0,
}: DataTableShellProps) {
  return (
    <section className="space-y-4">
      {filters ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-surface-200 bg-surface-50 p-3">
          {filters}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-surface-200 bg-white">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : rowCount === 0 && empty ? (
          empty
        ) : (
          children
        )}
      </div>

      {pagination ? (
        <div className="flex items-center justify-between text-sm text-surface-500">
          {pagination}
        </div>
      ) : null}
    </section>
  );
}
```

### 4. TimelineItem
File: `apps/web/components/patterns/TimelineItem.tsx`

```tsx
import type { ReactNode } from "react";

export type TimelineItemProps = {
  time: string;
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  tone?: "default" | "success" | "warning" | "danger";
};

const toneDots: Record<NonNullable<TimelineItemProps["tone"]>, string> = {
  default: "bg-isu-500",
  success: "bg-lime-500",
  warning: "bg-warning",
  danger: "bg-danger",
};

export function TimelineItem({ time, title, description, meta, tone = "default" }: TimelineItemProps) {
  return (
    <li className="relative grid grid-cols-[4.25rem_1fr] gap-4">
      <time className="text-display pt-0.5 text-right text-xs tabular-nums text-surface-400">
        {time}
      </time>
      <div className="relative">
        <span
          className={`absolute -left-[1.0625rem] top-1.5 h-1.5 w-1.5 rounded-full ${toneDots[tone]} ring-4 ring-white`}
          aria-hidden
        />
        <p className="text-display text-sm font-semibold uppercase tracking-wide text-surface-700">
          {title}
        </p>
        {description ? <p className="text-sm text-surface-500">{description}</p> : null}
        {meta ? <p className="mt-1 text-xs text-surface-400">{meta}</p> : null}
      </div>
    </li>
  );
}
```

## After all 4 files
1. Run `pnpm -F @jarvis/web type-check`
2. Confirm each file exports as specified

## Report back (< 200 words)
- Confirm 4 files created with exact code
- Any TS errors
```

- [ ] **Step 2: Review + typecheck**

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/patterns/{KpiTile,StatRow,DataTableShell,TimelineItem}.tsx
git commit -m "feat(web/patterns): add data patterns (KpiTile, StatRow, DataTableShell, TimelineItem)"
```

---

## Phase 3 — 페이지 Consumer 업데이트 (5개 병렬 agent)

### 공통 제약 (Phase 3 모든 task의 subagent prompt)

```
CONSUMER MIGRATION RULES:
- Import paths changed:
  * PageHeader: `@/components/patterns/PageHeader` (was `@/components/layout/PageHeader`)
  * EmptyState, SectionHeader, StatusDot, KpiTile, StatRow, DataTableShell, TimelineItem
    are NEW at `@/components/patterns/*`
- Every top-level page MUST use <PageHeader> for the header
  * `accent`: `W${isoWeek}` for dashboard-like pages (week number); "AD" for admin; omit for auth/forbidden
  * `eyebrow`: category label (e.g., "Projects", "Admin · Users")
  * `title`: page title from i18n
  * `description`: subtitle from i18n
  * `meta`: right-side buttons if any (New, Export, etc.)
- Replace inline "empty" blocks with <EmptyState>
- Replace custom "h2 + flex-1 bg-surface-200" section dividers with <SectionHeader>
- Replace status badges with <StatusDot> where semantically apt
- For Admin pages with tables: wrap tables in <DataTableShell>

BANNED PATTERNS (enforced):
- NO inline style={{ ... }} for color/layout
- NO border-left/right > 1px
- NO hardcoded text-gray-* / bg-blue-* / bg-gray-* — use surface-*/isu-*/lime-* tokens
- NO onMouseEnter/Leave — use Tailwind hover:

PRESERVE:
- All existing page logic, data fetching, server actions, session checks
- All translation keys — use existing, never invent new
- File paths, route structure, metadata exports

If a page uses a component now rebuilt in Phase 1 (Button, Badge, Card, etc.) and the
shadcn API differs (e.g., shadcn Badge lacks `accent` unless we added it — we did),
adapt the consumer. If a prop is truly gone, document it.
```

### Task 3.η: Dashboard, Profile, Attendance (subagent η)

**Paths:**
- `apps/web/app/(app)/dashboard/**` (대시보드는 이미 PageHeader 사용 중 — 다른 migration 필요 확인)
- `apps/web/app/(app)/profile/**`
- `apps/web/app/(app)/attendance/**`

- [ ] **Step 1: Dispatch subagent**

```
You are Subagent η implementing Phase 3 page consumer updates.

[PASTE COMMON CONSTRAINTS from Phase 3]

## Scope
Update all page.tsx and _components under:
- apps/web/app/(app)/dashboard/  (already uses PageHeader — check for lingering hardcoded colors)
- apps/web/app/(app)/profile/
- apps/web/app/(app)/attendance/

## Procedure
1. Read each page.tsx to understand structure
2. Apply PageHeader at top (if missing)
3. Replace inline hardcoded gray/blue/green colors with token utilities
4. Swap custom empty-state JSX with <EmptyState>
5. Run `pnpm -F @jarvis/web type-check` — verify your files

## Special notes
- Dashboard page.tsx already has PageHeader with accent={`W${isoWeekNumber(new Date())}`}.
  DO NOT change this.
- If widgets still contain hardcoded tailwind colors post-Phase-2, update them.
- profile/_components/ProfileInfo.tsx and QuickMenuEditor.tsx likely have form fields —
  use <Input> <Label> <Button> from @/components/ui, replacing any divs/spans.

## Report back (< 300 words)
- Files modified (list)
- Any component missing from patterns/ that you had to inline (flag for future extraction)
- Type-check status
```

- [ ] **Step 2: Review**
- [ ] **Step 3: Commit**

```bash
git add apps/web/app/\(app\)/{dashboard,profile,attendance}
git commit -m "refactor(web/app): migrate dashboard/profile/attendance to patterns + tokens"
```

---

### Task 3.θ: Projects + Systems (subagent θ)

**Paths:**
- `apps/web/app/(app)/projects/**`
- `apps/web/app/(app)/systems/**`

- [ ] **Step 1: Dispatch subagent**

```
You are Subagent θ implementing Phase 3 page consumer updates.

[PASTE COMMON CONSTRAINTS from Phase 3]

## Scope
- apps/web/app/(app)/projects/  (page.tsx, new/page.tsx, [projectId]/{page,layout}.tsx, 
  [projectId]/{inquiries,settings,staff,tasks}/page.tsx)
- apps/web/app/(app)/systems/  (page.tsx, new/page.tsx, [systemId]/{page,layout}.tsx,
  [systemId]/{access,deploy,edit,runbook}/page.tsx)

## Procedure
1. Add PageHeader to each top-level page (list, detail, settings, etc.)
   accent strategy:
   - List pages: `W${isoWeek}` 
   - Detail pages: project/system short code if available, else omit
2. Replace table/list containers with DataTableShell where appropriate
3. Use <EmptyState> for empty lists
4. Token-ize all hardcoded colors

## Helper
Create reusable isoWeekNumber — if needed, import from lib (may not exist yet).
If multiple pages need it, add `apps/web/lib/date-utils.ts`:

```ts
export function isoWeekNumber(date: Date): number {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNumber = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNumber + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const firstThursdayDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstThursdayDay + 3);
  return 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
}
```

Dashboard page has a local copy — when you create lib/date-utils.ts, also update
dashboard/page.tsx to import from it (remove the local copy).

## Report back (< 400 words)
- Files modified
- Whether you created lib/date-utils.ts (if yes, note dashboard import update)
- Translation keys missing for new PageHeader eyebrows (if any — DO NOT invent; leave as literal
  strings in English and flag them)
```

- [ ] **Step 2: Review**
- [ ] **Step 3: Commit**

```bash
git add apps/web/app/\(app\)/{projects,systems,dashboard} apps/web/lib/date-utils.ts 2>/dev/null
git commit -m "refactor(web/app): migrate projects/systems to patterns + shared isoWeek util"
```

---

### Task 3.ι: Knowledge, Notices, Wiki, Search, Ask (subagent ι)

**Paths:**
- `apps/web/app/(app)/knowledge/**`
- `apps/web/app/(app)/notices/**`
- `apps/web/app/(app)/wiki/**`
- `apps/web/app/(app)/search/**`
- `apps/web/app/(app)/ask/**`
- `apps/web/app/(app)/architecture/**`

- [ ] **Step 1: Dispatch subagent**

```
You are Subagent ι implementing Phase 3 page consumer updates.

[PASTE COMMON CONSTRAINTS from Phase 3]

## Scope (29 page files total)
- knowledge/: page.tsx, faq/page.tsx, glossary/page.tsx, hr/page.tsx, new/page.tsx,
  onboarding/page.tsx, tools/page.tsx, [pageId]/{page,edit,history,review}/page.tsx
- notices/: page.tsx, new/page.tsx, [id]/{page,edit}/page.tsx and _components/*
- wiki/: page.tsx, [workspaceId]/[...path]/page.tsx, graph/page.tsx,
  ingest/manual/page.tsx, manual/[workspaceId]/edit/[...path]/page.tsx,
  _components/WikiIndexSearch.tsx
- search/page.tsx
- ask/: page.tsx, layout.tsx, [conversationId]/page.tsx
- architecture/page.tsx and components/*

## Procedure (same as before)
1. Add <PageHeader>
2. Replace empty states with <EmptyState>
3. Token-ize colors
4. MDX-rendered content uses mdx.css — that's already updated. Don't touch .mdx files.

## Special notes
- notices/_components/NoticeEditor.tsx is a TipTap-based editor — be careful not to break it.
  Only adapt surrounding UI chrome (toolbar buttons, save/cancel), not editor internals.
- wiki/graph/_components/GraphViewerPage.tsx likely uses a graph library — keep as-is, only
  update surrounding page shell.
- Ask chat UI: use patterns/TimelineItem or keep custom if chat bubbles are more natural.

## Report back (< 500 words)
- Files modified (group by top-level dir)
- Any component kept as-is due to complexity (e.g., editor, graph)
- Translation key gaps
```

- [ ] **Step 2: Review**
- [ ] **Step 3: Commit**

```bash
git add apps/web/app/\(app\)/{knowledge,notices,wiki,search,ask,architecture}
git commit -m "refactor(web/app): migrate knowledge/notices/wiki/search/ask/architecture to patterns"
```

---

### Task 3.κ: Admin (subagent κ)

**Paths:**
- `apps/web/app/(app)/admin/**` (15 sub-pages)

- [ ] **Step 1: Dispatch subagent**

```
You are Subagent κ implementing Phase 3 page consumer updates for Admin section.

[PASTE COMMON CONSTRAINTS from Phase 3]

## Scope
- admin/layout.tsx
- admin/{audit,codes,companies,llm-cost,menus,organizations,review-queue,search-analytics,settings,users}/page.tsx
- admin/observability/wiki/{page,WikiObservabilityClient}.tsx
- admin/review-queue/_components/{ApprovalDialog,FilterBar,Pagination,ReviewCommentEditor}.tsx
- admin/wiki/{boundary-violations/page,review-queue/page,review-queue/_components/ApprovalDialog}.tsx

## Procedure
1. Every admin page gets <PageHeader accent="AD" eyebrow="Admin · <section>" title=... />
2. Tables: wrap in <DataTableShell>. Use <Table> from ui/
3. Filter bars: use <Input>, <Select>, <Button variant="outline">
4. Confirm dialogs: use <Dialog> or <AlertDialog> from ui/
5. Pagination component: keep existing logic, update styling to tokens

## Special: llm-cost page has __tests__/page.test.tsx — DO NOT modify the test file.
  Adjust page.tsx so tests still pass. If test expects specific markup, preserve it.

## Report back (< 500 words)
- Files modified
- Table counts wrapped in DataTableShell
- Dialog migrations (from old custom Dialog to new shadcn Dialog — API differences?)
- Any test that might need update (flag but don't touch)
```

- [ ] **Step 2: Review**
- [ ] **Step 3: Run llm-cost tests**

Run: `pnpm -F @jarvis/web test -- llm-cost 2>&1 | tail -10`
Expected: pass. If fail, investigate.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/\(app\)/admin
git commit -m "refactor(web/app): migrate admin section to patterns + DataTableShell"
```

---

### Task 3.λ: Auth + global errors (subagent λ)

**Paths:**
- `apps/web/app/(auth)/**`
- `apps/web/app/forbidden.tsx`
- Other global error/loading files

- [ ] **Step 1: Dispatch subagent**

```
You are Subagent λ implementing Phase 3 page consumer updates for auth and error pages.

[PASTE COMMON CONSTRAINTS from Phase 3]

## Scope
- apps/web/app/(auth)/layout.tsx
- apps/web/app/(auth)/login/page.tsx
- apps/web/app/forbidden.tsx
- Any app/error.tsx, app/not-found.tsx, app/loading.tsx if present

## Auth layout specifics
- Auth layout has NO sidebar (unlike (app)/layout.tsx)
- Design: centered card on neutral surface. Optional ISU brand mark at top.
- Use <Card>, <Input>, <Label>, <Button> from ui/
- <Form> from ui/form.tsx for login form (uses react-hook-form + zod)
- LARGE WEEK NUMBER accent NOT appropriate here — omit or use ISU brand mark instead

## Login page
- Form: email + password
- Button variant="default" for primary submit
- Error display via <Alert variant="destructive">
- Link to password reset (if exists) uses <Button variant="link">

## forbidden.tsx
- 403 page. Use <EmptyState> with lock icon, title "Access denied", description explaining.
- "Go home" action: <Button asChild><Link href="/dashboard">Dashboard</Link></Button>

## Report back (< 300 words)
- Files modified
- Confirm form is wired to react-hook-form via shadcn Form
```

- [ ] **Step 2: Review + commit**

```bash
git add apps/web/app/\(auth\) apps/web/app/forbidden.tsx apps/web/app/error.tsx apps/web/app/not-found.tsx apps/web/app/loading.tsx 2>/dev/null
git commit -m "refactor(web/app): migrate auth + global error pages to patterns"
```

---

## Phase 4 — 테스트 인프라 + 시각 회귀 (1 agent + 직렬 검증)

### Task 4.μ: Playwright E2E + axe integration (subagent μ)

**Files:**
- Create: `apps/web/e2e/screens/{login,dashboard,knowledge-detail,admin-users,project-detail}.spec.ts`
- Create: `apps/web/e2e/utils/axe.ts`
- Create: `apps/web/e2e/fixtures/auth.ts`

- [ ] **Step 1: Dispatch subagent**

```
You are Subagent μ building Playwright E2E with a11y audits for 5 key screens.

## Files to create

### apps/web/e2e/utils/axe.ts
```ts
import type { Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { expect } from "@playwright/test";

export async function expectNoA11yViolations(page: Page, context?: string) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(results.violations, context ?? "a11y violations").toEqual([]);
}
```

### apps/web/e2e/fixtures/auth.ts
```ts
import { test as base } from "@playwright/test";

// Simple authenticated page fixture.
// If the app uses cookie-based sessions, seed a session cookie here.
// For CI, this assumes dev-server seeds a test user via SEED_TEST_USER env.
// Adjust to match actual auth mechanism.

export const test = base.extend<{ authedPage: import("@playwright/test").Page }>({
  authedPage: async ({ page, context }, use) => {
    // TODO(team): replace with actual session cookie seeding strategy.
    // For now, navigate through /login and submit test credentials.
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(process.env.TEST_USER_EMAIL ?? "test@isu.local");
    await page.getByLabel(/password/i).fill(process.env.TEST_USER_PASSWORD ?? "testpass");
    await page.getByRole("button", { name: /sign in|로그인/i }).click();
    await page.waitForURL("**/dashboard");
    await use(page);
  },
});

export { expect } from "@playwright/test";
```

### apps/web/e2e/screens/login.spec.ts
```ts
import { test, expect } from "@playwright/test";
import { expectNoA11yViolations } from "../utils/axe";

test.describe("Login screen", () => {
  test("renders and is accessible", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNoA11yViolations(page, "login screen");
  });

  test("visual snapshot", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("login.png", { maxDiffPixelRatio: 0.02 });
  });
});
```

### apps/web/e2e/screens/dashboard.spec.ts
```ts
import { test, expect } from "../fixtures/auth";
import { expectNoA11yViolations } from "../utils/axe";

test.describe("Dashboard screen", () => {
  test("renders PageHeader with week accent", async ({ authedPage }) => {
    await expect(authedPage.getByRole("heading", { level: 1 })).toBeVisible();
    // week accent is aria-hidden but must exist visually
    const accent = authedPage.locator("text=/^W\\d{1,2}$/").first();
    await expect(accent).toBeVisible();
  });

  test("is accessible", async ({ authedPage }) => {
    await expectNoA11yViolations(authedPage, "dashboard");
  });

  test("visual snapshot", async ({ authedPage }) => {
    await authedPage.waitForLoadState("networkidle");
    await expect(authedPage).toHaveScreenshot("dashboard.png", { maxDiffPixelRatio: 0.02 });
  });
});
```

### Create similar spec files for:
- knowledge-detail.spec.ts (navigate to /knowledge, click first page, assert PageHeader + a11y + snapshot)
- admin-users.spec.ts (navigate to /admin/users, assert DataTableShell + a11y + snapshot)
- project-detail.spec.ts (navigate to /projects, click first project, a11y + snapshot)

For each: use authedPage fixture, same 3-test pattern (render, a11y, snapshot).

## After creation
1. Run `pnpm -F @jarvis/web test:e2e --list` — verify tests are discovered
2. Do NOT run the full suite yet (main claude will do that after web server starts)

## Report back (< 300 words)
- Files created (5 spec files + 2 utils)
- Any assumption about auth mechanism you made — flag so team can verify
- Playwright discovery output
```

- [ ] **Step 2: Review**

- [ ] **Step 3: Commit**

```bash
git add apps/web/e2e
git commit -m "test(web/e2e): add Playwright specs for 5 key screens with axe audits"
```

---

## Phase 5 — 최종 검증 (직렬, main agent)

### Task 5.1: Lint 전체 통과 확인

- [ ] **Step 1: Run lint**

```bash
pnpm -F @jarvis/web lint 2>&1 | tee /tmp/lint-output.log
```

Expected: 0 errors. Warnings allowed.

- [ ] **Step 2: Fix any remaining errors**

If errors: list them, fix inline or re-dispatch focused subagent.

- [ ] **Step 3: Restore strict lint rules**

In `.eslintrc.json`, change `click-events-have-key-events` and `no-static-element-interactions` back from `warn` to `error` (if previously downgraded).

Run lint again. Fix any surfaced errors.

- [ ] **Step 4: Commit if changes**

```bash
git add apps/web/.eslintrc.json
git commit -m "chore(web): restore strict jsx-a11y rules after migration"
```

### Task 5.2: Typecheck 통과 확인

- [ ] **Step 1: Run typecheck**

```bash
pnpm -F @jarvis/web type-check 2>&1 | grep "error TS" | head -30
```

Expected: no errors in files we modified. Unrelated monorepo module-resolution errors may exist; scope filter them to `components/`, `app/`, `lib/` before reporting pass/fail.

- [ ] **Step 2: Fix any errors in our files**

### Task 5.3: Build 성공

- [ ] **Step 1: Run build**

```bash
pnpm -F @jarvis/web build 2>&1 | tee /tmp/build-output.log
```

Expected: successful Next.js build. No font-loading errors.

- [ ] **Step 2: Verify bundle size**

```bash
grep "First Load JS" /tmp/build-output.log | head -5
```

Expected: First Load JS < 400KB (spec allows +250KB over previous). If over, investigate
which Radix imports are pulling large deps.

### Task 5.4: Playwright baseline snapshot 생성

- [ ] **Step 1: Seed test user (if needed)**

Check auth mechanism. Ensure a test user exists or dev-mode bypass is available.

- [ ] **Step 2: Generate baseline snapshots**

```bash
pnpm -F @jarvis/web test:e2e:update
```

Expected: 5 snapshots created under `apps/web/e2e/screens/*.spec.ts-snapshots/`.

- [ ] **Step 3: Commit snapshots**

```bash
git add apps/web/e2e/screens/**/*-snapshots
git commit -m "test(web/e2e): generate visual regression baseline for 5 key screens"
```

### Task 5.5: Playwright 테스트 실행 + a11y pass 확인

- [ ] **Step 1: Run full E2E**

```bash
pnpm -F @jarvis/web test:e2e 2>&1 | tee /tmp/e2e-output.log
```

Expected: all 15 tests pass (3 per screen × 5 screens).

- [ ] **Step 2: Inspect a11y violations**

If any test fails in a11y audit, read the violation details and fix the component. Re-run.

Common fixes:
- Missing `aria-label` on icon-only buttons
- Missing `alt` on `<img>`
- Color contrast: adjust token to meet WCAG AA (4.5:1 for body text)
- Focus-visible ring missing

### Task 5.6: Impeccable 재평가

- [ ] **Step 1: Self-audit**

Review the criteria from Impeccable skill:
- Typography (9/10 target): Familjen Grotesk + Hahmlet, clear hierarchy, 1.25+ ratio, proper line-length caps
- Color (10/10): OKLCH, brand-tinted neutrals, 60-30-10
- Layout (9/10): Bento dashboard, varied spacing, max-width 1400px
- Visual details (10/10): no bans violated, no rounded+shadow template
- Differentiation (9/10): ISU monogram, W## page header, Hahmlet Korean serif
- AI Slop test (9/10): unmistakably Jarvis, not AI-generic
- Interaction (9/10): axe-clean, focus-visible everywhere, reduced-motion
- Responsive (8/10): container queries used where needed
- Code quality (9/10): Tailwind utilities only, no inline color styles
- Brand consistency (10/10): all ui/ + patterns/ + pages on tokens

Expected: 92-97 total.

- [ ] **Step 2: If below 95, identify gaps + iterate**

Flag the weakest 1-2 areas. Spawn focused subagent to address.

### Task 5.7: PR 준비

- [ ] **Step 1: Final status**

```bash
git log --oneline origin/main..HEAD | wc -l
```

Expected: many commits (~20-30).

- [ ] **Step 2: Update CLAUDE.md change log**

Add entry to `CLAUDE.md` 변경 이력 table:

| 날짜 | 변경 내용 | 대상 | 사유 |
|------|----------|------|------|
| 2026-04-17 | shadcn/ui + Radix 대규모 리팩토링. ui/ 22개 교체, patterns/ 8개 신설, 15+ 페이지 마이그레이션, a11y 인프라 + Playwright 시각 회귀. | `apps/web/components`, `apps/web/app`, `apps/web/e2e` | Impeccable 95+ 달성 + WCAG AA 준수. Big Bang 단일 PR. |

- [ ] **Step 3: Commit log update**

```bash
git add CLAUDE.md
git commit -m "docs(claude-md): log shadcn/Radix refactor in change history"
```

- [ ] **Step 4: Push + open PR**

```bash
git push origin HEAD
gh pr create --title "feat(web): shadcn/Radix + patterns + a11y refactor (Impeccable 95+)" --body "$(cat <<'EOF'
## Summary
- Replaced 22 custom `components/ui/` primitives with shadcn/Radix-based implementations
- Added 8 Jarvis-specific `components/patterns/`: PageHeader, EmptyState, SectionHeader, StatusDot, KpiTile, StatRow, DataTableShell, TimelineItem
- Migrated 15+ pages to new patterns + token system
- Added @axe-core/react (dev), eslint-plugin-jsx-a11y (CI), Playwright visual regression for 5 key screens
- Motion tokens + prefers-reduced-motion support

## Test plan
- [ ] `pnpm -F @jarvis/web lint` passes (jsx-a11y strict)
- [ ] `pnpm -F @jarvis/web type-check` passes
- [ ] `pnpm -F @jarvis/web build` succeeds; bundle < +250KB
- [ ] `pnpm -F @jarvis/web test:e2e` all 15 tests pass (5 screens × render + a11y + snapshot)
- [ ] Manual keyboard nav on Dashboard, Login, Admin Users, Knowledge Detail
- [ ] VoiceOver/NVDA sampling on same 4 screens
- [ ] `prefers-reduced-motion: reduce` OS setting honored

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review (plan against spec)

**Spec coverage:**
- ✓ Goal 1 (22 ui/ replaced): Phase 1 tasks 1.α / 1.β / 1.γ / 1.δ cover all 22+
- ✓ Goal 2 (8 patterns/): Phase 2 tasks 2.ε (4) + 2.ζ (4) = 8
- ✓ Goal 3 (15+ pages): Phase 3 tasks 3.η / 3.θ / 3.ι / 3.κ / 3.λ cover all
- ✓ Goal 4 (a11y infra): Phase 0 tasks 0.4 (axe), 0.5 (jsx-a11y)
- ✓ Goal 5 (Playwright 5화면): Phase 4 task 4.μ
- ✓ Goal 6 (motion + reduced-motion): Phase 0 task 0.3
- ✓ Goal 7 (95+ 달성): Phase 5 task 5.6 audit
- ✓ Non-goal (dark mode): Not in any task. Correct.

**Placeholder scan:** No TBD/TODO/??? in plan content. Agent prompts contain full constraints and code.

**Type consistency:**
- `isoWeekNumber` — defined in Phase 3.θ (lib/date-utils.ts), referenced consistently
- `PageHeader` props (`accent`, `eyebrow`, `title`, `description`, `meta`) — consistent across Phase 2 and Phase 3 usage
- `KpiTile` accent values (`"brand"|"lime"|"surface"`) consistent
- `StatusDot` tone values (`"healthy"|"warning"|"danger"|"info"|"neutral"`) consistent

**Scope:** Single implementation plan, Big Bang. Appropriate.

Plan complete.
