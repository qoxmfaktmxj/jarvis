"use client";

import { type ReactNode } from "react";
import { AskWikiPanel } from "@/components/ai/AskWikiPanel";
import { AskWikiPanelProvider, useAskWikiPanel } from "@/components/ai/AskWikiPanelContext";

export function AskWorkspace({ sidebar, children }: { sidebar: ReactNode; children: ReactNode }) {
  return (
    <AskWikiPanelProvider>
      <AskWorkspaceInner sidebar={sidebar}>{children}</AskWorkspaceInner>
    </AskWikiPanelProvider>
  );
}

function AskWorkspaceInner({ sidebar, children }: { sidebar: ReactNode; children: ReactNode }) {
  const panel = useAskWikiPanel();
  const panelOpen = panel.path !== null;
  return (
    <div className="grid h-full min-h-0 flex-1 md:grid-cols-[18rem_minmax(0,1fr)]">
      {sidebar}
      <div className="flex min-h-0 min-w-0">
        <main className={panelOpen ? "min-h-0 min-w-0 flex-1 lg:w-1/2" : "min-h-0 min-w-0 flex-1"}>{children}</main>
        {panel.path ? <AskWikiPanel path={panel.path} onClose={panel.close} /> : null}
      </div>
    </div>
  );
}
