# Turbopack-compatible Monorepo Build Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `apps/web` run Turbopack as the dev bundler default by switching all 9 workspace packages to expose precompiled `dist/*.js` via `package.json#exports`, eliminating `transpilePackages` runtime resolution.

**Architecture:** Each package gets a `build` script (`tsc`) + `dev` script (`tsc --watch`) and updates its `package.json#exports` to map source paths to `dist/` artifacts. `apps/web` removes `transpilePackages`; `turbo.json` adds `^build` dependency to the `dev` task so packages are compiled once before persistent watch starts. NodeNext + `.js` extension policy and `apps/worker` are untouched.

**Tech Stack:** Turbo 2.x, TypeScript 5.7 (NodeNext + Bundler in apps/web), Next.js 15.5 (Turbopack/Webpack dual), pnpm 10 workspace, tsc-only compile (no esbuild/swc package-level).

**Reference spec:** `docs/superpowers/specs/2026-05-11-turbopack-monorepo-migration-design.md`

---

## File Structure

### Files modified per package (9 packages)

For each `packages/<name>/`:
- `package.json` — add `scripts.build` + `scripts.dev`, rewrite `exports` to point at `dist/*.js`
- `tsconfig.json` — verify `outDir: "./dist"` and `rootDir` correctness (no change for most)

### Files modified in Phase 2 (integration)
- `apps/web/next.config.ts` — remove `transpilePackages` array
- `turbo.json` — add `dependsOn: ["^build"]` to `dev` task

### Files NOT changed
- Any `.ts` / `.tsx` source file (no import statement edits)
- `apps/worker/package.json`, `apps/worker/tsconfig.json`
- Root `tsconfig.json`, `.gitignore` (already covers `dist/`)
- Root `package.json` (turbo scripts already in place)

### Why no test files?

This work is structural (build config), not behavioral. Verification is done via build/type-check/dev-start commands rather than unit tests. Each Phase 1 task verifies its own dist generation; Phase 2 verifies the full integration matrix.

---

## Phase 1 — Per-Package Migration (Tasks 1–9, parallelizable)

> **NOTE (discovered during Task 1 execution):** Base `tsconfig.json` has `"noEmit": true` globally. Every package `tsconfig.json` must add `"noEmit": false` under `compilerOptions` to enable `dist/` emit. This applies to Tasks 1–9 — wherever the task says "Verify tsconfig (no edit)", **instead add `"noEmit": false` if not already present** and commit the tsconfig change together with the package.json change. The commit message stays the same (`build(<name>): emit dist/...`).

All 9 tasks are **isolated** — each touches only its own `packages/<name>/package.json` and `packages/<name>/tsconfig.json`. No cross-package edits. Conflicts impossible.

Task ordering note: although tasks can run in parallel, build verification in step 5 of each task requires upstream packages to be built first. Subagent runner should either run tasks in topological order or have all subagents run `pnpm install` + `pnpm build` once before per-task verification.

Topological order: shared → secret → db → auth → external-signals → wiki-fs → search → wiki-agent → ai

---

### Task 1: @jarvis/shared — build + dist exports

**Files:**
- Modify: `packages/shared/package.json`
- Modify: `packages/shared/tsconfig.json` (verify only)

- [ ] **Step 1: Verify tsconfig**

Read `packages/shared/tsconfig.json`. Confirm it contains:

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "."
  },
  "include": ["**/*.ts"],
  "exclude": ["dist", "node_modules"]
}
```

No edit needed. Base `tsconfig.json` provides `module: NodeNext`, `moduleResolution: NodeNext`, `declaration: true`, `sourceMap: true`.

- [ ] **Step 2: Update package.json — add scripts + rewrite exports**

Edit `packages/shared/package.json`. Replace the entire `scripts` block:

```json
"scripts": {
  "build": "tsc",
  "dev": "tsc --watch --preserveWatchOutput",
  "type-check": "tsc --noEmit",
  "test": "vitest"
}
```

Replace the entire `exports` block:

```json
"exports": {
  ".":              { "types": "./dist/index.d.ts",              "default": "./dist/index.js" },
  "./types":        { "types": "./dist/types/index.d.ts",        "default": "./dist/types/index.js" },
  "./types/*":      { "types": "./dist/types/*.d.ts",            "default": "./dist/types/*.js" },
  "./constants":    { "types": "./dist/constants/index.d.ts",    "default": "./dist/constants/index.js" },
  "./constants/*":  { "types": "./dist/constants/*.d.ts",        "default": "./dist/constants/*.js" },
  "./validation":   { "types": "./dist/validation/index.d.ts",   "default": "./dist/validation/index.js" },
  "./validation/*": { "types": "./dist/validation/*.d.ts",       "default": "./dist/validation/*.js" },
  "./sentry":       { "types": "./dist/sentry.d.ts",             "default": "./dist/sentry.js" },
  "./leave-compute":{ "types": "./dist/leave-compute.d.ts",      "default": "./dist/leave-compute.js" },
  "./chat/*":       { "types": "./dist/chat/*.d.ts",             "default": "./dist/chat/*.js" }
}
```

- [ ] **Step 3: Build and verify dist**

Run:

```bash
pnpm --filter @jarvis/shared build
```

Expected: exits 0. `packages/shared/dist/` populated with `.js` + `.d.ts` mirroring source tree (`dist/index.js`, `dist/types/`, `dist/constants/`, `dist/validation/`, `dist/chat/`, `dist/sentry.js`, `dist/leave-compute.js`).

- [ ] **Step 4: Spot-check dist artifacts**

Run:

```bash
test -f packages/shared/dist/index.js && head -5 packages/shared/dist/index.js
test -f packages/shared/dist/index.d.ts && head -5 packages/shared/dist/index.d.ts
test -f packages/shared/dist/types/index.js
test -f packages/shared/dist/constants/index.js
```

Expected: all `test -f` exits 0, `head` shows valid ESM (`export {...}` or `import {...} from "..."`).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/package.json
git commit -m "build(shared): emit dist/ and export precompiled artifacts"
```

---

### Task 2: @jarvis/secret — build + dist exports

**Files:**
- Modify: `packages/secret/package.json`

- [ ] **Step 1: Verify tsconfig**

Read `packages/secret/tsconfig.json`. Confirm `outDir: "dist"`, `rootDir: "."`, `include: ["**/*.ts"]`. No edit needed.

- [ ] **Step 2: Update package.json**

Replace `scripts`:

```json
"scripts": {
  "build": "tsc",
  "dev": "tsc --watch --preserveWatchOutput",
  "type-check": "tsc --noEmit"
}
```

Replace `exports`:

```json
"exports": {
  ".":      { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
  "./types":{ "types": "./dist/types.d.ts", "default": "./dist/types.js" }
}
```

- [ ] **Step 3: Build and verify**

```bash
pnpm --filter @jarvis/secret build
test -f packages/secret/dist/index.js
test -f packages/secret/dist/index.d.ts
test -f packages/secret/dist/types.js
```

Expected: all exits 0.

- [ ] **Step 4: Commit**

```bash
git add packages/secret/package.json
git commit -m "build(secret): emit dist/ and export precompiled artifacts"
```

---

### Task 3: @jarvis/db — build + dist exports (wildcard `./schema/*`)

**Files:**
- Modify: `packages/db/package.json`

- [ ] **Step 1: Verify tsconfig**

Read `packages/db/tsconfig.json`. Confirm `outDir: "dist"`, `rootDir: "."`, `include: ["**/*.ts"]`, `exclude: ["dist", "node_modules", "__tests__"]`. No edit needed.

- [ ] **Step 2: Update package.json**

Replace `scripts` (preserve existing `test` script):

```json
"scripts": {
  "build": "tsc",
  "dev": "tsc --watch --preserveWatchOutput",
  "type-check": "tsc --noEmit",
  "test": "node --test --import tsx ./guards/__tests__/body-column-guard.test.ts ./__tests__/schema/user-global-unique.test.ts ./__tests__/schema/sales-contract-schema.test.ts ./__tests__/schema/sales-people-schema.test.ts ./__tests__/schema/project-extension.test.ts"
}
```

Replace `exports`:

```json
"exports": {
  ".":              { "types": "./dist/index.d.ts",         "default": "./dist/index.js" },
  "./client":       { "types": "./dist/client.d.ts",        "default": "./dist/client.js" },
  "./schema":       { "types": "./dist/schema/index.d.ts",  "default": "./dist/schema/index.js" },
  "./schema/*":     { "types": "./dist/schema/*.d.ts",      "default": "./dist/schema/*.js" },
  "./feature-flags":{ "types": "./dist/feature-flags.d.ts", "default": "./dist/feature-flags.js" },
  "./operators":    { "types": "./dist/operators.d.ts",     "default": "./dist/operators.js" }
}
```

- [ ] **Step 3: Build and verify**

```bash
pnpm --filter @jarvis/db build
test -f packages/db/dist/index.js
test -f packages/db/dist/client.js
test -f packages/db/dist/schema/index.js
test -f packages/db/dist/schema/additional-development.js
test -f packages/db/dist/schema/additional-development.d.ts
```

Expected: all exits 0. (`additional-development.js` is the file that originally failed under Turbopack — its existence in `dist/` is the most important success signal.)

- [ ] **Step 4: Verify 30+ schema files compiled**

```bash
ls packages/db/dist/schema/*.js | wc -l
```

Expected: ≥ 30 (source has ~35 schema files).

- [ ] **Step 5: Commit**

```bash
git add packages/db/package.json
git commit -m "build(db): emit dist/ and export precompiled artifacts (incl. ./schema/* wildcard)"
```

---

### Task 4: @jarvis/auth — build + dist exports

**Files:**
- Modify: `packages/auth/package.json`

- [ ] **Step 1: Verify tsconfig** — same checks as Task 1/2. No edit.

- [ ] **Step 2: Update package.json**

Replace `scripts`:

```json
"scripts": {
  "build": "tsc",
  "dev": "tsc --watch --preserveWatchOutput",
  "type-check": "tsc --noEmit",
  "test": "vitest"
}
```

Replace `exports`:

```json
"exports": {
  ".":            { "types": "./dist/index.d.ts",       "default": "./dist/index.js" },
  "./types":      { "types": "./dist/types.d.ts",       "default": "./dist/types.js" },
  "./session":    { "types": "./dist/session.d.ts",     "default": "./dist/session.js" },
  "./rbac":       { "types": "./dist/rbac.d.ts",        "default": "./dist/rbac.js" },
  "./cookie":     { "types": "./dist/cookie.d.ts",      "default": "./dist/cookie.js" },
  "./return-url": { "types": "./dist/return-url.d.ts",  "default": "./dist/return-url.js" },
  "./password":   { "types": "./dist/password.d.ts",    "default": "./dist/password.js" }
}
```

- [ ] **Step 3: Build and verify**

```bash
pnpm --filter @jarvis/auth build
test -f packages/auth/dist/index.js
test -f packages/auth/dist/cookie.js
test -f packages/auth/dist/cookie.d.ts
test -f packages/auth/dist/password.js
test -f packages/auth/dist/session.js
```

Expected: all exits 0.

- [ ] **Step 4: Commit**

```bash
git add packages/auth/package.json
git commit -m "build(auth): emit dist/ and export precompiled artifacts"
```

---

### Task 5: @jarvis/external-signals — build + dist exports (src/ layout)

**Files:**
- Modify: `packages/external-signals/package.json`
- Modify: `packages/external-signals/tsconfig.json` — set `rootDir: "./src"`

- [ ] **Step 1: Update tsconfig**

Replace `packages/external-signals/tsconfig.json` content:

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["dist", "node_modules", "src/**/*.test.ts"]
}
```

The change is `rootDir: "."` → `rootDir: "./src"`. This makes tsc emit `dist/index.js` directly instead of `dist/src/index.js`.

- [ ] **Step 2: Update package.json**

Replace `scripts`:

```json
"scripts": {
  "build": "tsc",
  "dev": "tsc --watch --preserveWatchOutput",
  "type-check": "tsc --noEmit",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

Replace `exports` (note: source is `./src/*.ts`, dist becomes `./dist/*.js` thanks to rootDir change):

```json
"exports": {
  ".":              { "types": "./dist/index.d.ts",        "default": "./dist/index.js" },
  "./types":        { "types": "./dist/types.d.ts",        "default": "./dist/types.js" },
  "./exchangerate": { "types": "./dist/exchangerate.d.ts", "default": "./dist/exchangerate.js" },
  "./kma":          { "types": "./dist/kma.d.ts",          "default": "./dist/kma.js" }
}
```

- [ ] **Step 3: Build and verify**

```bash
pnpm --filter @jarvis/external-signals build
test -f packages/external-signals/dist/index.js
test -f packages/external-signals/dist/types.js
test -f packages/external-signals/dist/exchangerate.js
test -f packages/external-signals/dist/kma.js
test ! -d packages/external-signals/dist/src
```

Expected: all exits 0. Last check confirms `rootDir: "./src"` is in effect — `dist/src/` must NOT exist.

- [ ] **Step 4: Commit**

```bash
git add packages/external-signals/package.json packages/external-signals/tsconfig.json
git commit -m "build(external-signals): emit dist/ from src/ and export precompiled artifacts"
```

---

### Task 6: @jarvis/wiki-fs — build + dist exports (src/ layout)

**Files:**
- Modify: `packages/wiki-fs/package.json`
- Modify: `packages/wiki-fs/tsconfig.json` — set `rootDir: "./src"`

- [ ] **Step 1: Update tsconfig**

Replace `packages/wiki-fs/tsconfig.json` content:

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["dist", "node_modules", "src/__tests__"]
}
```

- [ ] **Step 2: Update package.json**

Replace `scripts`:

```json
"scripts": {
  "build": "tsc",
  "dev": "tsc --watch --preserveWatchOutput",
  "type-check": "tsc --noEmit",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

Replace `exports`:

```json
"exports": {
  ".":             { "types": "./dist/index.d.ts",       "default": "./dist/index.js" },
  "./types":       { "types": "./dist/types.d.ts",       "default": "./dist/types.js" },
  "./writer":      { "types": "./dist/writer.d.ts",      "default": "./dist/writer.js" },
  "./frontmatter": { "types": "./dist/frontmatter.d.ts", "default": "./dist/frontmatter.js" },
  "./wikilink":    { "types": "./dist/wikilink.d.ts",    "default": "./dist/wikilink.js" },
  "./git":         { "types": "./dist/git.d.ts",         "default": "./dist/git.js" },
  "./worktree":    { "types": "./dist/worktree.d.ts",    "default": "./dist/worktree.js" }
}
```

- [ ] **Step 3: Build and verify**

```bash
pnpm --filter @jarvis/wiki-fs build
test -f packages/wiki-fs/dist/index.js
test -f packages/wiki-fs/dist/writer.js
test -f packages/wiki-fs/dist/wikilink.js
test ! -d packages/wiki-fs/dist/src
```

Expected: all exits 0.

- [ ] **Step 4: Commit**

```bash
git add packages/wiki-fs/package.json packages/wiki-fs/tsconfig.json
git commit -m "build(wiki-fs): emit dist/ from src/ and export precompiled artifacts"
```

---

### Task 7: @jarvis/search — build + dist exports

**Files:**
- Modify: `packages/search/package.json`

- [ ] **Step 1: Verify tsconfig** — same checks as Task 1. No edit.

- [ ] **Step 2: Update package.json**

Replace `scripts`:

```json
"scripts": {
  "build": "tsc",
  "dev": "tsc --watch --preserveWatchOutput",
  "type-check": "tsc --noEmit",
  "test": "vitest run"
}
```

Replace `exports`:

```json
"exports": {
  ".":                  { "types": "./dist/index.d.ts",              "default": "./dist/index.js" },
  "./types":            { "types": "./dist/types.d.ts",              "default": "./dist/types.js" },
  "./adapter":          { "types": "./dist/adapter.d.ts",            "default": "./dist/adapter.js" },
  "./pg-search":        { "types": "./dist/pg-search.d.ts",          "default": "./dist/pg-search.js" },
  "./precedent-search": { "types": "./dist/precedent-search.d.ts",   "default": "./dist/precedent-search.js" },
  "./query-parser":     { "types": "./dist/query-parser.d.ts",       "default": "./dist/query-parser.js" },
  "./hybrid-ranker":    { "types": "./dist/hybrid-ranker.d.ts",      "default": "./dist/hybrid-ranker.js" },
  "./highlighter":      { "types": "./dist/highlighter.d.ts",        "default": "./dist/highlighter.js" },
  "./explain":          { "types": "./dist/explain.d.ts",            "default": "./dist/explain.js" },
  "./facet-counter":    { "types": "./dist/facet-counter.d.ts",      "default": "./dist/facet-counter.js" },
  "./synonym-resolver": { "types": "./dist/synonym-resolver.d.ts",   "default": "./dist/synonym-resolver.js" },
  "./fallback-chain":   { "types": "./dist/fallback-chain.d.ts",     "default": "./dist/fallback-chain.js" }
}
```

- [ ] **Step 3: Build and verify**

```bash
pnpm --filter @jarvis/search build
test -f packages/search/dist/index.js
test -f packages/search/dist/pg-search.js
test -f packages/search/dist/hybrid-ranker.js
```

Expected: all exits 0.

- [ ] **Step 4: Commit**

```bash
git add packages/search/package.json
git commit -m "build(search): emit dist/ and export precompiled artifacts"
```

---

### Task 8: @jarvis/wiki-agent — build + dist exports (src/ layout)

**Files:**
- Modify: `packages/wiki-agent/package.json`
- Modify: `packages/wiki-agent/tsconfig.json` — set `rootDir: "./src"` + include path

- [ ] **Step 1: Update tsconfig**

Replace `packages/wiki-agent/tsconfig.json` content:

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["dist", "node_modules", "src/__tests__"]
}
```

Note: original had `include: ["**/*.ts"]` and no module/moduleResolution override (inherited from base). This change scopes input to `src/` so `dist/` doesn't include extraneous output, matches the other src/ packages.

- [ ] **Step 2: Update package.json**

Replace `scripts`:

```json
"scripts": {
  "build": "tsc",
  "dev": "tsc --watch --preserveWatchOutput",
  "type-check": "tsc --noEmit",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

Replace `exports`:

```json
"exports": {
  ".":                          { "types": "./dist/index.d.ts",                          "default": "./dist/index.js" },
  "./types":                    { "types": "./dist/types.d.ts",                          "default": "./dist/types.js" },
  "./prompts/analysis":         { "types": "./dist/prompts/analysis.d.ts",               "default": "./dist/prompts/analysis.js" },
  "./prompts/generation":       { "types": "./dist/prompts/generation.d.ts",             "default": "./dist/prompts/generation.js" },
  "./prompts/aliases-contract": { "types": "./dist/prompts/aliases-contract.d.ts",       "default": "./dist/prompts/aliases-contract.js" },
  "./parsers/file-block":       { "types": "./dist/parsers/file-block.d.ts",             "default": "./dist/parsers/file-block.js" },
  "./parsers/review-block":     { "types": "./dist/parsers/review-block.d.ts",           "default": "./dist/parsers/review-block.js" },
  "./maintain-index":           { "types": "./dist/maintain-index.d.ts",                 "default": "./dist/maintain-index.js" },
  "./append-log":               { "types": "./dist/append-log.d.ts",                     "default": "./dist/append-log.js" },
  "./constants":                { "types": "./dist/constants.d.ts",                      "default": "./dist/constants.js" },
  "./projection":               { "types": "./dist/projection.d.ts",                     "default": "./dist/projection.js" }
}
```

- [ ] **Step 3: Build and verify**

```bash
pnpm --filter @jarvis/wiki-agent build
test -f packages/wiki-agent/dist/index.js
test -f packages/wiki-agent/dist/prompts/analysis.js
test -f packages/wiki-agent/dist/parsers/file-block.js
test ! -d packages/wiki-agent/dist/src
```

Expected: all exits 0.

- [ ] **Step 4: Commit**

```bash
git add packages/wiki-agent/package.json packages/wiki-agent/tsconfig.json
git commit -m "build(wiki-agent): emit dist/ from src/ and export precompiled artifacts"
```

---

### Task 9: @jarvis/ai — build + dist exports (nested `./page-first/*`)

**Files:**
- Modify: `packages/ai/package.json`

- [ ] **Step 1: Verify tsconfig** — same as Task 1. No edit.

- [ ] **Step 2: Update package.json**

Replace `scripts`:

```json
"scripts": {
  "build": "tsc",
  "dev": "tsc --watch --preserveWatchOutput",
  "type-check": "tsc --noEmit",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

Replace `exports`:

```json
"exports": {
  ".":                          { "types": "./dist/index.d.ts",                       "default": "./dist/index.js" },
  "./types":                    { "types": "./dist/types.d.ts",                       "default": "./dist/types.js" },
  "./ask":                      { "types": "./dist/ask.d.ts",                         "default": "./dist/ask.js" },
  "./provider":                 { "types": "./dist/provider.d.ts",                    "default": "./dist/provider.js" },
  "./breaker":                  { "types": "./dist/breaker.d.ts",                     "default": "./dist/breaker.js" },
  "./page-first":               { "types": "./dist/page-first/index.d.ts",            "default": "./dist/page-first/index.js" },
  "./page-first/shortlist":     { "types": "./dist/page-first/shortlist.d.ts",        "default": "./dist/page-first/shortlist.js" },
  "./page-first/expand":        { "types": "./dist/page-first/expand.d.ts",           "default": "./dist/page-first/expand.js" },
  "./page-first/read-pages":    { "types": "./dist/page-first/read-pages.d.ts",       "default": "./dist/page-first/read-pages.js" },
  "./page-first/synthesize":    { "types": "./dist/page-first/synthesize.d.ts",       "default": "./dist/page-first/synthesize.js" }
}
```

- [ ] **Step 3: Build and verify**

```bash
pnpm --filter @jarvis/ai build
test -f packages/ai/dist/index.js
test -f packages/ai/dist/ask.js
test -f packages/ai/dist/page-first/index.js
test -f packages/ai/dist/page-first/shortlist.js
```

Expected: all exits 0.

- [ ] **Step 4: Commit**

```bash
git add packages/ai/package.json
git commit -m "build(ai): emit dist/ and export precompiled artifacts (incl. nested ./page-first/*)"
```

---

## Phase 2 — Integration (Tasks 10–15, sequential)

After all 9 packages produce `dist/` successfully, integrate apps and verify the full matrix.

---

### Task 10: Remove `transpilePackages` from apps/web

**Files:**
- Modify: `apps/web/next.config.ts`

- [ ] **Step 1: Edit next.config.ts**

Remove the entire `transpilePackages` array from `apps/web/next.config.ts`. The block to delete:

```ts
transpilePackages: [
  "@jarvis/db",
  "@jarvis/shared",
  "@jarvis/auth",
  "@jarvis/search",
  "@jarvis/ai",
  "@jarvis/secret",
  "@jarvis/wiki-agent"
],
```

Keep everything else: `distDir`, `allowedDevOrigins`, `output`, `serverExternalPackages`, `experimental`, `turbopack`, `webpack(...)`, `images`, plus the `withNextIntl` wrapper.

- [ ] **Step 2: Verify removal**

Run:

```bash
grep -n "transpilePackages" apps/web/next.config.ts
```

Expected: no output (grep exits 1).

- [ ] **Step 3: Commit**

```bash
git add apps/web/next.config.ts
git commit -m "feat(web): drop transpilePackages now that workspace packages ship dist/"
```

---

### Task 11: Add `^build` dependency to turbo `dev` task

**Files:**
- Modify: `turbo.json`

- [ ] **Step 1: Edit turbo.json**

In `turbo.json`, locate the `dev` task block:

```json
"dev": {
  "cache": false,
  "persistent": true
}
```

Replace with:

```json
"dev": {
  "cache": false,
  "persistent": true,
  "dependsOn": ["^build"]
}
```

- [ ] **Step 2: Verify**

```bash
grep -A3 '"dev":' turbo.json
```

Expected: shows the new `dependsOn: ["^build"]` line.

- [ ] **Step 3: Commit**

```bash
git add turbo.json
git commit -m "feat(turbo): dev depends on ^build so packages compile before watch starts"
```

---

### Task 12: Full monorepo build verification

**No file changes.** Verification only.

- [ ] **Step 1: Clean prior dist (avoid stale)**

```bash
find packages -type d -name dist -prune -exec rm -rf {} + 2>/dev/null || true
```

Expected: exits 0. All 9 `packages/<name>/dist/` directories deleted.

- [ ] **Step 2: Full build via turbo**

```bash
pnpm build
```

Expected: turbo orchestrates topological build:
1. `@jarvis/shared`, `@jarvis/secret`, `@jarvis/external-signals`, `@jarvis/wiki-fs` build first (no deps)
2. `@jarvis/db` builds (deps: shared)
3. `@jarvis/auth` builds (deps: db, shared)
4. `@jarvis/search`, `@jarvis/wiki-agent`, `@jarvis/ai` build
5. `@jarvis/web`, `@jarvis/worker` build last

Exit 0 expected. Look for "Tasks: X successful" at end.

- [ ] **Step 3: Spot-check that web build still passes (webpack production)**

The Next.js production build uses webpack, not Turbopack. It must still succeed.

```bash
test -d apps/web/.next
ls apps/web/.next/standalone 2>/dev/null || ls apps/web/.next/server | head -3
```

Expected: `.next/` exists with `server/` subdirectory and bundled output.

- [ ] **Step 4: No commit (verification only).** Proceed to Task 13.

---

### Task 13: Full type-check ×2

**No file changes.** Verification only.

- [ ] **Step 1: First type-check pass**

```bash
pnpm type-check
```

Expected: exits 0. Both apps + 9 packages type-check pass. Warning messages OK; errors not OK.

- [ ] **Step 2: Second type-check pass (cache check)**

```bash
pnpm type-check
```

Expected: exits 0. Much faster than pass 1 (turbo cache hit on unchanged packages).

If either pass fails with "Cannot find module '@jarvis/<name>/<sub>'":
- Likely cause: missing `exports` entry in that package's `package.json`. Cross-reference Phase 1 task for the affected package.
- Fix the missing entry, rebuild that package, re-run type-check.

- [ ] **Step 3: No commit.** Proceed to Task 14.

---

### Task 14: apps/web Turbopack dev smoke test

**No file changes.** Verification only.

- [ ] **Step 1: Start dev server**

In a terminal:

```bash
pnpm --filter @jarvis/web dev
```

Expected console output (within 30s):
- `▲ Next.js 15.5.x (Turbopack)` banner
- `- Local: http://localhost:3010`
- No `Module not found` errors
- No `Cannot resolve` errors for `@jarvis/*` packages

- [ ] **Step 2: Manual browser check**

Open `http://localhost:3010` in a browser. The login page must render. If logged in, `/dashboard` must load. No console errors related to module resolution.

- [ ] **Step 3: HMR check**

Edit a string in `apps/web/app/(app)/dashboard/page.tsx` (e.g., change a heading text). Save. Browser should HMR-update within 1-2 seconds without full reload.

- [ ] **Step 4: Stop dev server (Ctrl+C). No commit.**

If Turbopack still fails: confirm `packages/<offending>/dist/` is populated (run `pnpm build` again). If a wildcard export is broken, the error trace will point to the missing `.js`.

---

### Task 15: apps/worker dev + build smoke test, webpack fallback check

**No file changes.** Verification only.

- [ ] **Step 1: worker tsx watch starts cleanly**

```bash
pnpm --filter @jarvis/worker dev
```

Expected (within 10s):
- `[worker]` log messages indicating boot
- No `Cannot find module '@jarvis/<name>'` errors
- pg-boss / pino / sentry init logs

Stop with Ctrl+C after 30s.

- [ ] **Step 2: worker production build**

```bash
pnpm --filter @jarvis/worker build
test -f apps/worker/dist/src/index.js
```

Expected: exits 0, `dist/src/index.js` exists.

- [ ] **Step 3: webpack fallback still works**

```bash
pnpm --filter @jarvis/web dev:webpack
```

Expected:
- `▲ Next.js 15.5.x` (no Turbopack banner — webpack mode)
- Same `/dashboard` loads, no module errors

Stop with Ctrl+C. Confirm both bundlers work against the new `dist/`-based packages.

- [ ] **Step 4: Final commit (if any verification artifacts changed) or skip.**

Phase 2 should produce 2 commits total (Task 10 + Task 11). No additional commits expected here.

---

## Phase 3 — Optional polish (deferred, do not block on these)

Listed for reference. Not part of the core migration.

- Add a `clean` script to root `package.json`:
  ```json
  "clean": "find packages apps -type d -name dist -prune -exec rm -rf {} + && rm -rf apps/web/.next apps/web/.next-dev"
  ```
- Document the cold-start cost in `CONTRIBUTING.md` (~5–10s on first `pnpm dev`).
- Consider promoting Turbopack to production build (`next build --turbopack`) when Next.js marks it stable for production (not 15.5).

---

## Rollback plan

If migration fails at any verification gate (Tasks 12–15) and cannot be fixed within 30 minutes, revert via:

```bash
git log --oneline | head -15      # find the commit before Task 1
git reset --hard <commit-sha>
git clean -fd packages/*/dist
```

The webpack fallback (`pnpm dev:webpack`) continues to work throughout; users can keep developing while migration is being fixed.

---

## Success criteria

- [ ] All 9 `packages/<name>/dist/` directories exist with `.js` + `.d.ts` files
- [ ] `pnpm build` succeeds end-to-end
- [ ] `pnpm type-check` ×2 succeeds
- [ ] `pnpm --filter @jarvis/web dev` starts with Turbopack banner, dashboard loads
- [ ] `pnpm --filter @jarvis/web build` (production webpack) succeeds
- [ ] `pnpm --filter @jarvis/web dev:webpack` (fallback) succeeds
- [ ] `pnpm --filter @jarvis/worker dev` boots without module errors
- [ ] `pnpm --filter @jarvis/worker build` succeeds
- [ ] No `.ts` source file modified
- [ ] 11 commits produced (9 Phase 1 + 2 Phase 2)
