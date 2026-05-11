// apps/worker/src/helpers/resolve-lineage.ts

import { db } from '@jarvis/db/client';
import { eq } from 'drizzle-orm';
import { attachment } from '@jarvis/db/schema/file';

// Step 2D (2026-05-11): graph_snapshot.sensitivity 제거 (D2=B). raw_source / project /
// knowledge sensitivity 모두 도메인별 정책에서 제거되었으므로 lineage 결과에서도
// sensitivity 정보를 도출하지 않는다. scope (workspace / project / attachment) 만
// 그대로 유지한다.

export interface ResolvedLineage {
  // Constrained to the enum values in `graph_scope_type` after migration 0030.
  // 'knowledge' is intentionally absent — knowledge attachments use scopeType='attachment'.
  scopeType: 'attachment' | 'project' | 'workspace';
  scopeId: string;
}

/**
 * Look up the attachment for a raw_source and climb to its origin resource.
 * Returns a lineage descriptor ready to write into graph_snapshot. Falls back
 * to attachment/rawSourceId when no resolvable origin exists.
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
    };
  }

  // knowledge attachments map to scopeType='attachment' (graph_scope_type enum
  // does not include 'knowledge'). 'system' is a legacy resource_type that
  // points at project rows (migration 0030 renamed system → project).
  if (att.resourceType === 'system' || att.resourceType === 'project') {
    return {
      scopeType: 'project',
      scopeId: att.resourceId,
    };
  }

  return {
    scopeType: 'attachment',
    scopeId: rawSourceId,
  };
}
