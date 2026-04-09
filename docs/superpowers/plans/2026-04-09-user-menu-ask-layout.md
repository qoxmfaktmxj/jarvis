# User Menu And Ask AI Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move profile access into the top-right user menu, add logout and future theme settings entry points, and rework Ask AI into a bottom-composer chat layout.

**Architecture:** Keep navigation behavior explicit in layout components rather than generating it dynamically. Implement a dedicated client-side user menu in the top bar, remove the duplicated sidebar profile entry, and restructure Ask AI so empty and active states share a single bottom-anchored composer layout.

**Tech Stack:** Next.js App Router, React client components, existing local UI primitives, Tailwind CSS, Playwright browser verification, Vitest.

---

### Task 1: Document navigation ownership and remove duplicate profile entry

**Files:**
- Modify: `apps/web/components/layout/Sidebar.tsx`
- Modify: `apps/web/components/layout/AppShell.tsx`

- [ ] **Step 1: Confirm sidebar navigation is hardcoded**

Read `apps/web/components/layout/Sidebar.tsx` and verify that `navItems` explicitly includes `/profile`.

- [ ] **Step 2: Remove the sidebar Profile link**

Delete the `/profile` entry from the hardcoded `navItems` array and keep admin navigation unchanged.

- [ ] **Step 3: Verify AppShell still renders the same top-level layout**

Ensure `AppShell` still renders `Topbar`, `Sidebar`, and `<main>` with the same layout offsets.

### Task 2: Add top-right user dropdown menu

**Files:**
- Create: `apps/web/components/layout/UserMenu.tsx`
- Modify: `apps/web/components/layout/Topbar.tsx`

- [ ] **Step 1: Create a dedicated user menu client component**

Implement a client component that renders avatar, user name, and chevron as a toggleable menu trigger. Menu items:
- `Profile` -> link to `/profile`
- `테마 설정` -> disabled row with `준비 중` badge
- `로그아웃` -> submit `POST /api/auth/logout`

- [ ] **Step 2: Swap Topbar profile link for the new user menu**

Replace the existing `/profile` link in `Topbar.tsx` with `<UserMenu userName={userName} />`.

- [ ] **Step 3: Keep room for future settings expansion**

Build menu item rendering so `테마 설정` can later become a nested theme chooser without changing the trigger structure.

### Task 3: Rework Ask AI into a bottom-composer chat screen

**Files:**
- Modify: `apps/web/app/(app)/ask/page.tsx`
- Modify: `apps/web/components/ai/AskPanel.tsx`

- [ ] **Step 1: Keep the page header stable and move layout responsibility into AskPanel**

Leave the page-level title section in `ask/page.tsx`, but stop centering the input container near the top.

- [ ] **Step 2: Make empty state feel like a real chat product**

In `AskPanel.tsx`, when there is no conversation yet:
- keep suggestion chips above the composer
- add a lightweight empty-state message or illustration block
- anchor the composer near the bottom of the available panel height

- [ ] **Step 3: Keep active conversation in a chat-like layout**

When there is history or streaming content:
- conversation scroll area fills available height
- composer stays at the bottom
- reset/send controls remain in the composer

### Task 4: Add regression coverage and verify in browser

**Files:**
- Create: `apps/web/app/page.test.tsx`
- Modify or create only if useful: related lightweight tests near changed files

- [ ] **Step 1: Add a root redirect regression test**

Verify `/` redirects to `/dashboard` through `app/page.tsx`.

- [ ] **Step 2: Run focused validation**

Run:
- `pnpm --filter=@jarvis/web type-check`
- `pnpm --filter=@jarvis/web test`
- `pnpm --filter=@jarvis/web build`

- [ ] **Step 3: Re-verify in browser**

Check these flows on `http://localhost:3010`:
- unauthenticated `/` lands on `/login?redirect=%2Fdashboard`
- top-right user trigger opens dropdown
- dropdown contains `Profile`, disabled `테마 설정`, `로그아웃`
- `Profile` navigates to `/profile`
- `로그아웃` clears session and returns to `/login`
- Ask AI empty state shows bottom-anchored composer

