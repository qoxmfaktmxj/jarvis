"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { pathnameToTabKey } from "./tab-key";
import type {
  CloseAction,
  PendingCloseRequest,
  SaveHandler,
  StateKey,
  Tab,
  TabContextValue,
  TabKey,
} from "./tab-types";
import { MAX_TABS } from "./tab-types";

interface InternalState {
  tabs: Tab[];
  activeKey: TabKey | null;
  tabStates: Map<TabKey, Map<StateKey, unknown>>;
  dirtyKeys: Set<TabKey>;
  pendingClose: PendingCloseRequest | null;
}

type Action =
  | { type: "OPEN_TAB"; tab: Tab }
  | { type: "ADD_TAB"; tab: Tab }
  | { type: "REMOVE_TAB"; key: TabKey }
  | { type: "FOCUS_TAB"; key: TabKey; ts: number }
  | { type: "SET_TITLE"; key: TabKey; title: string }
  | { type: "SET_DIRTY"; key: TabKey; dirty: boolean }
  | { type: "SET_TAB_STATE"; key: TabKey; stateKey: StateKey; value: unknown }
  | { type: "SET_PENDING"; req: PendingCloseRequest | null }
  | { type: "PIN"; key: TabKey; pinned: boolean };

const initialState: InternalState = {
  tabs: [],
  activeKey: null,
  tabStates: new Map(),
  dirtyKeys: new Set(),
  pendingClose: null,
};

function reducer(state: InternalState, action: Action): InternalState {
  switch (action.type) {
    case "OPEN_TAB": {
      // 1. If tab already exists, focus it (atomic).
      if (state.tabs.some((t) => t.key === action.tab.key)) {
        const tabs = state.tabs.map((t) =>
          t.key === action.tab.key ? { ...t, lastVisitedAt: action.tab.lastVisitedAt } : t,
        );
        return { ...state, tabs, activeKey: action.tab.key };
      }

      // 2. If at MAX_TABS, evict oldest non-pinned (LRU). If all pinned, no-op.
      if (state.tabs.length >= MAX_TABS) {
        const candidates = state.tabs.filter((t) => !t.pinned);
        if (candidates.length === 0) {
          // All pinned — refuse to open. Caller detects via stateRef post-dispatch.
          return state;
        }
        const victim = [...candidates].sort(
          (a, b) => a.lastVisitedAt - b.lastVisitedAt,
        )[0];
        if (!victim) return state;
        const tabsAfterEvict = state.tabs.filter((t) => t.key !== victim.key);
        const tabStates = new Map(state.tabStates);
        tabStates.delete(victim.key);
        const dirtyKeys = new Set(state.dirtyKeys);
        dirtyKeys.delete(victim.key);
        return {
          ...state,
          tabs: [...tabsAfterEvict, action.tab],
          activeKey: action.tab.key,
          tabStates,
          dirtyKeys,
        };
      }

      // 3. Normal append.
      return {
        ...state,
        tabs: [...state.tabs, action.tab],
        activeKey: action.tab.key,
      };
    }
    case "ADD_TAB": {
      if (state.tabs.some((t) => t.key === action.tab.key)) return state;
      return { ...state, tabs: [...state.tabs, action.tab], activeKey: action.tab.key };
    }
    case "REMOVE_TAB": {
      const idx = state.tabs.findIndex((t) => t.key === action.key);
      if (idx === -1) return state;
      const tabs = [...state.tabs.slice(0, idx), ...state.tabs.slice(idx + 1)];
      const tabStates = new Map(state.tabStates);
      tabStates.delete(action.key);
      const dirtyKeys = new Set(state.dirtyKeys);
      dirtyKeys.delete(action.key);
      let activeKey = state.activeKey;
      if (state.activeKey === action.key) {
        // Prefer right neighbor (tabs[idx] after splice), then left, else null.
        activeKey = tabs[idx]?.key ?? tabs[idx - 1]?.key ?? null;
      }
      return { ...state, tabs, tabStates, dirtyKeys, activeKey };
    }
    case "FOCUS_TAB": {
      if (!state.tabs.some((t) => t.key === action.key)) return state;
      const tabs = state.tabs.map((t) =>
        t.key === action.key ? { ...t, lastVisitedAt: action.ts } : t,
      );
      return { ...state, tabs, activeKey: action.key };
    }
    case "SET_TITLE": {
      return {
        ...state,
        tabs: state.tabs.map((t) => (t.key === action.key ? { ...t, title: action.title } : t)),
      };
    }
    case "SET_DIRTY": {
      const dirtyKeys = new Set(state.dirtyKeys);
      if (action.dirty) dirtyKeys.add(action.key);
      else dirtyKeys.delete(action.key);
      return { ...state, dirtyKeys };
    }
    case "SET_TAB_STATE": {
      const tabStates = new Map(state.tabStates);
      const sub = new Map(tabStates.get(action.key) ?? new Map());
      sub.set(action.stateKey, action.value);
      tabStates.set(action.key, sub);
      return { ...state, tabStates };
    }
    case "SET_PENDING": {
      return { ...state, pendingClose: action.req };
    }
    case "PIN": {
      return {
        ...state,
        tabs: state.tabs.map((t) =>
          t.key === action.key ? { ...t, pinned: action.pinned } : t,
        ),
      };
    }
    default:
      return state;
  }
}

const TabContext = createContext<TabContextValue | null>(null);

export function useTabContext(): TabContextValue {
  const ctx = useContext(TabContext);
  if (!ctx) throw new Error("useTabContext must be used inside <TabProvider>");
  return ctx;
}

export function TabProvider({
  workspaceId: _workspaceId,
  children,
}: {
  workspaceId: string;
  children: ReactNode;
}) {
  const stateRef = useRef<InternalState>(initialState);
  const [state, dispatch] = useReducer(
    (s: InternalState, a: Action): InternalState => {
      const next = reducer(s, a);
      stateRef.current = next;
      return next;
    },
    initialState,
  );
  const router = useRouter();
  const saveHandlersRef = useRef(new Map<TabKey, SaveHandler>());

  const isDirty = useCallback((key: TabKey) => state.dirtyKeys.has(key), [state.dirtyKeys]);
  const isPinned = useCallback(
    (key: TabKey) => state.tabs.find((t) => t.key === key)?.pinned ?? false,
    [state.tabs],
  );
  const getTabState = useCallback(
    <T,>(key: TabKey, stateKey: StateKey): T | undefined => {
      return state.tabStates.get(key)?.get(stateKey) as T | undefined;
    },
    [state.tabStates],
  );

  const focusTab = useCallback((key: TabKey) => {
    dispatch({ type: "FOCUS_TAB", key, ts: Date.now() });
  }, []);

  const setTabTitle = useCallback((key: TabKey, title: string) => {
    dispatch({ type: "SET_TITLE", key, title });
  }, []);

  const setDirty = useCallback((key: TabKey, dirty: boolean) => {
    dispatch({ type: "SET_DIRTY", key, dirty });
  }, []);

  const setTabState = useCallback((key: TabKey, stateKey: StateKey, value: unknown) => {
    dispatch({ type: "SET_TAB_STATE", key, stateKey, value });
  }, []);

  const pinTab = useCallback((key: TabKey) => dispatch({ type: "PIN", key, pinned: true }), []);
  const unpinTab = useCallback((key: TabKey) => dispatch({ type: "PIN", key, pinned: false }), []);

  const reload = useCallback(() => {
    router.refresh();
  }, [router]);

  const registerSaveHandler = useCallback((key: TabKey, handler: SaveHandler) => {
    saveHandlersRef.current.set(key, handler);
    return () => {
      saveHandlersRef.current.delete(key);
    };
  }, []);

  const performCloseTab = useCallback((key: TabKey) => {
    dispatch({ type: "REMOVE_TAB", key });
    saveHandlersRef.current.delete(key);
  }, []);

  const requestUnsavedDialog = useCallback(
    (tabs: Tab[], reason: "single" | "batch"): Promise<CloseAction> =>
      new Promise<CloseAction>((resolve) => {
        dispatch({
          type: "SET_PENDING",
          req: { tabs, reason, resolve },
        });
      }),
    [],
  );

  const handleDirtyClose = useCallback(
    async (tab: Tab, reason: "single" | "batch"): Promise<boolean> => {
      const action = await requestUnsavedDialog([tab], reason);
      if (action === "cancel") return false;
      if (action === "save") {
        const handler = saveHandlersRef.current.get(tab.key);
        if (!handler) {
          if (process.env.NODE_ENV !== "production") {
            // eslint-disable-next-line no-console
            console.warn(
              `[tabs] No save handler registered for ${tab.key}; falling back to discard.`,
            );
          }
          performCloseTab(tab.key);
          return true;
        }
        const result = await handler();
        if (!result.ok) return false;
        performCloseTab(tab.key);
        return true;
      }
      // discard
      performCloseTab(tab.key);
      return true;
    },
    [performCloseTab, requestUnsavedDialog],
  );

  const openTab = useCallback<TabContextValue["openTab"]>(
    async (url, fallbackTitle) => {
      const key = pathnameToTabKey(url);
      const s = stateRef.current;

      // Check if dirty-eviction dialog is needed BEFORE dispatching.
      // This is the only case we must handle asynchronously (dialog requires await).
      if (
        s.tabs.length >= MAX_TABS &&
        !s.tabs.some((t) => t.key === key)
      ) {
        const candidates = s.tabs.filter((t) => !t.pinned);
        if (candidates.length === 0) {
          // All pinned — dispatch OPEN_TAB so reducer can signal no-op, return false.
          dispatch({
            type: "OPEN_TAB",
            tab: {
              key,
              url,
              title: fallbackTitle,
              pinned: false,
              createdAt: Date.now(),
              lastVisitedAt: Date.now(),
            },
          });
          return false;
        }
        const victim = [...candidates].sort(
          (a, b) => a.lastVisitedAt - b.lastVisitedAt,
        )[0];
        if (!victim) return false;

        if (s.dirtyKeys.has(victim.key)) {
          // Async dialog path: must handle eviction manually.
          const proceeded = await handleDirtyClose(victim, "single");
          if (!proceeded) return false;
          // Now append the new tab.
          const now = Date.now();
          dispatch({
            type: "ADD_TAB",
            tab: {
              key,
              url,
              title: fallbackTitle,
              pinned: false,
              createdAt: now,
              lastVisitedAt: now,
            },
          });
          return true;
        }
        // Clean victim — fall through to OPEN_TAB which evicts atomically.
      }

      // Atomic path: let the reducer handle focus/append/clean-eviction.
      const now = Date.now();
      dispatch({
        type: "OPEN_TAB",
        tab: { key, url, title: fallbackTitle, pinned: false, createdAt: now, lastVisitedAt: now },
      });

      // Compute blocked result from the pre-read state (same logic as reducer for all-pinned).
      const blocked =
        s.tabs.length >= MAX_TABS &&
        !s.tabs.some((t) => t.key === key) &&
        s.tabs.every((t) => t.pinned);
      return !blocked;
    },
    [handleDirtyClose, performCloseTab],
  );

  const closeTab = useCallback<TabContextValue["closeTab"]>(
    async (key, opts) => {
      const tab = stateRef.current.tabs.find((t) => t.key === key);
      if (!tab) return true;
      if (!opts?.skipDirtyCheck && stateRef.current.dirtyKeys.has(key)) {
        return handleDirtyClose(tab, "single");
      }
      performCloseTab(key);
      return true;
    },
    [handleDirtyClose, performCloseTab],
  );

  const closeBatch = useCallback<TabContextValue["closeBatch"]>(
    async (predicate) => {
      const targets = stateRef.current.tabs.filter(predicate);
      const dirtyTargets = targets.filter((t) =>
        stateRef.current.dirtyKeys.has(t.key),
      );
      if (dirtyTargets.length > 0) {
        const action = await requestUnsavedDialog(dirtyTargets, "batch");
        if (action === "cancel") return;
        // batch dialog only supports discard / cancel; ignore save (different flow per tab).
      }
      for (const t of targets) performCloseTab(t.key);
    },
    [performCloseTab, requestUnsavedDialog],
  );

  const resolvePendingClose = useCallback((action: CloseAction) => {
    const req = stateRef.current.pendingClose;
    dispatch({ type: "SET_PENDING", req: null });
    if (req) req.resolve(action);
  }, []);

  const value = useMemo<TabContextValue>(
    () => ({
      tabs: state.tabs,
      activeKey: state.activeKey,
      isDirty,
      isPinned,
      getTabState,
      pendingClose: state.pendingClose,
      openTab,
      closeTab,
      closeBatch,
      focusTab,
      pinTab,
      unpinTab,
      setDirty,
      setTabState,
      setTabTitle,
      reload,
      registerSaveHandler,
      resolvePendingClose,
    }),
    [
      state.tabs,
      state.activeKey,
      state.pendingClose,
      isDirty,
      isPinned,
      getTabState,
      openTab,
      closeTab,
      closeBatch,
      focusTab,
      pinTab,
      unpinTab,
      setDirty,
      setTabState,
      setTabTitle,
      reload,
      registerSaveHandler,
      resolvePendingClose,
    ],
  );


  return <TabContext.Provider value={value}>{children}</TabContext.Provider>;
}
