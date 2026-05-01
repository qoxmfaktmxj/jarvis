// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadFromSession,
  saveToSession,
  storageKeyFor,
  makeDebouncedSaver,
  type PersistableState,
} from "../tab-persistence";
import type { Tab } from "../tab-types";

const ws = "ws-1";

function tab(key: string, overrides: Partial<Tab> = {}): Tab {
  return {
    key,
    url: key,
    title: key,
    pinned: false,
    createdAt: 0,
    lastVisitedAt: 0,
    ...overrides,
  };
}

beforeEach(() => sessionStorage.clear());
afterEach(() => sessionStorage.clear());

describe("storageKeyFor", () => {
  it("includes workspaceId and version", () => {
    expect(storageKeyFor("ws-42")).toBe("jarvis:tabs:v1:ws-42");
  });
});

describe("saveToSession + loadFromSession", () => {
  it("returns null when no entry exists", () => {
    expect(loadFromSession(ws)).toBeNull();
  });

  it("round-trips a state", () => {
    const tabStates = new Map<string, Map<string, unknown>>();
    tabStates.set("/a", new Map([["grid", { dirtyRows: { x: 1 } }]]));
    const state: PersistableState = {
      tabs: [tab("/a"), tab("/b", { pinned: true })],
      activeKey: "/a",
      tabStates,
    };

    saveToSession(ws, state);
    const loaded = loadFromSession(ws);

    expect(loaded).not.toBeNull();
    expect(loaded!.tabs).toHaveLength(2);
    expect(loaded!.tabs[1].pinned).toBe(true);
    expect(loaded!.activeKey).toBe("/a");
    expect(loaded!.tabStates.get("/a")?.get("grid")).toEqual({ dirtyRows: { x: 1 } });
  });

  it("returns null on corrupt JSON", () => {
    sessionStorage.setItem(storageKeyFor(ws), "{not json");
    expect(loadFromSession(ws)).toBeNull();
  });

  it("returns null when version mismatches", () => {
    sessionStorage.setItem(
      storageKeyFor(ws),
      JSON.stringify({ version: 999, tabs: [], activeKey: null, tabStates: {} }),
    );
    expect(loadFromSession(ws)).toBeNull();
  });

  it("scopes per workspace", () => {
    saveToSession("ws-a", {
      tabs: [tab("/a")],
      activeKey: "/a",
      tabStates: new Map(),
    });
    expect(loadFromSession("ws-b")).toBeNull();
    expect(loadFromSession("ws-a")?.tabs).toHaveLength(1);
  });
});

describe("makeDebouncedSaver", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("coalesces multiple writes within delay into one save", () => {
    const save = makeDebouncedSaver(ws, 500);
    const baseState = {
      tabs: [tab("/a")],
      activeKey: "/a",
      tabStates: new Map(),
    };
    save(baseState);
    save({ ...baseState, activeKey: "/b" });
    save({ ...baseState, activeKey: "/c" });
    expect(loadFromSession(ws)).toBeNull();
    vi.advanceTimersByTime(500);
    expect(loadFromSession(ws)?.activeKey).toBe("/c");
  });
});
