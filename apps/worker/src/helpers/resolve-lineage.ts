// apps/worker/src/helpers/resolve-lineage.ts

import { db } from '@jarvis/db/client';
import { eq } from 'drizzle-orm';
import { attachment } from '@jarvis/db/schema/file';
import { project } from '@jarvis/db/schema/project';
import { knowledgePage } from '@jarvis/db/schema/knowledge';

/**
 * Origin resource descriptor — what we learned about the root resource
 * behind a given raw_source. `null` means no attachment row was found.
 */
export type Origin =
  | null
  | { type: 'project'; sensitivity: string | null }
  | { type: 'knowledge'; sensitivity: string | null };

export interface ResolvedLineage {
  // Must match `graph_scope_type` enum (migration 0030).
  // 'knowledge' is intentionally absent — knowledge attachments use scopeType='attachment'.
  scopeType: 'attachment' | 'project' | 'workspace';
  scopeId: string;
  sensitivity: string;
}

/**
 * Pure function: effective snapshot sensitivity from origin descriptor.
 * Kept separate from DB I/O for unit testing.
 */
export function computeEffectiveSensitivity(origin: Origin): string {
  if (!origin) return 'INTERNAL';
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
  // Look up attachment by rawSourceId
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

  // Migration 0030 renamed the `system` table to `project`. Existing attachment
  // rows may still store the legacy 'system' string in resource_type; accept
  // both so we don't silently drop lineage for pre-rename data.
  if (att.resourceType === 'project' || att.resourceType === 'system') {
    const [row] = await db
      .select({ sensitivity: project.sensitivity })
      .from(project)
      .where(eq(project.id, att.resourceId))
      .limit(1);
    if (row) origin = { type: 'project', sensitivity: row.sensitivity };
  } else if (att.resourceType === 'knowledge') {
    const [row] = await db
      .select({ sensitivity: knowledgePage.sensitivity })
      .from(knowledgePage)
      .where(eq(knowledgePage.id, att.resourceId))
      .limit(1);
    if (row) origin = { type: 'knowledge', sensitivity: row.sensitivity };
  }

  if (!origin) {
    return {
      scopeType: 'attachment',
      scopeId: rawSourceId,
      sensitivity: 'INTERNAL',
    };
  }

  if (origin.type === 'knowledge') {
    // `graph_scope_type` enum does not include 'knowledge'.
    return {
      scopeType: 'attachment',
      scopeId: rawSourceId,
      sensitivity: computeEffectiveSensitivity(origin),
    };
  }

  return {
    scopeType: origin.type, // 'project'
    scopeId: att.resourceId,
    sensitivity: computeEffectiveSensitivity(origin),
  };
}
