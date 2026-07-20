"use server";

import { requireActionPermission } from "@/lib/server/action-auth";
import { listUsers, saveUsers } from "@/lib/server/repositories/users";
import { PERMISSIONS, listUsersInput, listUsersOutput, saveUsersInput, saveUsersOutput } from "@jarvis/shared";

export async function listUsersAction(raw: unknown) {
  const session = await requireActionPermission(PERMISSIONS.USER_ADMIN);
  const input = listUsersInput.parse(raw);
  return listUsersOutput.parse(await listUsers({ workspaceId: session.workspaceId }, input));
}

export async function saveUsersAction(raw: unknown) {
  const session = await requireActionPermission(PERMISSIONS.USER_ADMIN);
  const input = saveUsersInput.parse(raw);
  return saveUsersOutput.parse(await saveUsers({ workspaceId: session.workspaceId, actorUserId: session.userId }, input));
}
