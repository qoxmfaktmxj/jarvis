"use server";

import { requireActionPermission } from "@/lib/server/action-auth";
import { listCodeGroups, listCodeItems, saveCodeGroups, saveCodeItems } from "@/lib/server/repositories/codes";
import {
  PERMISSIONS,
  listCodeGroupsInput,
  listCodeGroupsOutput,
  listCodeItemsInput,
  listCodeItemsOutput,
  saveCodeGroupsInput,
  saveCodeGroupsOutput,
  saveCodeItemsInput,
  saveCodeItemsOutput,
} from "@jarvis/shared";

export async function listCodeGroupsAction(raw: unknown) {
  const session = await requireActionPermission(PERMISSIONS.CODE_ADMIN);
  const input = listCodeGroupsInput.parse(raw);
  return listCodeGroupsOutput.parse(await listCodeGroups({ workspaceId: session.workspaceId }, input));
}

export async function listCodeItemsAction(raw: unknown) {
  const session = await requireActionPermission(PERMISSIONS.CODE_ADMIN);
  const input = listCodeItemsInput.parse(raw);
  return listCodeItemsOutput.parse(await listCodeItems({ workspaceId: session.workspaceId }, input));
}

export async function saveCodeGroupsAction(raw: unknown) {
  const session = await requireActionPermission(PERMISSIONS.CODE_ADMIN);
  const input = saveCodeGroupsInput.parse(raw);
  return saveCodeGroupsOutput.parse(await saveCodeGroups({ workspaceId: session.workspaceId, actorUserId: session.userId }, input));
}

export async function saveCodeItemsAction(raw: unknown) {
  const session = await requireActionPermission(PERMISSIONS.CODE_ADMIN);
  const input = saveCodeItemsInput.parse(raw);
  return saveCodeItemsOutput.parse(await saveCodeItems({ workspaceId: session.workspaceId, actorUserId: session.userId }, input));
}
