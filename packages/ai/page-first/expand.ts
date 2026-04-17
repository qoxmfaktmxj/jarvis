/**
 * packages/ai/page-first/expand.ts
 *
 * Phase-W2 T2 — page-first navigation step 2/4.
 *
 * 1-hop wikilink expansion over `wiki_page_link`. Given the lexical
 * shortlist (from `shortlist.ts`), fetch pages that are either linked
 * FROM or TO any shortlist page. Inbound-heavy pages (hubs) are ranked
 * first — they're typically the canonical "index" or "overview" for a
 * cluster (WIKI-AGENTS.md §7.2).
 *
 * Invariants:
 *   - fanOut cap: 30 new pages max, to bound the disk-read step that
 *     follows. Spec-mandated (planner DoD).
 *   - permission + sensitivity re-checked here as defense-in-depth; the
 *     1-hop can cross authority/sensitivity boundaries in ways the
 *     shortlist filter did not.
 */

import { sql } from "drizzle-orm";
import { db } from "@jarvis/db/client";
import { buildWikiSensitivitySqlFilter } from "@jarvis/auth/rbac";
import { pgArray } from "../sql-utils.js";

import type { ShortlistHit } from "./shortlist.js";

export interface ExpandedPage {
  id: string;
  path: string;
  title: string;
  slug: string;
  sensitivity: string;
  requiredPermission: string | null;
  origin: "shortlist" | "expand";
  inboundCount: number;
  score: number;
}

export interface ExpandOptions {
  workspaceId: string;
  userPermissions: string[];
  shortlist: ShortlistHit[];
  /** Default 30. Hard cap per plan. */
  fanOut?: number;
}

const DEFAULT_FAN_OUT = 30;

export async function expandOneHop(
  opts: ExpandOptions,
): Promise<ExpandedPage[]> {
  const { workspaceId, userPermissions, shortlist } = opts;
  const fanOut = Math.min(opts.fanOut ?? DEFAULT_FAN_OUT, DEFAULT_FAN_OUT);

  if (shortlist.length === 0) return [];

  const shortlistIds = shortlist.map((s) => s.id);
  const shortlistIdSet = new Set(shortlistIds);

  const sensitivityFilter = buildWikiSensitivitySqlFilter(userPermissions, {
    column: "wpi.sensitivity",
  }).trim();
  const sensitivityClause = sensitivityFilter
    ? sql.raw(` ${sensitivityFilter}`)
    : sql.empty();

  // Aggregate the 1-hop neighbors (either direction) with inbound count.
  // inbound_count is across ALL links in the workspace, not just from the
  // shortlist — that's what gives us "hub page first" ordering.
  const rows = await db.execute<{
    id: string;
    path: string;
    title: string;
    slug: string;
    sensitivity: string;
    required_permission: string | null;
    inbound_count: number;
  }>(sql`
    WITH hops AS (
      -- outbound: shortlist → neighbor
      SELECT wpl.to_page_id AS neighbor_id
      FROM wiki_page_link wpl
      WHERE wpl.workspace_id = ${workspaceId}::uuid
        AND wpl.from_page_id = ANY(${pgArray(shortlistIds, 'uuid')})
        AND wpl.to_page_id IS NOT NULL
      UNION
      -- inbound: neighbor → shortlist
      SELECT wpl.from_page_id AS neighbor_id
      FROM wiki_page_link wpl
      WHERE wpl.workspace_id = ${workspaceId}::uuid
        AND wpl.to_page_id = ANY(${pgArray(shortlistIds, 'uuid')})
    ),
    -- Pre-aggregate inbound counts ONCE per workspace to avoid N+1 from
    -- LEFT JOIN LATERAL (which would re-execute COUNT(*) per row).
    inbound_counts AS (
      SELECT wpl2.to_page_id AS page_id, COUNT(*)::int AS cnt
      FROM wiki_page_link wpl2
      WHERE wpl2.workspace_id = ${workspaceId}::uuid
        AND wpl2.to_page_id IS NOT NULL
      GROUP BY wpl2.to_page_id
    )
    SELECT
      wpi.id,
      wpi.path,
      wpi.title,
      wpi.slug,
      wpi.sensitivity,
      wpi.required_permission,
      COALESCE(ic.cnt, 0)::int AS inbound_count
    FROM hops
    JOIN wiki_page_index wpi ON wpi.id = hops.neighbor_id
    LEFT JOIN inbound_counts ic ON ic.page_id = wpi.id
    WHERE wpi.workspace_id = ${workspaceId}::uuid
      AND wpi.published_status = 'published'
      AND wpi.stale = FALSE
      ${sensitivityClause}
    ORDER BY inbound_count DESC, wpi.updated_at DESC
    LIMIT ${fanOut}
`);

  const permSet = new Set(userPermissions);
  const neighbors: ExpandedPage[] = rows.rows
    .filter((r) => !shortlistIdSet.has(r.id))
    .filter(
      (r) =>
        !r.required_permission ||
        permSet.has(r.required_permission) ||
        permSet.has("admin:all"),
    )
    .map((r) => ({
      id: r.id,
      path: r.path,
      title: r.title,
      slug: r.slug,
      sensitivity: r.sensitivity,
      requiredPermission: r.required_permission,
      origin: "expand" as const,
      inboundCount: Number(r.inbound_count),
      // Score: inboundCount is primary signal; expansion is always lower-ranked
      // than any original shortlist hit, so we normalize down by a factor.
      score: Number(r.inbound_count) / 10,
    }));

  // Union with the shortlist in shortlist-first order so callers see a
  // stable "original → neighbor" ranking.
  const union: ExpandedPage[] = [
    ...shortlist.map(
      (s): ExpandedPage => ({
        id: s.id,
        path: s.path,
        title: s.title,
        slug: s.slug,
        sensitivity: s.sensitivity,
        requiredPermission: s.requiredPermission,
        origin: "shortlist",
        inboundCount: 0,
        score: s.score,
      }),
    ),
    ...neighbors,
  ];

  return union;
}
