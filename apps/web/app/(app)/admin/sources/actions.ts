"use server";

import { requireActionPermission } from "@/lib/server/action-auth";
import { getSourcePreview, listSources, queueSourceIngest } from "@/lib/server/repositories/sources";
import { PERMISSIONS } from "@jarvis/shared";

export async function listSourcesAction(raw: unknown) {
  const session = await requireActionPermission(PERMISSIONS.SOURCE_INGEST);
  return listSources({ workspaceId: session.workspaceId }, raw);
}

export async function queueSourceIngestAction(raw: unknown) {
  const session = await requireActionPermission(PERMISSIONS.SOURCE_INGEST);
  return queueSourceIngest({ workspaceId: session.workspaceId, actorUserId: session.userId }, raw);
}

export async function getSourcePreviewAction(raw: unknown) {
  const session = await requireActionPermission(PERMISSIONS.SOURCE_INGEST);
  try {
    const preview = await getSourcePreview({ workspaceId: session.workspaceId }, raw);
    return { ok: true as const, preview };
  } catch {
    return { ok: false as const };
  }
}
