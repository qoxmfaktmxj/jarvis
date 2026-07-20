"use server";

import { requireActionPermission } from "@/lib/server/action-auth";
import { listLlmUsage } from "@/lib/server/repositories/llm-usage";
import { PERMISSIONS } from "@jarvis/shared";

export async function listLlmUsageAction(raw: unknown) {
  const session = await requireActionPermission(PERMISSIONS.LLM_USAGE_READ);
  return listLlmUsage({ workspaceId: session.workspaceId }, raw);
}
