"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

type AskWikiPanelContextValue = {
  path: string | null;
  hasProvider: boolean;
  open: (path: string) => void;
  close: () => void;
};

const AskWikiPanelContext = createContext<AskWikiPanelContextValue | null>(null);

export function AskWikiPanelProvider({ children }: { children: ReactNode }) {
  const [path, setPath] = useState<string | null>(null);
  const value = useMemo<AskWikiPanelContextValue>(
    () => ({ path, hasProvider: true, open: setPath, close: () => setPath(null) }),
    [path],
  );
  return <AskWikiPanelContext.Provider value={value}>{children}</AskWikiPanelContext.Provider>;
}

export function useAskWikiPanel(): AskWikiPanelContextValue {
  const value = useContext(AskWikiPanelContext);
  return value ?? { path: null, hasProvider: false, open: () => {}, close: () => {} };
}
