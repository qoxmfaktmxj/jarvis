/**
 * Returns the canonical pg_notify channel name for a workspace's chat stream.
 * Postgres LISTEN/NOTIFY uses exact-string channel matching, so dashes in UUIDs
 * must be replaced — both the notifier (actions) and the listener (SSE route)
 * must use this helper.
 */
export function chatChannel(workspaceId: string): string {
  return `chat_ws_${workspaceId.replace(/-/g, "_")}`;
}
