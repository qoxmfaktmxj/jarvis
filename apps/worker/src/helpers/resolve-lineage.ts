// apps/worker/src/helpers/resolve-lineage.ts

import { db } from '@jarvis/db/client';
import { eq } from 'drizzle-orm';
import { attachment } from '@jarvis/db/schema/file';
// schema module renamed system → project in migration 0030. Legacy attachment
// rows may still have resource_type='system' pointing at project rows.
import { project } from '@jarvis/db/schema/project';
import { knowledgePage } from '@jarvis/db/schema/knowledge';

/**
 * Origin resource descriptor — what we learned about the root resource
 * behind a given raw_source. `null` means no attachment row was found.
 * 'system' is kept for legacy attachment rows; new rows use 'project'.
 */
export type Origin =
  | null
  | { type: 'system'; sensitivity: string | null }
  | { type: 'project'; sensitivity: string | null }
  | { type: 'knowledge'; sensitivity: string | null };

export interface ResolvedLineage {
  // Constrained to the enum values in `graph_scope_type` after migration 0030.
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

  if (att.resourceType === 'system' || att.resourceType === 'project') {
    const [row] = await db
      .select({ sensitivity: project.sensitivity })
      .from(project)
      .where(eq(project.id, att.resourceId))
      .limit(1);
    if (row) origin = { type: att.resourceType, sensitivity: row.sensitivity };
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

  // Both legacy 'system' origins and new 'project' origins map to scopeType='project'
  // (graph_scope_type enum no longer includes 'system' after migration 0030).
  return {
    scopeType: 'project',
    scopeId: att.resourceId,
    sensitivity: computeEffectiveSensitivity(origin),
  };
}
