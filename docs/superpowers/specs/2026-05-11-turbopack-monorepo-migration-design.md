# Turbopack-compatible Monorepo Build Pipeline — Design Spec

**Date:** 2026-05-11
**Status:** Brainstorming complete, awaiting user spec review → writing-plans
**Scope:** Migrate `apps/web` dev bundler default from Webpack to Turbopack, while making the monorepo's 9 workspace packages compatible by switching them to standard build-artifact (`dist/`) consumption. `apps/worker` and the monorepo's NodeNext + `.js` extension policy stay untouched.

---

## 1. Problem & Goal

The Next.js dev compile time on `apps/web` is painfully slow in the current monorepo setup. Webpack lazy-compiles each route on first visit, and 7 `transpilePackages` entries + barrel imports (`lucide-react`, Radix) compound the cost. Switching the dev bundler to Turbopack would yield 5–10× faster compile/HMR, but Turbopack fails to resolve workspace `.ts` files when imports use the NodeNext-style `.js` extension (e.g. `export * from "./additional-development.js"`). Webpack handled this with `extensionAlias`; Turbopack has no equivalent native option as of Next.js 15.5.

**Goal**
- `apps/web` runs Turbopack as the dev bundler default (`pnpm dev`).
- The 9 workspace packages compile to `dist/` and expose `dist/*.js` via `package.json#exports`, eliminating `transpilePackages` runtime resolution.
- Monorepo NodeNext + `.js` extension policy untouched.
- `apps/worker` (NodeNext + `tsx watch` dev, `tsc` build) operates unchanged.
- Production build (`pnpm build` → webpack) unchanged.

**Non-goals**
- Modifying any `.ts` source code (including import statements).
- Switching the monorepo's `moduleResolution` policy from NodeNext to Bundler.
- Removing the webpack fallback (`pnpm dev:webpack`) — kept as a safety net.
- Production build optimization or output format changes.
- Adding new dependencies (e.g. `tsc-alias`, `concurrently`).

---

## 2. Decisions Locked In Brainstorming

| Area | Decision |
|------|----------|
| Approach (top-level) | **A-① Build artifact + `dist/` exports** — packages prebuild to `dist/`, apps consume compiled ESM directly. |
| Module policy | **NodeNext, unchanged** — `.js` extension stays in source. |
| Webpack fallback | **Keep `pnpm dev:webpack`** — same `next.config.ts` keeps its `webpack(config)` callback. |
| Cold start | **First `pnpm dev` does a one-time `^build` first** via `turbo.json` dev task `dependsOn: ["^build"]`. |
| Watch mode | **Each package runs `tsc --watch --preserveWatchOutput`** via its own `dev` script. Turbo's `dev` task is persistent so all packages + apps watch in parallel. |
| Production build flow | **Unchanged** — `turbo build` already has `^build` dependency; this design adds individual `build` scripts to each package (none currently have one). |
| `dist/` git tracking | **gitignore** — CI rebuilds `dist/` from source; nothing ships from this repo via npm. |
| Subagent parallelization | **9 subagents in Phase 1** (one per package), all independent. Phase 2 is sequential integration. |

---

## 3. Architecture

### 3.1 Before / After

**Before (webpack-only path)**:
```
apps/web (next dev — webpack)
  └─ transpilePackages: ["@jarvis/db", "@jarvis/shared", ...]
      └─ runtime-reads ─▶ packages/db/schema/index.ts (NodeNext + .js)
                          ├─ "./additional-development.js" → webpack extensionAlias → .ts ✅
                          └─ Turbopack: same import → ❌ Module not found
```

**After (Turbopack-first, webpack fallback)**:
```
packages/*/src/*.ts ── tsc (build/watch) ──▶ packages/*/dist/*.js (ESM)
                                              + packages/*/dist/*.d.ts

apps/web (next dev — turbopack)
  └─ direct ESM import via package.json#exports ─▶ packages/*/dist/*.js
                                                    (no runtime transpile, no extension mismatch)
```

The transformation is *invisible to the source code*: every `.ts` file's import (`import "./foo.js"`) compiles to a `.js` import on a `.js` artifact — Node ESM compliant, bundler-agnostic.

### 3.2 Package layout (per package, identical pattern)

```
packages/<name>/
├── package.json
│   ├── scripts.build = "tsc"
│   ├── scripts.dev   = "tsc --watch --preserveWatchOutput"
│   └── exports
│       ├── "."        → { "types": "./dist/index.d.ts",   "default": "./dist/index.js" }
│       ├── "./<sub>"  → { "types": "./dist/<sub>.d.ts",   "default": "./dist/<sub>.js" }
│       └── "./<glob>/*" → { "types": "./dist/<glob>/*.d.ts", "default": "./dist/<glob>/*.js" }
├── tsconfig.json
│   ├── outDir: "./dist"
│   ├── rootDir: "."        (flat layout)   OR   "./src"  (src/ layout)
│   └── (extends base — declaration: true, sourceMap: true, NodeNext)
├── .gitignore (or root .gitignore covers dist/**)
└── dist/  ← gitignored
```

### 3.3 Layout variants

| Package | Layout | `rootDir` |
|---|---|---|
| ai, auth, db, search, secret, shared | flat (`./<file>.ts`) | `"."` |
| external-signals, wiki-agent, wiki-fs | src/ (`./src/<file>.ts`) | `"./src"` |

### 3.4 Special exports (wildcard patterns to preserve)

| Package | Wildcard exports | Notes |
|---|---|---|
| db | `"./schema/*"` | 30+ schema files matched by glob — must map to `./dist/schema/*.js` |
| shared | `"./types/*"`, `"./constants/*"`, `"./validation/*"`, `"./chat/*"` | Same wildcard-to-wildcard mapping |

---

## 4. Apps changes

### 4.1 `apps/web/next.config.ts`
- Remove the `transpilePackages` array entirely (7 entries: db, shared, auth, search, ai, secret, wiki-agent).
- Keep `turbopack.resolveExtensions`, `experimental.optimizePackageImports`, and `webpack(config)` fallback callback unchanged.

### 4.2 `apps/worker`
- No source or config changes.
- Workspace package imports automatically resolve to `dist/*.js` once exports are updated.
- `tsx watch src/index.ts` (dev) and `node dist/src/index.js` (start) both expect ESM `.js` artifacts — matches the new dist output.

### 4.3 `turbo.json`
Add `dependsOn: ["^build"]` to the `dev` task:
```jsonc
"dev": {
  "cache": false,
  "persistent": true,
  "dependsOn": ["^build"]
}
```
Effect: `pnpm dev` runs `^build` (compile every package's `dist/`) once before starting the persistent watch tasks. ~5–10s cold start; subsequent runs benefit from turbo cache.

---

## 5. Dev workflow

```
$ pnpm dev
  └─ turbo dev
       ├─ Phase A: ^build (parallel, topological)
       │    ├─ @jarvis/shared       → dist/   (no upstream deps)
       │    ├─ @jarvis/secret       → dist/   (no upstream deps)
       │    ├─ @jarvis/db           → dist/   (deps: shared)
       │    ├─ @jarvis/auth         → dist/   (deps: db, shared)
       │    ├─ @jarvis/external-signals → dist/  (no upstream deps)
       │    ├─ @jarvis/wiki-fs      → dist/   (no upstream deps)
       │    ├─ @jarvis/search       → dist/   (deps: db, auth)
       │    ├─ @jarvis/wiki-agent   → dist/   (deps: db, wiki-fs)
       │    └─ @jarvis/ai           → dist/   (deps: db, auth, shared, wiki-fs)
       │
       └─ Phase B: dev (persistent, parallel)
            ├─ @jarvis/web      → next dev --turbopack
            ├─ @jarvis/worker   → tsx watch src/index.ts
            ├─ @jarvis/shared   → tsc --watch
            ├─ @jarvis/db       → tsc --watch
            └─ ... (all 9 packages + 2 apps)
```

After cold start, editing a `packages/<name>/foo.ts` causes `tsc --watch` to re-emit `dist/foo.js` in <1s, then `tsx watch` (worker) or Turbopack HMR (web) picks up the changed `.js`.

---

## 6. Verification gates

### 6.1 Per-package (each subagent owns its own check)
1. `pnpm --filter @jarvis/<name> build` → `dist/` populated, no `tsc` errors.
2. Spot-check 1 `dist/*.js` for valid ESM (`export {...}`, `.js` extension imports intact).
3. Spot-check 1 `dist/*.d.ts` for type signatures present.

### 6.2 Integration (sequential, after all 9 packages done)
1. `pnpm build` (= `turbo build`) — all dist generated in topological order, no errors.
2. `pnpm type-check` × 2 — apps + packages all type-check; second run hits cache.
3. `pnpm --filter @jarvis/web dev` cold start → Turbopack banner shown, `/dashboard` loads, no `Module not found`.
4. `pnpm --filter @jarvis/web build` — production webpack build still passes (fallback safety).
5. `pnpm --filter @jarvis/worker dev` — `tsx watch` starts, no module errors at boot.
6. `pnpm --filter @jarvis/worker build` — tsc build succeeds, `dist/src/index.js` runnable.

Optional but recommended:
- `pnpm test` × 2 (module chain regression) — vitest OOM 이슈 발생 시 패키지별로 분할 실행.

---

## 7. Rollout — Parallelization plan

### Phase 1 — 9 subagents in parallel (independent)

Each subagent owns one package and applies the identical pattern (build script + exports dist mapping + tsconfig sanity + .gitignore + per-package build verification).

| Subagent | Package | Layout | Special notes |
|---|---|---|---|
| A | `@jarvis/shared` | flat | 4 wildcard exports (`./types/*`, `./constants/*`, `./validation/*`, `./chat/*`). No upstream deps. |
| B | `@jarvis/secret` | flat | Minimal exports. No deps. |
| C | `@jarvis/db` | flat | 30+ schema files, `./schema/*` wildcard. Largest export surface. |
| D | `@jarvis/auth` | flat | 7 exports. Deps: db, shared. |
| E | `@jarvis/external-signals` | src/ | 4 exports. No upstream deps. |
| F | `@jarvis/search` | flat | 11 exports. Deps: db, auth. |
| G | `@jarvis/wiki-fs` | src/ | 7 exports. No upstream deps. |
| H | `@jarvis/wiki-agent` | src/ | 10 exports. Deps: db, wiki-fs. |
| I | `@jarvis/ai` | flat | 10 exports including nested `./page-first/*`. Deps: db, auth, shared, wiki-fs. |

Subagent work products are *isolated to their own package directory*. No cross-package edits. Conflicts impossible.

### Phase 2 — Sequential integration
1. Edit `apps/web/next.config.ts` — remove `transpilePackages` array.
2. Edit `turbo.json` — add `dependsOn: ["^build"]` to `dev` task.
3. Root `pnpm build` once (warm cache + verify topological order).
4. Run verification gates §6.2 in order.
5. Smoke test: `pnpm dev` cold start; both web and worker.
6. Commit (single PR or split per logical chunk per user preference).

---

## 8. Risks & mitigation

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| First cold start ~5–10s | Certain | Low | Turbo build cache; document in DEVELOPMENT.md (optional). |
| `tsx watch` doesn't pick up `dist/*.js` changes | Medium | Medium | Phase 2 step 5 validates; if broken, add explicit watch path or `chokidar` flag. |
| `.d.ts` missing → apps type-check regression | Medium | High | base `tsconfig.json` already has `declaration: true`; Phase 2 step 2 catches it. |
| Package circular deps surface | Low | High | Turbo detects automatically; isolate offender to separate PR. |
| Stale `dist/` cache after git pull | Medium | Low | `pnpm clean && pnpm build` standard recovery; add npm script if not present. |
| Drizzle CLI / `scripts/*.mjs` reading source paths break | Medium | Medium | NodeNext + `.js` extension policy unchanged; only `package.json#exports` changes. If a script bypasses exports and imports source path directly, fix it inline. |
| Subpath wildcard export breakage (db `./schema/*`, shared `./types/*`) | Medium | High | Subagent C/A check explicitly; integration step 1 (full build) catches mis-mapping. |
| Webpack fallback (`pnpm dev:webpack`) breaks | Low | Medium | webpack callback still has `extensionAlias`. With `transpilePackages` removed, webpack also reads `dist/`. Verify in Phase 2 step 4. |

---

## 9. Out of scope (deferred)

- Production build switch to Turbopack (still beta in 15.5; revisit when stable in Next.js 16+).
- `.d.ts.map` polish — base config already enables sufficient sourcemap.
- Documentation site / Storybook integration with new dist layout.
- Per-package eslint/prettier alignment.
- Migrating `apps/worker` to a non-NodeNext policy (worker stays NodeNext + `.js` extension).
- Removing the webpack fallback entirely. Kept indefinitely as production-build path + escape hatch.

---

## Reference

- Brainstorming transcript: this conversation, 2026-05-11 session.
- Turbopack `extensionAlias` limitation: no native equivalent in Next.js 15.5.
- Existing Webpack workaround being replaced: `apps/web/next.config.ts` `webpack(config)` callback (still kept for fallback).
- Related prior work: `28b176f fix(tabs): mirror useTabState to TabContext in post-commit effect`, `56a9884 fix(pdf): lazy-import react-dom/server in renderPdfFromReact` (recent dev environment quality fixes).
