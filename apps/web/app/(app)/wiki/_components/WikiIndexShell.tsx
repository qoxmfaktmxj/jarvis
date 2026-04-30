'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { WikiPanel } from '@/components/ai/WikiPanel';
import { WikiPanelProvider, useWikiPanel } from '@/components/ai/WikiPanelContext';

type WikiIndexShellProps = {
  workspaceId: string;
  children: ReactNode;
};

export function WikiIndexShell({ workspaceId, children }: WikiIndexShellProps) {
  return (
    <WikiPanelProvider>
      <WikiIndexShellInner workspaceId={workspaceId}>{children}</WikiIndexShellInner>
    </WikiPanelProvider>
  );
}

function WikiIndexShellInner({ workspaceId, children }: WikiIndexShellProps) {
  const panel = useWikiPanel();
  const [isLg, setIsLg] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    setIsLg(mq.matches);
    const listener = (e: MediaQueryListEvent) => setIsLg(e.matches);
    mq.addEventListener('change', listener);
    return () => mq.removeEventListener('change', listener);
  }, []);

  const showPanel = isLg && panel.active !== null;

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      <div
        className={
          showPanel
            ? 'flex-1 min-w-0 overflow-y-auto lg:w-1/2'
            : 'flex-1 min-w-0 overflow-y-auto'
        }
      >
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
  );
}
