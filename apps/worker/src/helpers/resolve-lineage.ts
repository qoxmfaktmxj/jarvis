// apps/worker/src/helpers/resolve-lineage.ts

import { db } from '@jarvis/db/client';
import { eq } from 'drizzle-orm';
import { attachment } from '@jarvis/db/schema/file';
// parallel worker renamed schema module system → project; alias locally to
// keep domain-layer 'system' resourceType/scopeType strings unchanged here.
import { project as system } from '@jarvis/db/schema/project';
import { knowledgePage } from '@jarvis/db/schema/knowledge';

/**
 * Origin resource descriptor — what we learned about the root resource
 * behind a given raw_source. `null` means no attachment row was found.
 */
export type Origin =
  | null
  | { type: 'system'; sensitivity: string | null }
  | { type: 'knowledge'; sensitivity: string | null };

export interface ResolvedLineage {
  // Constrained to the enum values in `graph_scope_type` (migration 0004).
  // 'knowledge' is intentionally absent — knowledge attachments use scopeType='attachment'.
  scopeType: 'attachment' | 'system' | 'workspace';
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

  if (att.resourceType === 'system') {
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
    return {
      scopeType: 'attachment',
      scopeId: rawSourceId,
      sensitivity: 'INTERNAL',
    };
  }

  if (origin.type === 'knowledge') {
    // `graph_scope_type` enum does not include 'knowledge' in P0.
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
