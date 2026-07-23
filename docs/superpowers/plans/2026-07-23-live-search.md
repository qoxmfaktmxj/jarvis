# Live Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated instant evidence search screen and a global Ctrl+K search palette backed by the existing authorized search API.

**Architecture:** The server search page continues to enforce `wiki:read` and supplies its initial result set. Client components debounce input, call `/api/search`, and render the same safe result links used by the existing page. The palette is mounted once in `AppShell`; a topbar trigger and Ctrl/Cmd+K dispatch the same open action.

**Tech Stack:** Next.js App Router, React client components, existing `/api/search`, next-intl, Vitest.

## Global Constraints

- Reuse `/api/search`; do not add a DB query, permission, API route, or external dependency.
- Keep all Korean UI text in `apps/web/messages/ko.json`.
- Search requests are debounced and cancelled when the term changes.
- Preserve safe internal and official-source navigation supplied by `buildCitationHref`.

---

### Task 1: Add the shared command search UI

**Files:**
- Create: `apps/web/components/search/SearchCommandPaletteClient.tsx`
- Create: `apps/web/components/search/SearchCommandPalette.tsx`
- Create: `apps/web/components/search/SearchCommandPaletteClient.test.tsx`
- Modify: `apps/web/components/layout/AppShell.tsx`
- Modify: `apps/web/components/layout/Topbar.tsx`
- Modify: `apps/web/messages/ko.json`

**Interfaces:**
- Produces `SearchCommandPalette`, a server wrapper that resolves `Search.Command` translations.
- Produces `SearchCommandPaletteClient`, which listens for `jarvis:open-search` and Ctrl/Cmd+K, then requests `/api/search?q={term}&limit=8`.

- [ ] **Step 1: Write the failing palette interaction test**

```tsx
window.dispatchEvent(new KeyboardEvent("keydown", { ctrlKey: true, key: "k" }));
expect(container.querySelector('[role="dialog"]')).toBeInTheDocument();
```

- [ ] **Step 2: Run the test and confirm the missing component failure**

Run: `pnpm --filter @jarvis/web test -- SearchCommandPaletteClient.test.tsx`

- [ ] **Step 3: Implement the client palette and server wrapper**

```tsx
useEffect(() => {
  const onKeyDown = (event: KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      openPalette();
    }
  };
  window.addEventListener("keydown", onKeyDown);
  return () => window.removeEventListener("keydown", onKeyDown);
}, [openPalette]);
```

- [ ] **Step 4: Mount the palette from `AppShell` and add the topbar trigger**

```tsx
<Topbar session={props.session} />
<AppShellMain>{props.children}</AppShellMain>
<SearchCommandPalette />
```

- [ ] **Step 5: Run the palette test and confirm it passes**

Run: `pnpm --filter @jarvis/web test -- SearchCommandPaletteClient.test.tsx`

### Task 2: Replace submit-only search with instant search

**Files:**
- Create: `apps/web/app/(app)/search/_components/SearchExperience.tsx`
- Modify: `apps/web/app/(app)/search/page.tsx`
- Modify: `apps/web/app/(app)/search/_components/SearchResults.tsx`
- Delete: `apps/web/app/(app)/search/_components/SearchFilters.tsx`

**Interfaces:**
- `SearchExperience` accepts `initialQuery`, `initialRows`, and translated labels.
- On each non-empty query it debounces a call to `/api/search`, updates results without a submit button, and keeps `?q=` shareable with `history.replaceState`.

- [ ] **Step 1: Implement one controlled search input and retain the existing result link renderer**

```tsx
useEffect(() => {
  if (!query.trim()) {
    setRows([]);
    return;
  }
  const controller = new AbortController();
  const timer = window.setTimeout(() => void load(query, controller.signal), 180);
  return () => {
    controller.abort();
    window.clearTimeout(timer);
  };
}, [query]);
```

- [ ] **Step 2: Remove the old submit-only filter form**

```tsx
<SearchExperience initialQuery={q} initialRows={rows} labels={{ placeholder: t("inputPlaceholder") }} />
```

- [ ] **Step 3: Run focused and package verification**

Run: `pnpm --filter @jarvis/web test -- SearchCommandPaletteClient.test.tsx`
Expected: passing test suite.

Run: `pnpm --filter @jarvis/web type-check && pnpm --filter @jarvis/web lint`
Expected: exit code 0.
