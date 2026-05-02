"use client";

import { useEffect, useState } from "react";
import { useTabHotkeys } from "./useTabHotkeys";
import { PendingCloseDialog } from "./PendingCloseDialog";

/**
 * Client-side runtime: mounts global hotkeys and renders the pending-close dialog.
 * Mounted once at the AppShell level so hotkeys work app-wide and the dialog can
 * appear over any route content.
 */
export function TabRuntime() {
  const [ready, setReady] = useState(false);

  useTabHotkeys();

  useEffect(() => {
    setReady(true);
  }, []);

  return (
    <>
      {ready ? <span data-testid="tab-runtime-ready" hidden /> : null}
      <PendingCloseDialog />
    </>
  );
}
