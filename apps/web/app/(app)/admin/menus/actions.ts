"use server";

import { requireActionPermission } from "@/lib/server/action-auth";
import { listMenus, saveMenus } from "@/lib/server/repositories/menus";
import { PERMISSIONS, listMenusInput, listMenusOutput, saveMenusInput, saveMenusOutput } from "@jarvis/shared";

export async function listMenusAction(raw: unknown) {
  const session = await requireActionPermission(PERMISSIONS.MENU_ADMIN);
  const input = listMenusInput.parse(raw);
  return listMenusOutput.parse(await listMenus({ workspaceId: session.workspaceId }, input));
}

export async function saveMenusAction(raw: unknown) {
  const session = await requireActionPermission(PERMISSIONS.MENU_ADMIN);
  const input = saveMenusInput.parse(raw);
  return saveMenusOutput.parse(await saveMenus({ workspaceId: session.workspaceId, actorUserId: session.userId }, input));
}
