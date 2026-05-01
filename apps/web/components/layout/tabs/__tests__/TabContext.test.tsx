// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { TabProvider, useTabContext } from "../TabContext";
import type { ReactNode } from "react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
}));

function wrapper({ children }: { children: ReactNode }) {
  return <TabProvider workspaceId="ws-1">{children}</TabProvider>;
}

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

describe("TabProvider — basic open/focus/close", () => {
  it("starts with no tabs", () => {
    const { result } = renderHook(() => useTabContext(), { wrapper });
    expect(result.current.tabs).toEqual([]);
    expect(result.current.activeKey).toBeNull();
  });

  it("openTab appends a new tab and activates it", async () => {
    const { result } = renderHook(() => useTabContext(), { wrapper });
    let ok: boolean = false;
    await act(async () => {
      ok = await result.current.openTab("/admin/companies", "회사관리");
    });
    expect(ok).toBe(true);
    expect(result.current.tabs).toHaveLength(1);
    expect(result.current.tabs[0]).toMatchObject({
      key: "/admin/companies",
      title: "회사관리",
      pinned: false,
    });
    expect(result.current.activeKey).toBe("/admin/companies");
  });

  it("openTab on existing key focuses without duplicating", async () => {
    const { result } = renderHook(() => useTabContext(), { wrapper });
    await act(async () => {
      await result.current.openTab("/a", "A");
      await result.current.openTab("/b", "B");
      await result.current.openTab("/a", "A again");
    });
    expect(result.current.tabs).toHaveLength(2);
    expect(result.current.activeKey).toBe("/a");
  });

  it("openTab strips search params for key but stores full url", async () => {
    const { result } = renderHook(() => useTabContext(), { wrapper });
    await act(async () => {
      await result.current.openTab("/a?q=foo", "A");
    });
    expect(result.current.tabs[0]?.key).toBe("/a");
    expect(result.current.tabs[0]?.url).toBe("/a?q=foo");
  });

  it("focusTab updates activeKey and lastVisitedAt", async () => {
    const { result } = renderHook(() => useTabContext(), { wrapper });
    await act(async () => {
      await result.current.openTab("/a", "A");
      await result.current.openTab("/b", "B");
    });
    const aBefore = result.current.tabs.find((t) => t.key === "/a")?.lastVisitedAt ?? 0;
    await new Promise((r) => setTimeout(r, 5));
    act(() => result.current.focusTab("/a"));
    const aAfter = result.current.tabs.find((t) => t.key === "/a")?.lastVisitedAt ?? 0;
    expect(result.current.activeKey).toBe("/a");
    expect(aAfter).toBeGreaterThan(aBefore);
  });

  it("closeTab removes a clean tab and activates a neighbor", async () => {
    const { result } = renderHook(() => useTabContext(), { wrapper });
    await act(async () => {
      await result.current.openTab("/a", "A");
      await result.current.openTab("/b", "B");
      await result.current.openTab("/c", "C");
    });
    expect(result.current.activeKey).toBe("/c");
    await act(async () => {
      await result.current.closeTab("/c");
    });
    expect(result.current.tabs.map((t) => t.key)).toEqual(["/a", "/b"]);
    expect(result.current.activeKey).toBe("/b"); // left neighbor since /c was last
  });

  it("closeTab activates right neighbor preferentially when middle tab closed", async () => {
    const { result } = renderHook(() => useTabContext(), { wrapper });
    await act(async () => {
      await result.current.openTab("/a", "A");
      await result.current.openTab("/b", "B");
      await result.current.openTab("/c", "C");
      result.current.focusTab("/b");
    });
    await act(async () => {
      await result.current.closeTab("/b");
    });
    expect(result.current.activeKey).toBe("/c");
  });

  it("setTabTitle updates the display title", async () => {
    const { result } = renderHook(() => useTabContext(), { wrapper });
    await act(async () => {
      await result.current.openTab("/a", "Loading...");
      result.current.setTabTitle("/a", "Real Title");
    });
    expect(result.current.tabs[0]?.title).toBe("Real Title");
  });
});

describe("TabProvider — LRU eviction", () => {
  it("evicts oldest non-pinned tab when 6th opens", async () => {
    const { result } = renderHook(() => useTabContext(), { wrapper });
    await act(async () => {
      await result.current.openTab("/a", "A");
      await new Promise((r) => setTimeout(r, 1));
      await result.current.openTab("/b", "B");
      await new Promise((r) => setTimeout(r, 1));
      await result.current.openTab("/c", "C");
      await new Promise((r) => setTimeout(r, 1));
      await result.current.openTab("/d", "D");
      await new Promise((r) => setTimeout(r, 1));
      await result.current.openTab("/e", "E");
    });
    expect(result.current.tabs).toHaveLength(5);

    // Mark /a dirty before eviction; the eviction should trigger a dialog; discard cleans it up.
    act(() => result.current.setDirty("/a", true));
    expect(result.current.isDirty("/a")).toBe(true);

    let openPromise!: Promise<boolean>;
    act(() => {
      openPromise = result.current.openTab("/f", "F");
    });
    // Dialog should be pending for the dirty victim /a.
    expect(result.current.pendingClose).not.toBeNull();
    await act(async () => {
      result.current.resolvePendingClose("discard");
      await openPromise;
    });
    expect(result.current.tabs.map((t) => t.key)).toEqual(["/b", "/c", "/d", "/e", "/f"]);
    expect(result.current.activeKey).toBe("/f");
    // Cleanup: evicted tab's dirty flag must be cleared (no ghost flags).
    expect(result.current.isDirty("/a")).toBe(false);
  });
});

describe("TabProvider — pin policy", () => {
  it("pinTab marks a tab as pinned, unpinTab clears it", async () => {
    const { result } = renderHook(() => useTabContext(), { wrapper });
    await act(async () => {
      await result.current.openTab("/a", "A");
    });
    expect(result.current.isPinned("/a")).toBe(false);
    act(() => result.current.pinTab("/a"));
    expect(result.current.isPinned("/a")).toBe(true);
    act(() => result.current.unpinTab("/a"));
    expect(result.current.isPinned("/a")).toBe(false);
  });

  it("LRU eviction skips pinned tabs", async () => {
    const { result } = renderHook(() => useTabContext(), { wrapper });
    await act(async () => {
      await result.current.openTab("/a", "A");
      result.current.pinTab("/a");
      await new Promise((r) => setTimeout(r, 1));
      await result.current.openTab("/b", "B");
      await new Promise((r) => setTimeout(r, 1));
      await result.current.openTab("/c", "C");
      await new Promise((r) => setTimeout(r, 1));
      await result.current.openTab("/d", "D");
      await new Promise((r) => setTimeout(r, 1));
      await result.current.openTab("/e", "E");
    });
    await act(async () => {
      await result.current.openTab("/f", "F");
    });
    expect(result.current.tabs.map((t) => t.key)).toContain("/a"); // /a survived even though oldest
    expect(result.current.tabs.map((t) => t.key)).not.toContain("/b"); // oldest non-pinned evicted
  });

  it("openTab returns false when all 5 tabs are pinned", async () => {
    const { result } = renderHook(() => useTabContext(), { wrapper });
    await act(async () => {
      for (const k of ["/a", "/b", "/c", "/d", "/e"]) {
        await result.current.openTab(k, k);
        result.current.pinTab(k);
      }
    });
    let ok = true;
    await act(async () => {
      ok = await result.current.openTab("/f", "F");
    });
    expect(ok).toBe(false);
    expect(result.current.tabs).toHaveLength(5);
    expect(result.current.tabs.map((t) => t.key)).not.toContain("/f");
  });
});

describe("TabProvider — dirty + save handler + pending close", () => {
  it("setDirty toggles isDirty(key)", async () => {
    const { result } = renderHook(() => useTabContext(), { wrapper });
    await act(async () => {
      await result.current.openTab("/a", "A");
    });
    expect(result.current.isDirty("/a")).toBe(false);
    act(() => result.current.setDirty("/a", true));
    expect(result.current.isDirty("/a")).toBe(true);
    act(() => result.current.setDirty("/a", false));
    expect(result.current.isDirty("/a")).toBe(false);
  });

  it("closeTab on dirty tab requests pending close (single)", async () => {
    const { result } = renderHook(() => useTabContext(), { wrapper });
    await act(async () => {
      await result.current.openTab("/a", "A");
      result.current.setDirty("/a", true);
    });
    let closePromise!: Promise<boolean>;
    act(() => {
      closePromise = result.current.closeTab("/a");
    });
    expect(result.current.pendingClose).not.toBeNull();
    expect(result.current.pendingClose!.tabs).toHaveLength(1);
    expect(result.current.pendingClose!.tabs[0]?.key).toBe("/a");
    expect(result.current.pendingClose!.reason).toBe("single");

    let ok = true;
    await act(async () => {
      result.current.resolvePendingClose("discard");
      ok = await closePromise;
    });
    expect(ok).toBe(true);
    expect(result.current.tabs).toHaveLength(0);
    expect(result.current.pendingClose).toBeNull();
  });

  it("resolvePendingClose('cancel') aborts close, tab remains", async () => {
    const { result } = renderHook(() => useTabContext(), { wrapper });
    await act(async () => {
      await result.current.openTab("/a", "A");
      result.current.setDirty("/a", true);
    });
    let closePromise!: Promise<boolean>;
    act(() => {
      closePromise = result.current.closeTab("/a");
    });
    let ok = true;
    await act(async () => {
      result.current.resolvePendingClose("cancel");
      ok = await closePromise;
    });
    expect(ok).toBe(false);
    expect(result.current.tabs).toHaveLength(1);
    expect(result.current.isDirty("/a")).toBe(true);
  });

  it("resolvePendingClose('save') invokes the registered save handler", async () => {
    const { result } = renderHook(() => useTabContext(), { wrapper });
    const handler = vi.fn().mockResolvedValue({ ok: true });
    await act(async () => {
      await result.current.openTab("/a", "A");
      result.current.setDirty("/a", true);
      result.current.registerSaveHandler("/a", handler);
    });
    let closePromise!: Promise<boolean>;
    act(() => {
      closePromise = result.current.closeTab("/a");
    });
    await act(async () => {
      result.current.resolvePendingClose("save");
      await closePromise;
    });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(result.current.tabs).toHaveLength(0);
  });

  it("save handler returning ok:false aborts close", async () => {
    const { result } = renderHook(() => useTabContext(), { wrapper });
    const handler = vi.fn().mockResolvedValue({ ok: false });
    await act(async () => {
      await result.current.openTab("/a", "A");
      result.current.setDirty("/a", true);
      result.current.registerSaveHandler("/a", handler);
    });
    let closePromise!: Promise<boolean>;
    act(() => {
      closePromise = result.current.closeTab("/a");
    });
    let ok = true;
    await act(async () => {
      result.current.resolvePendingClose("save");
      ok = await closePromise;
    });
    expect(ok).toBe(false);
    expect(result.current.tabs).toHaveLength(1);
  });

  it("LRU eviction on dirty tab requests pending close, discard proceeds", async () => {
    const { result } = renderHook(() => useTabContext(), { wrapper });
    await act(async () => {
      await result.current.openTab("/a", "A");
      result.current.setDirty("/a", true);
      await new Promise((r) => setTimeout(r, 1));
      for (const k of ["/b", "/c", "/d", "/e"]) {
        await result.current.openTab(k, k);
        await new Promise((r) => setTimeout(r, 1));
      }
    });
    let openPromise!: Promise<boolean>;
    act(() => {
      openPromise = result.current.openTab("/f", "F");
    });
    expect(result.current.pendingClose).not.toBeNull();
    expect(result.current.pendingClose!.tabs[0]?.key).toBe("/a");

    let ok = false;
    await act(async () => {
      result.current.resolvePendingClose("discard");
      ok = await openPromise;
    });
    expect(ok).toBe(true);
    expect(result.current.tabs.map((t) => t.key)).not.toContain("/a");
    expect(result.current.tabs.map((t) => t.key)).toContain("/f");
  });

  it("LRU dirty + cancel aborts new tab open", async () => {
    const { result } = renderHook(() => useTabContext(), { wrapper });
    await act(async () => {
      await result.current.openTab("/a", "A");
      result.current.setDirty("/a", true);
      await new Promise((r) => setTimeout(r, 1));
      for (const k of ["/b", "/c", "/d", "/e"]) {
        await result.current.openTab(k, k);
        await new Promise((r) => setTimeout(r, 1));
      }
    });
    let openPromise!: Promise<boolean>;
    act(() => {
      openPromise = result.current.openTab("/f", "F");
    });
    let ok = true;
    await act(async () => {
      result.current.resolvePendingClose("cancel");
      ok = await openPromise;
    });
    expect(ok).toBe(false);
    expect(result.current.tabs.map((t) => t.key)).toContain("/a");
    expect(result.current.tabs.map((t) => t.key)).not.toContain("/f");
  });
});
