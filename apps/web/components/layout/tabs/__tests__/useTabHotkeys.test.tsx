// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { TabProvider, useTabContext } from "../TabContext";
import { useTabHotkeys } from "../useTabHotkeys";
import type { ReactNode } from "react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
}));

function wrapper({ children }: { children: ReactNode }) {
  return <TabProvider workspaceId="ws-hk">{children}</TabProvider>;
}

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

function fire(key: string, mods: { ctrl?: boolean; shift?: boolean } = {}) {
  const evt = new KeyboardEvent("keydown", {
    key,
    ctrlKey: mods.ctrl ?? false,
    shiftKey: mods.shift ?? false,
    bubbles: true,
  });
  window.dispatchEvent(evt);
}

describe("useTabHotkeys", () => {
  it("Ctrl+W closes the active tab", async () => {
    const { result } = renderHook(
      () => {
        useTabHotkeys();
        return useTabContext();
      },
      { wrapper },
    );
    await act(async () => {
      await result.current.openTab("/a", "A");
      await result.current.openTab("/b", "B");
    });
    await act(async () => {
      fire("w", { ctrl: true });
      // closeTab returns a promise; let it resolve.
      await Promise.resolve();
    });
    expect(result.current.tabs.map((t) => t.key)).toEqual(["/a"]);
  });

  it("Ctrl+Tab moves to next tab (wraps)", async () => {
    const { result } = renderHook(
      () => {
        useTabHotkeys();
        return useTabContext();
      },
      { wrapper },
    );
    await act(async () => {
      await result.current.openTab("/a", "A");
      await result.current.openTab("/b", "B");
      await result.current.openTab("/c", "C");
      result.current.focusTab("/a");
    });
    act(() => fire("Tab", { ctrl: true }));
    expect(result.current.activeKey).toBe("/b");
    act(() => fire("Tab", { ctrl: true }));
    expect(result.current.activeKey).toBe("/c");
    act(() => fire("Tab", { ctrl: true }));
    expect(result.current.activeKey).toBe("/a"); // wrapped
  });

  it("Ctrl+Shift+Tab moves to previous tab (wraps)", async () => {
    const { result } = renderHook(
      () => {
        useTabHotkeys();
        return useTabContext();
      },
      { wrapper },
    );
    await act(async () => {
      await result.current.openTab("/a", "A");
      await result.current.openTab("/b", "B");
      result.current.focusTab("/a");
    });
    act(() => fire("Tab", { ctrl: true, shift: true }));
    expect(result.current.activeKey).toBe("/b"); // wrapped backwards
  });

  it("Ctrl+3 jumps to 3rd tab", async () => {
    const { result } = renderHook(
      () => {
        useTabHotkeys();
        return useTabContext();
      },
      { wrapper },
    );
    await act(async () => {
      for (const k of ["/a", "/b", "/c", "/d"]) {
        await result.current.openTab(k, k);
      }
    });
    act(() => fire("3", { ctrl: true }));
    expect(result.current.activeKey).toBe("/c");
  });

  it("Ctrl+9 with only 4 tabs is a no-op", async () => {
    const { result } = renderHook(
      () => {
        useTabHotkeys();
        return useTabContext();
      },
      { wrapper },
    );
    await act(async () => {
      for (const k of ["/a", "/b", "/c", "/d"]) {
        await result.current.openTab(k, k);
      }
      result.current.focusTab("/d");
    });
    act(() => fire("9", { ctrl: true }));
    expect(result.current.activeKey).toBe("/d");
  });
});
