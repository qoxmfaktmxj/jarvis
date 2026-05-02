"use client";

import { useTabHotkeys } from "./useTabHotkeys";
import { PendingCloseDialog } from "./PendingCloseDialog";

/**
 * Client-side runtime: mounts global hotkeys and renders the pending-close dialog.
 * Mounted once at the AppShell level so hotkeys work app-wide and the dialog can
 * appear over any route content.
 */
export function TabRuntime() {
  useTabHotkeys();
  return <PendingCloseDialog />;
}
