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

    // Mark /a dirty before eviction; the eviction should clean it up.
    act(() => result.current.setDirty("/a", true));
    expect(result.current.isDirty("/a")).toBe(true);

    await act(async () => {
      await result.current.openTab("/f", "F");
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
