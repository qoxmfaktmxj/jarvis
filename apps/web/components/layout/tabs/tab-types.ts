export type TabKey = string;
export type StateKey = string;

export interface Tab {
  key: TabKey;
  url: string;
  title: string;
  pinned: boolean;
  createdAt: number;
  lastVisitedAt: number;
}

export type SaveResult = { ok: boolean };
export type SaveHandler = () => Promise<SaveResult>;
export type CloseAction = "discard" | "save" | "cancel";

export interface PendingCloseRequest {
  tabs: Tab[];
  reason: "single" | "batch";
  resolve: (action: CloseAction) => void;
}

export interface TabContextValue {
  tabs: readonly Tab[];
  activeKey: TabKey | null;
  isDirty: (key: TabKey) => boolean;
  isPinned: (key: TabKey) => boolean;
  getTabState: <T>(key: TabKey, stateKey: StateKey) => T | undefined;
  pendingClose: PendingCloseRequest | null;

  openTab: (url: string, fallbackTitle: string) => Promise<boolean>;
  closeTab: (key: TabKey, opts?: { skipDirtyCheck?: boolean }) => Promise<boolean>;
  closeBatch: (predicate: (t: Tab) => boolean) => Promise<void>;
  focusTab: (key: TabKey) => void;
  pinTab: (key: TabKey) => void;
  unpinTab: (key: TabKey) => void;
  setDirty: (key: TabKey, dirty: boolean) => void;
  setTabState: (key: TabKey, stateKey: StateKey, value: unknown) => void;
  setTabTitle: (key: TabKey, title: string) => void;
  reload: () => void;
  registerSaveHandler: (key: TabKey, handler: SaveHandler) => () => void;
  resolvePendingClose: (action: CloseAction) => void;
}

export const MAX_TABS = 5;
export const PERSISTENCE_VERSION = 1;
export const PERSISTENCE_DEBOUNCE_MS = 500;
