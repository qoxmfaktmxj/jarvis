import { PERSISTENCE_VERSION } from "./tab-types";
import { isSafeInternalPath } from "@/lib/url";
import type { StateKey, Tab, TabKey } from "./tab-types";

interface PersistedShape {
  version: number;
  tabs: Tab[];
  activeKey: TabKey | null;
  tabStates: Record<TabKey, Record<StateKey, unknown>>;
}

export interface PersistableState {
  tabs: Tab[];
  activeKey: TabKey | null;
  tabStates: Map<TabKey, Map<StateKey, unknown>>;
}

export function storageKeyFor(workspaceId: string): string {
  return `jarvis:tabs:v${PERSISTENCE_VERSION}:${workspaceId}`;
}

export function loadFromSession(workspaceId: string): PersistableState | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(storageKeyFor(workspaceId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedShape;
    if (parsed.version !== PERSISTENCE_VERSION) return null;
    const tabStates = new Map<TabKey, Map<StateKey, unknown>>();
    for (const [key, sub] of Object.entries(parsed.tabStates ?? {})) {
      tabStates.set(key, new Map(Object.entries(sub)));
    }
    // I2: filter out tabs whose persisted URL or key is unsafe (defense-in-depth
    // against same-origin XSS poisoning the cache). activeKey is also validated
    // as a safe path independently — tab presence isn't required (the consumer
    // re-derives active state on render).
    const safeTabs = (parsed.tabs ?? []).filter(
      (t) => isSafeInternalPath(t.key) && isSafeInternalPath(t.url),
    );
    const safeActiveKey =
      parsed.activeKey && isSafeInternalPath(parsed.activeKey) ? parsed.activeKey : null;
    return {
      tabs: safeTabs,
      activeKey: safeActiveKey,
      tabStates,
    };
  } catch {
    return null;
  }
}

export function saveToSession(workspaceId: string, state: PersistableState): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    const tabStates: Record<TabKey, Record<StateKey, unknown>> = {};
    for (const [key, sub] of state.tabStates) {
      tabStates[key] = Object.fromEntries(sub);
    }
    const payload: PersistedShape = {
      version: PERSISTENCE_VERSION,
      tabs: state.tabs,
      activeKey: state.activeKey,
      tabStates,
    };
    sessionStorage.setItem(storageKeyFor(workspaceId), JSON.stringify(payload));
  } catch {
    // quota exceeded or other — silently ignored
  }
}

export function makeDebouncedSaver(
  workspaceId: string,
  delay: number,
): (state: PersistableState) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: PersistableState | null = null;
  return (state) => {
    pending = state;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      if (pending) saveToSession(workspaceId, pending);
      pending = null;
      timer = null;
    }, delay);
  };
}
