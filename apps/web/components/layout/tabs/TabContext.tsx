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

  // openTab/closeTab/closeBatch are defined in later tasks;
  // for now provide minimal versions that satisfy basic open/focus/close tests.
  const openTab = useCallback<TabContextValue["openTab"]>(async (url, fallbackTitle) => {
    const key = pathnameToTabKey(url);
    const now = Date.now();
    const tab: Tab = {
      key,
      url,
      title: fallbackTitle,
      pinned: false,
      createdAt: now,
      lastVisitedAt: now,
    };
    // Explicit blocked check (don't rely on reducer reference equality):
    // Refuse only when at MAX_TABS, target doesn't already exist, and every existing tab is pinned.
    const s = stateRef.current;
    const blocked =
      s.tabs.length >= MAX_TABS &&
      !s.tabs.some((t) => t.key === key) &&
      s.tabs.every((t) => t.pinned);
    dispatch({ type: "OPEN_TAB", tab });
    return !blocked;
  }, []);

  const closeTab = useCallback<TabContextValue["closeTab"]>(async (key) => {
    dispatch({ type: "REMOVE_TAB", key });
    return true;
  }, []);

  const closeBatch = useCallback<TabContextValue["closeBatch"]>(
    async (predicate) => {
      const targets = state.tabs.filter(predicate).map((t) => t.key);
      for (const k of targets) dispatch({ type: "REMOVE_TAB", key: k });
    },
    [state.tabs],
  );

  const resolvePendingClose = useCallback(
    (_action: CloseAction) => {
      if (state.pendingClose) state.pendingClose.resolve(_action);
      dispatch({ type: "SET_PENDING", req: null });
    },
    [state.pendingClose],
  );

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
