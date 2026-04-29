'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { AskSidebar } from '@/components/ai/AskSidebar';
import { WikiPanel } from '@/components/ai/WikiPanel';
import { WikiPanelProvider, useWikiPanel } from '@/components/ai/WikiPanelContext';
import { useAskSidebarCollapsed } from '@/components/layout/useAskSidebarCollapsed';
import type { AskConversation } from '@jarvis/db/schema/ask-conversation';

type AskShellProps = {
  conversations: AskConversation[];
  conversationCount: number;
  workspaceId: string;
  children: ReactNode;
};

export function AskShell(props: AskShellProps) {
  return (
    <WikiPanelProvider>
      <AskShellInner {...props} />
    </WikiPanelProvider>
  );
}

function AskShellInner({
  conversations,
  conversationCount,
  workspaceId,
  children,
}: AskShellProps) {
  const [collapsed, setCollapsed] = useAskSidebarCollapsed();
  const panel = useWikiPanel();
  const [isLg, setIsLg] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    setIsLg(mq.matches);
    const listener = (e: MediaQueryListEvent) => setIsLg(e.matches);
    mq.addEventListener('change', listener);
    return () => mq.removeEventListener('change', listener);
  }, []);

  // panel.isOpen is defined as `active !== null` in WikiPanelContext, so the
  // active-non-null check below covers both. JSX still re-checks for TS narrowing.
  const showPanel = isLg && panel.active !== null;

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      <AskSidebar
        conversations={conversations}
        conversationCount={conversationCount}
        collapsed={collapsed}
        onToggle={() => setCollapsed(!collapsed)}
      />
      <div className="flex flex-1 min-w-0">
        <div className={showPanel ? 'flex-1 min-w-0 lg:w-1/2' : 'flex-1 min-w-0'}>
          {children}
        </div>
        {showPanel && panel.active && (
          <div className="hidden lg:flex lg:w-1/2 border-l border-(--border-default)">
            <WikiPanel
              workspaceId={workspaceId}
              slug={panel.active.slug}
              onClose={panel.close}
            />
          </div>
        )}
      </div>
    </div>
  );
}
