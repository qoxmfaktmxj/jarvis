# Graph Permission Gate (RBAC + Snapshot Lineage) Implementation Plan — P0

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the graph permission gap by introducing dedicated `graph:*` permissions, gating ArchitecturePage and graphify APIs with them, adding `sensitivity` to `graph_snapshot`, resolving attachment → origin-resource lineage on build, and restricting Ask AI graph retrieval to authorized snapshots.

**Architecture:** RBAC provides coarse action gates (`graph:read`, `graph:build`). Snapshot-level ABAC is implemented via a new `sensitivity` column on `graph_snapshot`, populated at build time from the underlying attachment's origin resource (`attachment.resource_type/resource_id` → `project` / `system` / `knowledge_page`). `scopeType`/`scopeId` (already in schema) are promoted from `attachment` to the resolved origin so list/retrieval queries can filter by resource. Node/edge-level ABAC and filtered-JSON viewer mode are deferred to P1. Session-TTL staleness on `project_staff` membership is acknowledged but not solved in P0.

**Tech Stack:** pnpm workspace, TypeScript 5, Drizzle ORM (Postgres 16), Next.js 15 App Router, pg-boss worker, Vitest, next-intl, next-auth-free OIDC+Redis session.

**Out of scope for P0 (deferred):**
- Node/edge-level `effectiveSensitivity` materialization
- Policy-aware `.graphifyignore` at build time
- Confidence-based (EXTRACTED/INFERRED/AMBIGUOUS) visibility
- Central `authorize()` policy engine
- Filtered-JSON GraphViewer mode (presigned iframe stays for now)
- Postgres RLS
- Session TTL / relationship-attribute staleness fix

---

## File Structure

### Create
- `packages/db/drizzle/0005_graph_snapshot_sensitivity.sql` — migration adding `graph_snapshot.sensitivity`.
- `apps/worker/src/helpers/resolve-lineage.ts` — resolves `rawSourceId` → `attachment` → origin resource and computes effective sensitivity.
- `apps/worker/src/helpers/resolve-lineage.test.ts` — Vitest unit test for the pure-function portions of the resolver.
- `packages/auth/rbac.test.ts` — Vitest unit test for new `canAccessGraphSnapshotSensitivity` / `buildGraphSnapshotSensitivitySqlFragment` helpers.
- `apps/web/app/api/graphify/build/route.test.ts` — route handler unit test for the new `graph:build` gate.
- `apps/web/app/api/graphify/snapshots/[id]/graph/route.test.ts` — route handler unit test for the new `graph:read` gate.

### Modify
- `packages/shared/constants/permissions.ts` — add `GRAPH_READ`, `GRAPH_BUILD`; update `ROLE_PERMISSIONS`.
- `packages/auth/rbac.ts` — add `canAccessGraphSnapshotSensitivity` and `buildGraphSnapshotSensitivitySqlFragment`.
- `packages/db/schema/graph.ts` — add `sensitivity` column to `graphSnapshot`.
- `apps/worker/src/jobs/graphify-build.ts` — call resolver, write resolved `scopeType`/`scopeId`/`sensitivity` to snapshot, pass resolved sensitivity to `importAsKnowledgePage`.
- `apps/web/app/api/graphify/build/route.ts` — swap `knowledge:create` for `graph:build`.
- `apps/web/app/api/graphify/snapshots/[id]/graph/route.ts` — swap `knowledge:read` for `graph:read`; reject snapshot if sensitivity not accessible.
- `apps/web/app/(app)/architecture/page.tsx` — require `graph:read`; filter listed snapshots by `canAccessGraphSnapshotSensitivity`.
- `packages/ai/graph-context.ts` — restrict the "latest done snapshot" pick to those the caller's permissions can read.

---

## Task 1: Add `graph:*` permission constants + role mappings

**Files:**
- Modify: `packages/shared/constants/permissions.ts`
- Create: `packages/shared/constants/permissions.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/shared/constants/permissions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { PERMISSIONS, ROLE_PERMISSIONS } from "./permissions.js";

describe("permissions.ts graph additions", () => {
  it("exposes graph:read and graph:build constants", () => {
    expect(PERMISSIONS.GRAPH_READ).toBe("graph:read");
    expect(PERMISSIONS.GRAPH_BUILD).toBe("graph:build");
  });

  it("grants graph:read and graph:build to ADMIN, MANAGER, DEVELOPER", () => {
    for (const role of ["ADMIN", "MANAGER", "DEVELOPER"] as const) {
      expect(ROLE_PERMISSIONS[role]).toContain(PERMISSIONS.GRAPH_READ);
      expect(ROLE_PERMISSIONS[role]).toContain(PERMISSIONS.GRAPH_BUILD);
    }
  });

  it("grants graph:read to VIEWER but NOT graph:build", () => {
    expect(ROLE_PERMISSIONS.VIEWER).toContain(PERMISSIONS.GRAPH_READ);
    expect(ROLE_PERMISSIONS.VIEWER).not.toContain(PERMISSIONS.GRAPH_BUILD);
  });

  it("does NOT grant graph permissions to HR by default", () => {
    expect(ROLE_PERMISSIONS.HR).not.toContain(PERMISSIONS.GRAPH_READ);
    expect(ROLE_PERMISSIONS.HR).not.toContain(PERMISSIONS.GRAPH_BUILD);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @jarvis/shared test -- --run permissions`
Expected: FAIL with `PERMISSIONS.GRAPH_READ` undefined (or similar type error).

- [ ] **Step 3: Add the constants and mappings**

Edit `packages/shared/constants/permissions.ts`. Inside the `PERMISSIONS` object literal, immediately after the `SYSTEM_ACCESS_SECRET` line (`system.access:secret`), insert:

```ts
  GRAPH_READ: "graph:read",
  GRAPH_BUILD: "graph:build",
```

Then update `ROLE_PERMISSIONS`:
- `ADMIN` — no change needed (`Object.values(PERMISSIONS)` already includes them).
- `MANAGER` — append `PERMISSIONS.GRAPH_READ, PERMISSIONS.GRAPH_BUILD`.
- `DEVELOPER` — append `PERMISSIONS.GRAPH_READ, PERMISSIONS.GRAPH_BUILD`.
- `VIEWER` — append `PERMISSIONS.GRAPH_READ` only.
- `HR` — unchanged.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @jarvis/shared test -- --run permissions`
Expected: PASS (4 tests).

Also run type check:
Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/constants/permissions.ts packages/shared/constants/permissions.test.ts
git commit -m "feat(auth): add graph:read and graph:build permissions"
```

---

## Task 2: Add graph-sensitivity helpers to `rbac.ts`

**Files:**
- Modify: `packages/auth/rbac.ts`
- Create: `packages/auth/rbac.test.ts`

**Rationale:** `graph_snapshot.sensitivity` needs a predicate (for in-process checks) and a SQL fragment (for list queries), mirroring `canAccessKnowledgeSensitivity` / `buildKnowledgeSensitivitySqlFilter`. Graph sensitivity policy in P0 matches knowledge: `PUBLIC`/`INTERNAL` require `graph:read`; `RESTRICTED`/`SECRET_REF_ONLY` require a privileged graph permission. To avoid role explosion we treat `ADMIN_ALL` as the sole privilege for restricted graphs in P0 (a `graph:review` permission can be added in P1).

- [ ] **Step 1: Write the failing test**

Create `packages/auth/rbac.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  canAccessGraphSnapshotSensitivity,
  buildGraphSnapshotSensitivitySqlFragment,
} from "./rbac.js";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";

describe("graph snapshot sensitivity", () => {
  describe("canAccessGraphSnapshotSensitivity", () => {
    it("allows PUBLIC for anyone with graph:read", () => {
      expect(
        canAccessGraphSnapshotSensitivity([PERMISSIONS.GRAPH_READ], "PUBLIC"),
      ).toBe(true);
    });

    it("allows INTERNAL for graph:read holders", () => {
      expect(
        canAccessGraphSnapshotSensitivity([PERMISSIONS.GRAPH_READ], "INTERNAL"),
      ).toBe(true);
    });

    it("rejects INTERNAL for users without graph:read", () => {
      expect(
        canAccessGraphSnapshotSensitivity(
          [PERMISSIONS.KNOWLEDGE_READ],
          "INTERNAL",
        ),
      ).toBe(false);
    });

    it("rejects RESTRICTED for plain graph:read holders", () => {
      expect(
        canAccessGraphSnapshotSensitivity(
          [PERMISSIONS.GRAPH_READ],
          "RESTRICTED",
        ),
      ).toBe(false);
    });

    it("allows RESTRICTED for admin:all holders", () => {
      expect(
        canAccessGraphSnapshotSensitivity(
          [PERMISSIONS.ADMIN_ALL],
          "RESTRICTED",
        ),
      ).toBe(true);
    });

    it("allows SECRET_REF_ONLY only for admin:all", () => {
      expect(
        canAccessGraphSnapshotSensitivity(
          [PERMISSIONS.GRAPH_READ],
          "SECRET_REF_ONLY",
        ),
      ).toBe(false);
      expect(
        canAccessGraphSnapshotSensitivity(
          [PERMISSIONS.ADMIN_ALL],
          "SECRET_REF_ONLY",
        ),
      ).toBe(true);
    });

    it("defaults null/undefined sensitivity to INTERNAL", () => {
      expect(
        canAccessGraphSnapshotSensitivity([PERMISSIONS.GRAPH_READ], null),
      ).toBe(true);
      expect(
        canAccessGraphSnapshotSensitivity([PERMISSIONS.KNOWLEDGE_READ], null),
      ).toBe(false);
    });
  });

  describe("buildGraphSnapshotSensitivitySqlFragment", () => {
    it("returns empty string for admin (no filter)", () => {
      expect(
        buildGraphSnapshotSensitivitySqlFragment([PERMISSIONS.ADMIN_ALL]),
      ).toBe("");
    });

    it("returns PUBLIC/INTERNAL filter for graph:read holders", () => {
      const frag = buildGraphSnapshotSensitivitySqlFragment([
        PERMISSIONS.GRAPH_READ,
      ]);
      expect(frag).toContain("sensitivity NOT IN");
      expect(frag).toContain("RESTRICTED");
      expect(frag).toContain("SECRET_REF_ONLY");
    });

    it("returns no-results filter when caller lacks graph:read entirely", () => {
      expect(
        buildGraphSnapshotSensitivitySqlFragment([PERMISSIONS.KNOWLEDGE_READ]),
      ).toBe("AND 1 = 0");
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @jarvis/auth test -- --run rbac`
Expected: FAIL — `canAccessGraphSnapshotSensitivity is not a function`.

- [ ] **Step 3: Add the helpers**

Append to `packages/auth/rbac.ts` (after `canAccessSensitivity`):

```ts
const GRAPH_RESTRICTED_SENSITIVITIES = [
  "RESTRICTED",
  "SECRET_REF_ONLY"
] as const;

/**
 * Can the caller see a graph_snapshot with this sensitivity?
 * PUBLIC/INTERNAL require graph:read. RESTRICTED/SECRET_REF_ONLY require admin:all
 * in P0 (a graph:review permission may be added in P1).
 * null/undefined sensitivity is treated as INTERNAL.
 */
export function canAccessGraphSnapshotSensitivity(
  permissions: string[],
  sensitivity: string | null | undefined
): boolean {
  const effective = sensitivity ?? "INTERNAL";

  if (
    GRAPH_RESTRICTED_SENSITIVITIES.includes(
      effective as (typeof GRAPH_RESTRICTED_SENSITIVITIES)[number]
    )
  ) {
    return permissions.includes(PERMISSIONS.ADMIN_ALL);
  }

  return (
    permissions.includes(PERMISSIONS.GRAPH_READ) ||
    permissions.includes(PERMISSIONS.ADMIN_ALL)
  );
}

/**
 * SQL fragment to append to a WHERE clause that already references
 * `graph_snapshot` (or an alias of it). The fragment assumes the column
 * `sensitivity` is resolvable; callers that use a table alias must rewrite
 * `sensitivity` accordingly, mirroring the pattern used in packages/ai/ask.ts
 * for buildKnowledgeSensitivitySqlFilter.
 */
export function buildGraphSnapshotSensitivitySqlFragment(
  permissions: string[]
): string {
  if (permissions.includes(PERMISSIONS.ADMIN_ALL)) {
    return "";
  }
  if (permissions.includes(PERMISSIONS.GRAPH_READ)) {
    return "AND sensitivity NOT IN ('RESTRICTED', 'SECRET_REF_ONLY')";
  }
  return "AND 1 = 0";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @jarvis/auth test -- --run rbac`
Expected: PASS (10 assertions).

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/auth/rbac.ts packages/auth/rbac.test.ts
git commit -m "feat(auth): add graph snapshot sensitivity predicate and SQL fragment"
```

---

## Task 3: Add `sensitivity` column to `graph_snapshot`

**Files:**
- Modify: `packages/db/schema/graph.ts`
- Create: `packages/db/drizzle/0005_graph_snapshot_sensitivity.sql`

**Note:** `scope_type` and `scope_id` already exist on this table (migration `0004_graphify_scope_and_upsert.sql`). This task only adds `sensitivity`. Default is `'INTERNAL'` to preserve the implicit guarantee of existing snapshots and match `knowledge_page.sensitivity`.

- [ ] **Step 1: Update the Drizzle schema**

Edit `packages/db/schema/graph.ts`. Inside the `graphSnapshot` table definition, add the `sensitivity` column immediately after `scopeId: uuid('scope_id').notNull(),`:

```ts
  sensitivity: varchar('sensitivity', { length: 30 })
    .default('INTERNAL')
    .notNull(),
```

- [ ] **Step 2: Generate the migration**

Run: `pnpm db:generate`
Expected: a new file `packages/db/drizzle/0005_<random_name>.sql` is created.

- [ ] **Step 3: Rename the migration for clarity**

The auto-generated filename will be random (e.g. `0005_spicy_cobalt.sql`). Rename it:

```bash
mv packages/db/drizzle/0005_*.sql packages/db/drizzle/0005_graph_snapshot_sensitivity.sql
```

Then open `packages/db/drizzle/meta/_journal.json` and update the newly-added entry's `tag` field to match the new filename stem (`0005_graph_snapshot_sensitivity`).

- [ ] **Step 4: Inspect the migration body**

Read: `packages/db/drizzle/0005_graph_snapshot_sensitivity.sql`
Expected content:

```sql
ALTER TABLE "graph_snapshot" ADD COLUMN "sensitivity" varchar(30) DEFAULT 'INTERNAL' NOT NULL;
```

If Drizzle generated anything besides this single ALTER TABLE statement (e.g. it tried to modify unrelated tables because schema drift was discovered), stop, investigate, and do not apply the migration. Drift indicates another branch is mid-flight.

- [ ] **Step 5: Apply the migration**

Run: `pnpm db:migrate`
Expected: `0005_graph_snapshot_sensitivity` reported as applied, no errors.

Verify column exists:

```bash
docker exec -i $(docker ps --filter name=postgres -q) psql -U postgres -d jarvis -c "\d graph_snapshot" | grep sensitivity
```

Expected: a line containing `sensitivity | character varying(30) | not null default 'INTERNAL'::character varying`.

- [ ] **Step 6: Commit**

```bash
git add packages/db/schema/graph.ts packages/db/drizzle/0005_graph_snapshot_sensitivity.sql packages/db/drizzle/meta/_journal.json packages/db/drizzle/meta/0005_snapshot.json
git commit -m "feat(db): add graph_snapshot.sensitivity column (default INTERNAL)"
```

---

## Task 4: Lineage resolver (pure function + DB helper)

**Files:**
- Create: `apps/worker/src/helpers/resolve-lineage.ts`
- Create: `apps/worker/src/helpers/resolve-lineage.test.ts`

**Design:** Split into two units:
1. `computeEffectiveSensitivity(origin)` — pure function, fully testable. Given the origin resource's type and sensitivity field, returns the effective snapshot sensitivity. Rules:
   - `system` → uses `system.sensitivity`
   - `knowledge` → uses `knowledge_page.sensitivity`
   - `project` → always `'INTERNAL'` (projects have no sensitivity field in P0)
   - `attachment-fallback` (no origin resolvable) → `'INTERNAL'`
   - `workspace` (manual builds, not in P0 flow) → `'INTERNAL'`
2. `resolveLineageFromRawSource(rawSourceId)` — async DB call. Looks up the attachment row, then the origin resource, and returns `{ scopeType, scopeId, sensitivity }` ready to write into `graph_snapshot`. If no attachment row or no origin row, falls back to `attachment`/`rawSourceId`/`'INTERNAL'` (preserving current behavior).

**Important scope constraint:** The existing `graph_scope_type` enum in migration `0004` only has values `'attachment' | 'project' | 'system' | 'workspace'`. `'knowledge'` is **not** a valid `scopeType` in P0. For knowledge-origin attachments we still inherit the page's sensitivity, but we keep `scopeType='attachment'` and `scopeId=rawSourceId`. Adding `'knowledge'` to the enum is deferred to a follow-up (requires `ALTER TYPE ... ADD VALUE` and cannot be mixed with its own use in one transaction).

- [ ] **Step 1: Write the failing test**

Create `apps/worker/src/helpers/resolve-lineage.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeEffectiveSensitivity } from "./resolve-lineage.js";

describe("computeEffectiveSensitivity", () => {
  it("returns 'INTERNAL' for null origin (no attachment)", () => {
    expect(computeEffectiveSensitivity(null)).toBe("INTERNAL");
  });

  it("returns 'INTERNAL' for project (projects have no sensitivity field in P0)", () => {
    expect(
      computeEffectiveSensitivity({ type: "project", sensitivity: null }),
    ).toBe("INTERNAL");
  });

  it("mirrors system.sensitivity for system origins", () => {
    expect(
      computeEffectiveSensitivity({ type: "system", sensitivity: "RESTRICTED" }),
    ).toBe("RESTRICTED");
    expect(
      computeEffectiveSensitivity({ type: "system", sensitivity: "INTERNAL" }),
    ).toBe("INTERNAL");
  });

  it("mirrors knowledge_page.sensitivity for knowledge origins", () => {
    expect(
      computeEffectiveSensitivity({ type: "knowledge", sensitivity: "PUBLIC" }),
    ).toBe("PUBLIC");
    expect(
      computeEffectiveSensitivity({
        type: "knowledge",
        sensitivity: "SECRET_REF_ONLY",
      }),
    ).toBe("SECRET_REF_ONLY");
  });

  it("defaults null system/knowledge sensitivity to INTERNAL", () => {
    expect(
      computeEffectiveSensitivity({ type: "system", sensitivity: null }),
    ).toBe("INTERNAL");
    expect(
      computeEffectiveSensitivity({ type: "knowledge", sensitivity: null }),
    ).toBe("INTERNAL");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @jarvis/worker test -- --run resolve-lineage`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the resolver**

Create `apps/worker/src/helpers/resolve-lineage.ts`:

```ts
// apps/worker/src/helpers/resolve-lineage.ts

import { db } from '@jarvis/db/client';
import { attachment } from '@jarvis/db/schema/file';
import { project } from '@jarvis/db/schema/project';
import { system } from '@jarvis/db/schema/system';
import { knowledgePage } from '@jarvis/db/schema/knowledge';
import { eq, and } from 'drizzle-orm';

/**
 * Origin resource descriptor — what we learned about the root resource
 * behind a given raw_source. `null` means no attachment row was found
 * (manual upload with no resource link).
 */
export type Origin =
  | null
  | { type: 'project'; sensitivity: null }
  | { type: 'system'; sensitivity: string | null }
  | { type: 'knowledge'; sensitivity: string | null };

export interface ResolvedLineage {
  // Constrained to the enum values in `graph_scope_type` (migration 0004).
  // 'knowledge' is intentionally absent — see the scope constraint note above.
  scopeType: 'attachment' | 'project' | 'system' | 'workspace';
  scopeId: string;
  sensitivity: string;
}

/**
 * Pure function: effective snapshot sensitivity from origin descriptor.
 * Kept separate from DB I/O for unit testing.
 */
export function computeEffectiveSensitivity(origin: Origin): string {
  if (!origin) return 'INTERNAL';
  if (origin.type === 'project') return 'INTERNAL';
  return origin.sensitivity ?? 'INTERNAL';
}

/**
 * Look up the attachment for a raw_source and climb to its origin resource.
 * Returns a lineage descriptor ready to write into graph_snapshot. Falls back
 * to attachment/rawSourceId/INTERNAL when no resolvable origin exists.
 */
export async function resolveLineageFromRawSource(
  rawSourceId: string,
): Promise<ResolvedLineage> {
  const [att] = await db
    .select({
      resourceType: attachment.resourceType,
      resourceId: attachment.resourceId,
    })
    .from(attachment)
    .where(eq(attachment.rawSourceId, rawSourceId))
    .limit(1);

  if (!att) {
    return {
      scopeType: 'attachment',
      scopeId: rawSourceId,
      sensitivity: 'INTERNAL',
    };
  }

  let origin: Origin = null;

  if (att.resourceType === 'project') {
    const [row] = await db
      .select({ id: project.id })
      .from(project)
      .where(eq(project.id, att.resourceId))
      .limit(1);
    if (row) origin = { type: 'project', sensitivity: null };
  } else if (att.resourceType === 'system') {
    const [row] = await db
      .select({ sensitivity: system.sensitivity })
      .from(system)
      .where(eq(system.id, att.resourceId))
      .limit(1);
    if (row) origin = { type: 'system', sensitivity: row.sensitivity };
  } else if (att.resourceType === 'knowledge') {
    const [row] = await db
      .select({ sensitivity: knowledgePage.sensitivity })
      .from(knowledgePage)
      .where(eq(knowledgePage.id, att.resourceId))
      .limit(1);
    if (row) origin = { type: 'knowledge', sensitivity: row.sensitivity };
  }

  if (!origin) {
    // Unknown resource_type or missing row — fall back to attachment scope
    return {
      scopeType: 'attachment',
      scopeId: rawSourceId,
      sensitivity: 'INTERNAL',
    };
  }

  if (origin.type === 'knowledge') {
    // `graph_scope_type` enum does not include 'knowledge' in P0.
    // Preserve the attachment scope, but still inherit the page's sensitivity.
    return {
      scopeType: 'attachment',
      scopeId: rawSourceId,
      sensitivity: computeEffectiveSensitivity(origin),
    };
  }

  return {
    scopeType: origin.type, // 'project' | 'system'
    scopeId: att.resourceId,
    sensitivity: computeEffectiveSensitivity(origin),
  };
}
```

Note: if `attachment.resourceType === 'project'` but the project exists, sensitivity is `null` inside the origin, which `computeEffectiveSensitivity` maps to `'INTERNAL'` via the explicit project branch.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @jarvis/worker test -- --run resolve-lineage`
Expected: PASS (6 tests).

- [ ] **Step 5: Type check**

Run: `pnpm type-check`
Expected: PASS.

If the `and` import is unused because of a linter warning, remove it. If Drizzle flags missing exports for `attachment`/`project`/`system`/`knowledgePage`, verify they're named exports in `packages/db/schema/file.ts`, `project.ts`, `system.ts`, `knowledge.ts` (they are — see existing schema files).

- [ ] **Step 6: Commit**

```bash
git add apps/worker/src/helpers/resolve-lineage.ts apps/worker/src/helpers/resolve-lineage.test.ts
git commit -m "feat(worker): add lineage resolver for graph_snapshot scope + sensitivity"
```

---

## Task 5: Use lineage in `graphify-build` job

**Files:**
- Modify: `apps/worker/src/jobs/graphify-build.ts`

**Scope:** The job currently hardcodes `scopeType: 'attachment', scopeId: rawSourceId` on snapshot insert, and passes `sensitivity: 'INTERNAL'` to both `importAsKnowledgePage` calls. Replace those three locations with the resolved lineage. Resolve once at the start of `processGraphifyBuild` (before the INSERT), and reuse the same descriptor throughout.

- [ ] **Step 1: Import the resolver**

In `apps/worker/src/jobs/graphify-build.ts`, add to the imports near the top (next to the existing `import { importAsKnowledgePage, slugify } from '../helpers/import-knowledge.js';`):

```ts
import { resolveLineageFromRawSource } from '../helpers/resolve-lineage.js';
```

- [ ] **Step 2: Resolve lineage before the initial INSERT**

Inside `processGraphifyBuild`, immediately after the `console.log('[graphify-build] Starting ...')` line and before the `await db.insert(graphSnapshot).values({ ... })` call, add:

```ts
  const lineage = await resolveLineageFromRawSource(rawSourceId);
  console.log(
    `[graphify-build] Resolved lineage scopeType=${lineage.scopeType} scopeId=${lineage.scopeId} sensitivity=${lineage.sensitivity}`,
  );
```

- [ ] **Step 3: Use lineage in the INSERT**

Replace the current `scopeType: 'attachment', scopeId: rawSourceId,` lines in the `db.insert(graphSnapshot).values({ ... })` block with:

```ts
    scopeType: lineage.scopeType,
    scopeId: lineage.scopeId,
    sensitivity: lineage.sensitivity,
```

- [ ] **Step 4: Use lineage sensitivity for the report import**

Find the `importAsKnowledgePage` call for `GRAPH_REPORT.md` (around the `reportContent` block). Replace `sensitivity: 'INTERNAL',` with:

```ts
        sensitivity: lineage.sensitivity,
```

- [ ] **Step 5: Use lineage sensitivity for wiki imports**

Find the second `importAsKnowledgePage` call inside the `for (const wikiFile of mdFiles)` loop. Replace `sensitivity: 'INTERNAL',` with:

```ts
          sensitivity: lineage.sensitivity,
```

- [ ] **Step 6: Type check**

Run: `pnpm type-check`
Expected: PASS.

If `drizzle-kit` complains about the new `sensitivity` key on the `graphSnapshot` insert, re-run `pnpm db:generate` and confirm the schema file from Task 3 is on disk.

- [ ] **Step 7: Manual smoke test (optional but recommended)**

If you have a running dev stack (`pnpm dev` + postgres + minio + pg-boss):

1. Upload a ZIP file via the knowledge UI as an attachment on a `system` with `sensitivity='RESTRICTED'`.
2. Trigger `POST /api/graphify/build` with the resulting `rawSourceId`.
3. After the worker logs `Completed snapshotId=...`, query:

   ```bash
   docker exec -i $(docker ps --filter name=postgres -q) psql -U postgres -d jarvis \
     -c "SELECT scope_type, scope_id, sensitivity FROM graph_snapshot ORDER BY created_at DESC LIMIT 1;"
   ```

   Expected: `scope_type=system`, `scope_id=<system uuid>`, `sensitivity=RESTRICTED`.

If you don't have the stack running, skip this and rely on Tasks 6–8 to catch the integration.

- [ ] **Step 8: Commit**

```bash
git add apps/worker/src/jobs/graphify-build.ts
git commit -m "feat(worker): propagate attachment lineage into graph_snapshot and knowledge imports"
```

---

## Task 6: Gate `GET /api/graphify/snapshots/[id]/graph` with `graph:read` + sensitivity check

**Files:**
- Modify: `apps/web/app/api/graphify/snapshots/[id]/graph/route.ts`
- Create: `apps/web/app/api/graphify/snapshots/[id]/graph/route.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/app/api/graphify/snapshots/[id]/graph/route.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock session lookup & DB before importing the route
vi.mock("@jarvis/auth/session", () => ({
  getSession: vi.fn(),
}));
vi.mock("@jarvis/db/client", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => []),
        })),
      })),
    })),
  },
}));
vi.mock("minio", () => ({
  Client: vi.fn(() => ({
    presignedGetObject: vi.fn(async () => "https://minio.local/presigned"),
  })),
}));

import { GET } from "./route";
import { getSession } from "@jarvis/auth/session";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";

function makeRequest(sessionId = "test-session") {
  return new Request("http://localhost/api/graphify/snapshots/abc/graph", {
    headers: { "x-session-id": sessionId },
  }) as unknown as import("next/server").NextRequest;
}

describe("GET /api/graphify/snapshots/[id]/graph", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 when caller lacks graph:read", async () => {
    vi.mocked(getSession).mockResolvedValue({
      id: "s",
      userId: "u",
      workspaceId: "w",
      employeeId: "e",
      name: "n",
      roles: ["VIEWER"],
      permissions: [PERMISSIONS.KNOWLEDGE_READ], // no graph:read
      ssoSubject: "x",
      createdAt: 0,
      expiresAt: Date.now() + 10_000,
    });

    const res = await GET(makeRequest(), {
      params: Promise.resolve({ id: "abc" }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 401 without a session", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const res = await GET(makeRequest(), {
      params: Promise.resolve({ id: "abc" }),
    });
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @jarvis/web test -- --run snapshots/\\[id\\]/graph/route`
Expected: FAIL — the current handler uses `knowledge:read`, so a caller with only `knowledge:read` currently passes the gate (test expects 403, gets 200/404).

- [ ] **Step 3: Swap the permission and add sensitivity check**

Edit `apps/web/app/api/graphify/snapshots/[id]/graph/route.ts`:

1. Add this import near the existing `@jarvis/auth`/`drizzle-orm` imports:

   ```ts
   import { canAccessGraphSnapshotSensitivity } from "@jarvis/auth/rbac";
   ```

2. Change the `requireApiSession` call:

   ```ts
   const auth = await requireApiSession(req, 'graph:read');
   ```

   (was `'knowledge:read'`)

3. After the snapshot lookup, before the `const fileType = ...` line, add the sensitivity check:

   ```ts
     if (
       !canAccessGraphSnapshotSensitivity(session.permissions, snapshot.sensitivity)
     ) {
       return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
     }
   ```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @jarvis/web test -- --run snapshots/\\[id\\]/graph/route`
Expected: PASS (2 tests).

- [ ] **Step 5: Type check**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/api/graphify/snapshots/[id]/graph/route.ts apps/web/app/api/graphify/snapshots/[id]/graph/route.test.ts
git commit -m "feat(api): gate graph fetch endpoint with graph:read + snapshot sensitivity"
```

---

## Task 7: Gate `POST /api/graphify/build` with `graph:build`

**Files:**
- Modify: `apps/web/app/api/graphify/build/route.ts`
- Create: `apps/web/app/api/graphify/build/route.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/app/api/graphify/build/route.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@jarvis/auth/session", () => ({
  getSession: vi.fn(),
}));
vi.mock("@jarvis/db/client", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => []),
        })),
      })),
    })),
  },
}));
vi.mock("pg-boss", () => {
  const sendMock = vi.fn(async () => "job-id");
  const startMock = vi.fn(async () => undefined);
  return {
    default: vi.fn(() => ({ send: sendMock, start: startMock })),
  };
});

import { POST } from "./route";
import { getSession } from "@jarvis/auth/session";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/graphify/build", {
    method: "POST",
    headers: {
      "x-session-id": "test-session",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}

describe("POST /api/graphify/build", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 for a caller with graph:read but no graph:build (VIEWER)", async () => {
    vi.mocked(getSession).mockResolvedValue({
      id: "s",
      userId: "u",
      workspaceId: "w",
      employeeId: "e",
      name: "n",
      roles: ["VIEWER"],
      permissions: [PERMISSIONS.GRAPH_READ], // no graph:build
      ssoSubject: "x",
      createdAt: 0,
      expiresAt: Date.now() + 10_000,
    });

    const res = await POST(
      makeRequest({ rawSourceId: "00000000-0000-0000-0000-000000000001" }),
    );
    expect(res.status).toBe(403);
  });

  it("returns 401 without a session", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const res = await POST(
      makeRequest({ rawSourceId: "00000000-0000-0000-0000-000000000001" }),
    );
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @jarvis/web test -- --run graphify/build/route`
Expected: FAIL — the current handler uses `knowledge:create`, so a VIEWER with only `graph:read` gets a different status than 403.

- [ ] **Step 3: Swap the permission**

Edit `apps/web/app/api/graphify/build/route.ts`. Change the `requireApiSession` call:

```ts
  const auth = await requireApiSession(req, 'graph:build');
```

(was `'knowledge:create'`)

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @jarvis/web test -- --run graphify/build/route`
Expected: PASS (2 tests).

- [ ] **Step 5: Type check**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/api/graphify/build/route.ts apps/web/app/api/graphify/build/route.test.ts
git commit -m "feat(api): gate graphify build endpoint with graph:build"
```

---

## Task 8: Gate `ArchitecturePage` with `graph:read` + sensitivity filter

**Files:**
- Modify: `apps/web/app/(app)/architecture/page.tsx`

**Scope:** `requirePageSession` already accepts an optional `permission` argument that redirects to `/dashboard` on failure. Add `'graph:read'`, and after fetching snapshots, filter them by `canAccessGraphSnapshotSensitivity`. Testing is deferred to E2E — this is a server component and the existing test infra doesn't cover it. A manual check via the dev server is sufficient for P0.

- [ ] **Step 1: Gate the page**

In `apps/web/app/(app)/architecture/page.tsx`:

1. Add this import next to the existing `@/lib/server/page-auth` import:

   ```ts
   import { canAccessGraphSnapshotSensitivity } from '@jarvis/auth/rbac';
   ```

2. Change `const session = await requirePageSession();` to:

   ```ts
   const session = await requirePageSession('graph:read');
   ```

- [ ] **Step 2: Filter the snapshot list**

Immediately after the existing `.orderBy(desc(graphSnapshot.createdAt)).limit(20);` query result is stored in `snapshots`, add a sensitivity filter that drops anything the caller can't see:

```ts
  const authorizedSnapshots = snapshots.filter((s) =>
    canAccessGraphSnapshotSensitivity(session.permissions, s.sensitivity),
  );
```

Then replace every subsequent reference to `snapshots` (in `current`, `serializedSnapshots`) with `authorizedSnapshots`:

```ts
  const current = selectedId
    ? (authorizedSnapshots.find((s) => s.id === selectedId) ?? authorizedSnapshots[0])
    : authorizedSnapshots[0];

  // ...

  const serializedSnapshots = authorizedSnapshots.map((s) => ({
    id: s.id,
    title: s.title,
    createdAt: s.createdAt.toISOString(),
    buildMode: s.buildMode,
  }));
```

Note: the "empty state" branch (`if (!current)`) will now also render when every snapshot was filtered out. The copy is already appropriate ("아직 Graphify 분석 결과가 없습니다...").

- [ ] **Step 3: Type check**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 4: Manual smoke test**

If dev stack is running:
1. Log in as a user with `VIEWER` role → `/architecture` should load (since VIEWER has `graph:read` after Task 1).
2. Log in as a user with only `HR` role → visiting `/architecture` should redirect to `/dashboard`.
3. If possible, seed a snapshot with `sensitivity='RESTRICTED'` and confirm a non-admin does not see it in the list.

Skip this if no dev stack is available.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/\(app\)/architecture/page.tsx
git commit -m "feat(ui): gate architecture page with graph:read and filter by sensitivity"
```

---

## Task 9: Authorize `retrieveRelevantGraphContext` by permission + sensitivity

**Files:**
- Modify: `packages/ai/graph-context.ts`
- Modify: `packages/ai/ask.ts` (signature update only if needed)

**Scope:** Currently `retrieveRelevantGraphContext` always pulls the single latest `done` snapshot for the workspace. After Task 3 adds `sensitivity`, this is unsafe — a DEVELOPER asking "explain the system" could end up with a RESTRICTED snapshot's graph as context. Fix: select from snapshots the caller is authorized for, ordered by `createdAt desc`.

Note: `askAI` already passes `userPermissions` into `retrieveRelevantClaims`. The existing `retrieveRelevantGraphContext` signature in `packages/ai/ask.ts` at the call site appears to accept an options object (`{ explicitSnapshotId }`). When editing, adapt to whichever signature is currently on disk — this task only adds a `permissions` input; it does not restructure the options object.

- [ ] **Step 1: Read the current `retrieveRelevantGraphContext` signature**

Run: `pnpm --filter @jarvis/ai exec tsc --noEmit` once before editing to confirm the baseline compiles.

Open `packages/ai/graph-context.ts` and note:
- The exact current signature of `retrieveRelevantGraphContext` (2-arg or 3-arg with options).
- Whether `GraphContext` already has `snapshotId`/`snapshotTitle` fields (the `ask.ts` caller appears to read `ctx.snapshotTitle`).

If the function is still the 2-arg version (`question, workspaceId`), proceed as described below. If it has already been migrated to 3-arg with `{ explicitSnapshotId }`, add `permissions` as an additional field of the same options object rather than a new positional arg. Both branches should end up with identical runtime behavior.

- [ ] **Step 2: Add `permissions` to the signature**

For the 2-arg baseline, change the function declaration from:

```ts
export async function retrieveRelevantGraphContext(
  question: string,
  workspaceId: string,
): Promise<GraphContext | null> {
```

to:

```ts
export async function retrieveRelevantGraphContext(
  question: string,
  workspaceId: string,
  permissions: string[],
): Promise<GraphContext | null> {
```

For the options-object variant, add `permissions: string[]` to the options type and pass it through.

- [ ] **Step 3: Filter the snapshot pick by sensitivity**

At the very top of the function body, replace the existing "find latest done snapshot" query with a version that uses `buildGraphSnapshotSensitivitySqlFragment`.

Add this import at the top of the file:

```ts
import { buildGraphSnapshotSensitivitySqlFragment } from '@jarvis/auth/rbac';
```

Replace the current snapshot lookup:

```ts
  const [snapshot] = await db
    .select({ id: graphSnapshot.id })
    .from(graphSnapshot)
    .where(
      and(
        eq(graphSnapshot.workspaceId, workspaceId),
        eq(graphSnapshot.buildStatus, 'done'),
      ),
    )
    .orderBy(desc(graphSnapshot.createdAt))
    .limit(1);
```

with:

```ts
  const sensitivityFragment = buildGraphSnapshotSensitivitySqlFragment(permissions);
  // Early exit: caller cannot see any graph snapshots at all
  if (sensitivityFragment === 'AND 1 = 0') return null;

  const sensitivityClause = sensitivityFragment
    ? sql.raw(' ' + sensitivityFragment.replace(/\bsensitivity\b/g, 'graph_snapshot.sensitivity'))
    : sql.empty();

  const snapshotRows = await db.execute<{ id: string }>(sql`
    SELECT id
    FROM graph_snapshot
    WHERE workspace_id = ${workspaceId}::uuid
      AND build_status = 'done'
      ${sensitivityClause}
    ORDER BY created_at DESC
    LIMIT 1
  `);

  const snapshot = snapshotRows.rows[0];
  if (!snapshot) return null;
```

This keeps the rest of the function (keyword extraction, node/edge/community queries) untouched — they operate on a single `snapshot.id`, which is already filtered.

- [ ] **Step 4: Update `ask.ts` caller**

In `packages/ai/ask.ts`, find the `retrieveRelevantGraphContext` call inside `askAI`. Add `userPermissions` (which is already in scope via `query.userPermissions`) as the new argument:

- 2-arg → 3-arg variant: replace `retrieveRelevantGraphContext(question, workspaceId)` with `retrieveRelevantGraphContext(question, workspaceId, userPermissions)`.
- options-object variant: add `permissions: userPermissions` to the options object.

- [ ] **Step 5: Type check**

Run: `pnpm type-check`
Expected: PASS.

Run: `pnpm --filter @jarvis/ai test -- --run` (existing `ask.test.ts` suite)
Expected: existing tests still pass. If an existing test calls `retrieveRelevantGraphContext` with the old signature, update it to pass an explicit `[PERMISSIONS.GRAPH_READ]` array.

- [ ] **Step 6: Commit**

```bash
git add packages/ai/graph-context.ts packages/ai/ask.ts
git commit -m "feat(ai): restrict graph context retrieval to authorized snapshots"
```

---

## Task 10: Full-repo verification

**Files:** none modified.

- [ ] **Step 1: Full type check**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 2: Full test run**

Run: `pnpm test`
Expected: all previously-passing suites still pass; 4 new suites from this plan pass.

- [ ] **Step 3: Lint**

Run: `pnpm --filter @jarvis/web lint`
Expected: PASS.

- [ ] **Step 4: Schema drift check**

Run: `node scripts/check-schema-drift.mjs`
Expected: reports "in sync" or equivalent; no drift from the `0005_graph_snapshot_sensitivity.sql` migration.

- [ ] **Step 5: Review uncommitted state**

Run: `git status`
Expected: a clean working tree; all commits already made in previous tasks.

- [ ] **Step 6: Summary commit (empty, if needed for tagging the P0)**

Skip this step if previous commits are sufficient. Otherwise tag the completion:

```bash
git tag p0-graph-permission-gate
```

---

## Post-P0 Follow-ups (NOT in this plan)

These are intentionally deferred. Link this plan from any P1 plan that continues the work:

1. **Node/edge sensitivity materialization** — only if mixed-sensitivity archives actually appear in production. Prefer splitting snapshots over column materialization.
2. **Filtered-JSON GraphViewer mode** — required before RESTRICTED graphs can be rendered in the UI at all. Until then, RESTRICTED snapshots are fetchable via API but their iframe HTML is hidden by the page-level filter in Task 8.
3. **`graph:review` permission** — for INFERRED/AMBIGUOUS edge visibility.
4. **Policy-aware `.graphifyignore`** — build-time secret exclusion.
5. **Central `authorize()` engine** — absorb `canAccessKnowledgeSensitivity`, `canAccessSystemAccessEntry`, `canResolveSystemSecrets`, and the two new graph helpers into one dispatcher.
6. **Postgres RLS on workspace scope** — covers all tables, not just graph.
7. **Relationship-attribute staleness** — make `project_staff` (and other relationship tables) queried per-request instead of stored in the 8-hour session blob.
