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
    <div
      data-testid="ask-workspace"
      className="grid h-full min-h-0 flex-1 overflow-hidden md:grid-cols-[18rem_minmax(0,1fr)]"
    >
      {sidebar}
      <div data-testid="ask-answer-pane" className="flex h-full min-h-0 min-w-0 overflow-hidden">
        <section
          className={panelOpen
            ? "h-full min-h-0 min-w-0 flex-1 overflow-hidden lg:w-1/2"
            : "h-full min-h-0 min-w-0 flex-1 overflow-hidden"}
        >
          {children}
        </section>
        {panel.path ? <AskWikiPanel path={panel.path} onClose={panel.close} /> : null}
      </div>
    </div>
  );
}
