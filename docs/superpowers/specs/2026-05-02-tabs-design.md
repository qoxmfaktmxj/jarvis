# Tabs (Multi-Screen Switcher) — Design Spec

**Date:** 2026-05-02
**Status:** Brainstorming complete, awaiting user spec review → writing-plans
**Scope:** Global tab feature for Jarvis web app. Allows users to keep multiple screens open and switch between them without losing in-progress edits.

---

## 1. Problem & Goal

Jarvis users (5,000-person enterprise) come from a JSP-based legacy ERP where iframe-style tabs let them keep multiple screens open simultaneously, with all in-progress edits preserved. The current Next.js App Router implementation re-renders pages on every navigation, so any unsaved form input or grid edit is lost the moment the user clicks away.

**Goal.** Introduce a tab strip in the Topbar that:

1. Lets users return to previously-opened screens with a single click.
2. Preserves in-progress form input and grid dirty rows across tab switches (server data may refetch — small flicker accepted).
3. Doesn't add vertical chrome to the page (Topbar slot only — no extra row above or below).

**Non-goals (out of scope for this spec):**

- True page keep-alive (full DOM persistence across switches — iframe-based or custom router). Rejected for memory cost and Next.js RSC conflict.
- Cross-session persistence (yesterday's tabs reappearing today). `sessionStorage`-only.
- Drag-to-reorder tabs. Phase 2 candidate.
- "Recently closed" tab restore (Ctrl+Shift+T). User explicitly opted out.
- Tab duplicate. User explicitly opted out.
- Visual polish (final colors, typography, animations). Deferred to Phase 4 with `frontend-design` / `impeccable` / `ui-ux-pro-max`.

---

## 2. Decisions Locked In Brainstorming

| Area | Decision |
|------|----------|
| State preservation strategy | **Option B** — form input + grid dirty rows preserved via `TabContext` + `useTabState` hook; server data refetches on return (overlay merges dirty rows back on top by row id). |
| Tab placement | **Option C** — inside Topbar, replacing the left-side route label. Topbar height stays at 52px (`--topbar-height` CSS var unchanged); tabs vertically centered to 36px tall with 8px top/bottom padding. |
| Max tabs | **5**, including pinned tabs. |
| LRU eviction | When 6th tab opens, the least-recently-visited non-pinned tab closes. |
| Tab creation | **Auto** — clicking a sidebar item or a CommandPalette result either focuses an existing tab (if pathname matches) or opens a new one. |
| Same URL behavior | **Focus existing tab** — no duplicate tabs for the same pathname. |
| Tab key | **pathname only** (without search params). `/admin/companies?q=foo` and `/admin/companies?q=bar` share one tab; filters live in the tab's internal state. `/knowledge/123` and `/knowledge/456` are different tabs (different pathnames). |
| Persistence | **`sessionStorage`** — survives F5 reload, dies on browser close. |
| Right-click menu items | 탭 닫기 / 왼쪽 닫기 / 오른쪽 닫기 / 모두 닫기 / 다른 탭 모두 닫기 / 핀 고정 (toggle) / 새로고침 (데이터만). No "duplicate", no "recently closed". |
| Keyboard shortcuts | `Ctrl+W` (close current), `Ctrl+Tab` (next), `Ctrl+Shift+Tab` (prev), `Ctrl+1`–`Ctrl+5` (jump to N). |
| Close UI | **X button only** — no middle-click close. |
| Dirty close UX | Reuse [`UnsavedChangesDialog`](apps/web/app/(app)/admin/companies/_components/UnsavedChangesDialog.tsx) — buttons: 닫기(변경 버림) / 저장 후 닫기 / 취소. |
| Pin policy | Pinned tabs counted within the 5-tab limit. |
| All-5-pinned + new tab | **Toast block** — "탭 5개 모두 핀 고정됨. 핀 해제 후 다시 시도하세요." New tab does not open. |
| Dirty tab as LRU eviction target | **Option B (resolved as final B)** — show `UnsavedChangesDialog` inline; on discard/save proceed with eviction + new tab; on cancel, abort the new tab open entirely. Dialog title clearly names the tab being closed (e.g., "회사관리 탭이 닫힙니다"). |

---

## 3. Architecture

### 3.1 Component Layers

```
TabProvider  (Client Context, mounted in AppShell)
  ├── tabs: Tab[]                        // ordered creation
  ├── activeKey: TabKey | null
  ├── tabStates: Map<TabKey, Map<StateKey, unknown>>
  ├── pinnedSet: Set<TabKey>
  ├── dirtySet: Set<TabKey>
  └── Actions: openTab / closeTab / focusTab / pinTab / unpinTab
              / setDirty / setTabState / reload / closeBatch

TabBar        (UI, lives in Topbar's left slot)
  └── TabContextMenu (right-click, portaled)

useTabState<T>(stateKey, defaultValue, options?)
  ↳ used by page client components to mirror their state into TabContext

useTabHotkeys()
  ↳ window-level keydown handler, mounted once in AppShell

useTabDirty(isDirty)
  ↳ thin wrapper: pushes a boolean into TabContext.dirtySet for the current tab
```

### 3.2 Files

**New (under `apps/web/components/layout/tabs/`):**

| File | Purpose |
|------|---------|
| `tab-types.ts` | `Tab`, `TabKey`, `StateKey`, `TabContextValue` types |
| `TabContext.tsx` | Provider component + `useTabContext()` consumer hook |
| `tab-persistence.ts` | `loadFromSession()` / `saveToSession()` debounced sessionStorage helpers |
| `tab-key.ts` | `pathname → TabKey` derivation, title fallback lookup |
| `TabBar.tsx` | Renders the strip; tab item with pin / dirty / X / active states |
| `TabContextMenu.tsx` | Right-click portal menu + 7 actions |
| `useTabState.ts` | Page-side hook: `[state, setState] = useTabState(key, default, { overlay? })` |
| `useTabDirty.ts` | Thin hook: `useTabDirty(isDirty)` |
| `useTabHotkeys.ts` | Window keydown handler |
| `__tests__/TabContext.test.tsx` | Unit: open / close / focus / LRU / pin / dirty paths |
| `__tests__/useTabState.test.tsx` | Unit: cache restore, isolation, overlay |
| `__tests__/tab-persistence.test.ts` | Unit: sessionStorage round-trip, debounce |

**Modified:**

| File | Change |
|------|--------|
| [`apps/web/components/layout/AppShell.tsx`](apps/web/components/layout/AppShell.tsx) | Wrap children in `<TabProvider>`; mount `useTabHotkeys` |
| [`apps/web/components/layout/Topbar.tsx`](apps/web/components/layout/Topbar.tsx) | Replace `routeLabel(pathname)` block with `<TabBar />`; reduce search button width if needed |
| [`apps/web/components/layout/Sidebar.tsx`](apps/web/components/layout/Sidebar.tsx) | Intercept `<Link>` clicks: `e.preventDefault()` → `await openTab(href, label)` → `router.push` if returned `true` |
| [`apps/web/components/layout/CommandPalette.tsx`](apps/web/components/layout/CommandPalette.tsx) | Same intercept on result selection |
| [`apps/web/messages/ko.json`](apps/web/messages/ko.json) | New `Tabs.*` namespace (see §6) |
| [`apps/web/app/(app)/admin/companies/_components/CompaniesGrid.tsx`](apps/web/app/(app)/admin/companies/_components/CompaniesGrid.tsx) | Phase 3 POC: opt into `useTabState` + `useTabDirty` |
| [`apps/web/app/(app)/admin/companies/_components/UnsavedChangesDialog.tsx`](apps/web/app/(app)/admin/companies/_components/UnsavedChangesDialog.tsx) | Generalize props (i18n title/body via interpolation; reused from tabs) |
| `apps/web/e2e/tabs.spec.ts` | New E2E covering 6 scenarios (see §7) |

### 3.3 Module Boundaries

- `tabs/` is a self-contained UI module. Its only outside imports are `next/navigation` (`usePathname`, `useRouter`), `next-intl`, and `lucide-react`.
- Pages depend on `tabs/useTabState` and `tabs/useTabDirty` — they should never read `TabContext` directly.
- `Topbar` / `Sidebar` / `CommandPalette` interact only via `useTabContext()`'s public actions — never poke `tabStates` directly.

---

## 4. Data Model

### 4.1 Types

```ts
type TabKey = string;        // = pathname, e.g. "/admin/companies"
type StateKey = string;      // sub-key within a tab, e.g. "grid" | "filters"

interface Tab {
  key: TabKey;               // primary identifier
  url: string;               // last-known full URL including search params
  title: string;             // display label (fallback to ROUTE_LABELS / "(제목 없음)")
  icon?: string;             // optional lucide icon name (lookup via icon-map)
  pinned: boolean;
  createdAt: number;         // epoch ms
  lastVisitedAt: number;     // epoch ms (drives LRU)
}

interface TabContextValue {
  tabs: Tab[];                                    // creation order
  activeKey: TabKey | null;
  tabStates: ReadonlyMap<TabKey, ReadonlyMap<StateKey, unknown>>;
  isDirty(key: TabKey): boolean;

  openTab(url: string, fallbackTitle: string): Promise<boolean>;
  closeTab(key: TabKey, opts?: { skipDirtyCheck?: boolean }): Promise<boolean>;
  closeBatch(predicate: (t: Tab) => boolean): Promise<void>;
  focusTab(key: TabKey): void;
  pinTab(key: TabKey): void;
  unpinTab(key: TabKey): void;
  setDirty(key: TabKey, dirty: boolean): void;
  setTabState(key: TabKey, stateKey: StateKey, value: unknown): void;
  setTabTitle(key: TabKey, title: string): void;
  reload(): void;                                 // active tab only — calls router.refresh()
  registerSaveHandler(
    key: TabKey,
    handler: () => Promise<{ ok: boolean }>,
  ): () => void;                                  // returns unregister fn; used by "save and close"
}
```

### 4.2 sessionStorage Schema

Single key `jarvis:tabs:v1` holding:

```jsonc
{
  "version": 1,
  "tabs": [ { "key": "/admin/companies", "url": "/admin/companies?q=foo", "title": "회사관리", "pinned": false, "createdAt": 1714000000000, "lastVisitedAt": 1714003600000 } ],
  "activeKey": "/admin/companies",
  "tabStates": {
    "/admin/companies": {
      "grid": { "dirtyRows": { "id-42": { "name": "edited" } }, "newRows": [...], "deletedIds": [] },
      "filters": { "q": "foo" }
    }
  }
  // pinnedSet is reconstructable from tabs[].pinned, dirtySet is per-runtime only (not persisted)
}
```

Writes are debounced 500ms; reads happen once at provider mount. `dirtySet` is not persisted — it's a runtime indicator that resets to whatever the page reports on its next mount.

---

## 5. Key Flows

### 5.1 Open Tab (sidebar / CommandPalette click)

```
User clicks <Link href="/admin/menus">메뉴관리</Link>
  ├── e.preventDefault()
  ├── ok = await tabContext.openTab("/admin/menus", "메뉴관리")
  │     ├── existing = tabs.find(t => t.key === "/admin/menus")
  │     ├── if existing → focusTab; return true
  │     ├── if tabs.length < 5 → push new tab; return true
  │     ├── else (5 full):
  │     │     ├── unpinned = tabs.filter(t => !t.pinned)
  │     │     ├── if unpinned.length === 0 → toast(Tabs.limit.allPinned); return false
  │     │     ├── victim = unpinned.sortBy(lastVisitedAt asc)[0]
  │     │     ├── if isDirty(victim.key):
  │     │     │     ├── result = await openUnsavedDialog(victim)
  │     │     │     ├── result === "discard" → closeTab(victim, { skipDirtyCheck: true }); push new
  │     │     │     ├── result === "save" → page.save() → closeTab(victim); push new
  │     │     │     └── result === "cancel" → return false
  │     │     └── else → closeTab(victim); push new; return true
  └── if ok → router.push("/admin/menus")
```

### 5.2 Switch Tab

```
User clicks tab "메뉴관리" in TabBar
  ├── focusTab("/admin/menus")  → updates activeKey + lastVisitedAt
  └── router.push(tab.url)       → Next.js fetches RSC tree
       ├── currently-mounted page → unmount → useTabState cleanup flushes final state to sessionStorage
       └── target page mounts → useTabState reads cache → useState initial value restored
            └── server data overlay: when fresh data arrives, run options.overlay(cached, fresh) to keep dirty rows on top
```

### 5.3 Reload (data only) — active tab only

```
User right-clicks active tab → "새로고침 (데이터만)"
  └── tabContext.reload() → router.refresh()
       └── Next.js refetches RSC tree; client components stay mounted;
           useTabState cache preserved; overlay re-applies dirty rows.
```

Reload is **only available on the active tab** — the menu item is hidden (or disabled) on inactive tabs. To reload an inactive tab, the user focuses it first then triggers reload. This avoids needing a "stale" flag and per-tab refresh state machine.

`router.refresh()` re-fetches RSC trees but **does not unmount client components**, so `useTabState` cache stays alive and the overlay function reapplies dirty rows on top of fresh server data. This is the elegance of Option B over a true keep-alive.

### 5.4 Close Tab (X button or Ctrl+W)

```
closeTab(key)
  ├── if isDirty(key):
  │     ├── result = await openUnsavedDialog(tab)
  │     ├── result === "discard" → proceed
  │     ├── result === "save" → handler = saveHandlers.get(key); await handler()
  │     │     ├── if !handler → fall back to "discard" path with warn (page failed to register)
  │     │     ├── if { ok: true } → proceed
  │     │     └── if { ok: false } → abort; show error toast (validation failure, etc.)
  │     └── result === "cancel" → return false
  ├── remove from tabs[]
  ├── delete tabStates[key]
  ├── if was active → activate neighbor (right preferred, then left)
  └── persist
```

Save handlers are registered by pages via `useEffect` calling `tabContext.registerSaveHandler(currentKey, async () => {...})` and unregistered on unmount. Pages without a registered handler fall through "save and close" as if the user had picked "discard" (with a dev-warning).

### 5.5 First Visit / Direct URL Entry

```
User pastes /knowledge/foo into address bar
  └── AppShell mount → TabProvider effect:
       └── if !tabs.find(t => t.key === pathname) → openTab(pathname, deriveTitleFromMenuTree(pathname))
```

Title derivation order:
1. `menuTree` lookup by `routePath` match (passed down from layout RSC).
2. `ROUTE_LABELS` fallback (existing static map).
3. `"(제목 없음)"`.

### 5.6 Workspace Scope (future-proofing)

Jarvis currently has no workspace-switcher UI; the user's workspaceId is fixed for the session. The sessionStorage key is suffixed with workspaceId (`jarvis:tabs:v1:<workspaceId>`) so that, if a workspace switcher is ever introduced, tab lists stay scoped per workspace. No code change is required when that feature lands — the key namespace handles it.

---

## 6. i18n Keys (`apps/web/messages/ko.json`, namespace `Tabs`)

```jsonc
{
  "Tabs": {
    "contextMenu": {
      "close": "탭 닫기",
      "closeLeft": "왼쪽 탭 닫기",
      "closeRight": "오른쪽 탭 닫기",
      "closeAll": "모든 탭 닫기",
      "closeOthers": "다른 탭 모두 닫기",
      "pin": "📌 핀 고정",
      "unpin": "📌 핀 해제",
      "reload": "🔄 새로고침 (데이터만)"
    },
    "unsaved": {
      "title": "{tabTitle} 탭이 닫힙니다",
      "body": "저장 안 된 변경 {count}건이 있습니다. 어떻게 할까요?",
      "discard": "닫기 (변경 버림)",
      "saveAndClose": "저장 후 닫기",
      "cancel": "취소"
    },
    "limit": {
      "allPinned": "탭 5개 모두 핀 고정됨. 핀 해제 후 다시 시도하세요."
    },
    "fallbackTitle": "(제목 없음)"
  }
}
```

Interpolation variables: `{tabTitle}`, `{count}` — must match in any future locale (per `jarvis-i18n` spec).

---

## 7. Testing

### 7.1 Unit (Vitest, in `tabs/__tests__/`)

| Test file | Coverage |
|-----------|----------|
| `TabContext.test.tsx` | openTab (new / existing / 5-full eviction / all-pinned / dirty-eviction-flow), closeTab (clean / dirty / cancel), focusTab updates lastVisitedAt, pinTab/unpinTab, reload, closeBatch (left/right/all/others) |
| `useTabState.test.tsx` | mount restores from cache, change writes to context, isolation across tabs, overlay applied to fresh server data |
| `tab-persistence.test.ts` | `loadFromSession` parses v1 schema, `saveToSession` debounce coalesces N writes within 500ms into 1 |
| `tab-key.test.ts` | `pathname → key` strips search params, dynamic segments handled, fallback title lookup |

### 7.2 E2E (Playwright, `apps/web/e2e/tabs.spec.ts`)

| Scenario | Assertion |
|----------|-----------|
| 1. Edit-and-return | Edit a row in admin/companies → switch to admin/menus → return → row still marked dirty + edits visible |
| 2. LRU at 6th | Open 5 tabs in order → click 6th menu item → first opened tab is gone, 6th now visible |
| 3. All-pinned block | Pin all 5 tabs → click 6th → toast appears, no new tab |
| 4. Dirty LRU | Make tab 1 dirty → fill 5 → try opening 6th → dialog with tab 1's title → choose discard → tab 1 gone, 6th opens |
| 5. Hotkeys | Ctrl+W closes active, Ctrl+Tab moves to next, Ctrl+3 jumps to 3rd tab |
| 6. F5 persistence | Open 3 tabs with mixed state → F5 → 3 tabs restored, sessionStorage round-tripped |

---

## 8. Edge Cases & Error Handling

| Case | Handling |
|------|----------|
| `useTabState` called outside of `TabProvider` | Throw `Error("useTabState must be used inside TabProvider")` — fail loud in dev |
| sessionStorage quota exceeded | Catch + log warning + drop oldest non-active tab states until under quota |
| sessionStorage parse error (corrupt JSON) | Catch + log + reset to empty state, don't crash provider |
| Server unreachable on `router.refresh` | Existing Next.js error boundary handles this — tab and dirty state unaffected |
| Two tabs racing `setTabState` for the same tab | React state is single-threaded; last setter wins (acceptable — no concurrent edit cross-tab in this design) |
| Tab title fetch (dynamic page) | Page calls `setTabTitle(actualTitle)` once data loads; until then, fallback shown |
| Long tab title | CSS `max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap` |
| Page that doesn't opt into `useTabState` | Tab persists in TabContext (navigation-only) but page state is ephemeral — graceful degradation |
| Dirty tab when user manually navigates browser back/forward | Browser intercept via `beforeunload`? Out of scope for V1 — back/forward respects URL only, dirty state warned only on tab X |
| Logout / session expire | Existing redirect to `/login` clears AppShell → TabProvider unmount → sessionStorage entry persists but is workspace-scoped key, cleared on next workspaceId mismatch |

---

## 9. Implementation Phases

| Phase | Scope | Estimate |
|-------|-------|----------|
| **P1: Core** | `tab-types.ts`, `TabContext.tsx`, `tab-persistence.ts`, `tab-key.ts`, AppShell wiring, hotkeys hook, unit tests for context | ~3 days |
| **P2: UI** | `TabBar.tsx`, `TabContextMenu.tsx`, Topbar integration, Sidebar/CommandPalette intercepts, i18n keys | ~3 days |
| **P3: Page Integration** | `useTabState`, `useTabDirty`, generalize `UnsavedChangesDialog`, apply to admin/companies as POC | ~2 days |
| **P4: Visual Polish** | `frontend-design` / `impeccable` / `ui-ux-pro-max` pass: colors, spacing, active indicator, hover states, transitions | ~1 day |
| **P5: Verification** | Playwright E2E (6 scenarios), `pnpm type-check`, `pnpm lint`, `pnpm audit:rsc` | ~1 day |

**Total: 1.5–2 weeks** (single developer, full time).

After P3, additional pages adopt `useTabState` in subsequent rolling PRs (admin/menus, knowledge editors, project pages, sales grids — each tracked separately, not blocking the V1 ship).

---

## 10. Out of Scope (Phase 2+ Candidates)

- Drag-to-reorder tabs.
- Tab pinning persisted across sessions (currently sessionStorage-only).
- "Recently closed" stack with restore (Ctrl+Shift+T) — explicitly declined.
- Tab duplicate — explicitly declined.
- Per-tab badge count (e.g., new notifications since last visit).
- Cross-window tab sync (broadcast channel).
- Mobile/narrow viewport: tab strip degrades to a dropdown picker.

---

## 11. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Dirty flag isn't persisted, so on page remount (after F5) the page must re-emit `useTabDirty(true)` if state warrants it — otherwise sessionStorage has dirty edits but the tab shows clean. | Document the pattern: pages derive dirty from restored state on every render — `useTabDirty(state.dirtyRows.length > 0 \|\| state.newRows.length > 0 \|\| state.deletedIds.length > 0)`. Naturally re-fires on mount and on every state change. Lint rule (Phase 5): warn when a page calls `useTabState` without a corresponding `useTabDirty`. |
| Topbar gets too crowded on narrow viewports (<1280px) | Decided in P2: at <1280px, search button shrinks from 320px to icon-only; tabs always visible. Below 960px (rare for an internal tool), fall back to a "tabs" dropdown trigger. |
| `useTabState` adoption is slow → most pages don't preserve state, defeating the value prop | P3 commits a POC on the most-touched page (admin/companies). The pattern is documented in `tabs/README.md` and a follow-up rollout PR is tracked separately. Failure mode is graceful — pages without it just behave as today. |
| `router.refresh()` doesn't actually preserve client state in some edge case | Validated with E2E scenario 1. If breaks: fall back to per-page imperative refetch hooks. |
| Dirty close dialog flow when `page.save()` errors (e.g., validation failure) | `page.save()` returns `Promise<{ ok: boolean }>`; on `false`, leave tab open + show error toast; new tab open is also aborted. |
| sessionStorage size pressure with many large tab states (e.g., huge grids) | Page authors should keep `useTabState` payload small (only edits, not full data). Hard cap: warn at 1MB serialized size. Fallback: drop oldest non-active tabs' state. |

---

## 12. Open Questions

None as of writing. All decisions ratified during brainstorming on 2026-05-02.

---

## 13. References

- Architecture skill: [`jarvis-architecture`](.claude/skills/jarvis-architecture/SKILL.md)
- DB / RBAC patterns: [`jarvis-db-patterns`](.claude/skills/jarvis-db-patterns/SKILL.md)
- i18n: [`jarvis-i18n`](.claude/skills/jarvis-i18n/SKILL.md)
- Existing dialog reuse: [`UnsavedChangesDialog.tsx`](apps/web/app/(app)/admin/companies/_components/UnsavedChangesDialog.tsx)
- Existing menu lookup (for tab title fallback): [`menu-tree.ts`](apps/web/lib/server/menu-tree.ts), [`routes.ts`](apps/web/lib/routes.ts) (deprecated, used as fallback only)
- Brainstorming visual artifacts: `.superpowers/brainstorm/2041-1777656876/content/` (intro, architecture-comparison, tab-placement, context-menu, final-design)
