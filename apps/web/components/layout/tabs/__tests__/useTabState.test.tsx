// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { TabProvider, useTabContext } from "../TabContext";
import { useTabState } from "../useTabState";
import type { ReactNode } from "react";

const pathnameRef = { current: "/admin/companies" };
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => pathnameRef.current,
}));

function wrapper({ children }: { children: ReactNode }) {
  return <TabProvider workspaceId="ws-uts">{children}</TabProvider>;
}

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  pathnameRef.current = "/admin/companies";
});

interface GridState {
  dirtyRows: string[];
  newRows: string[];
}
const DEFAULT: GridState = { dirtyRows: [], newRows: [] };

describe("useTabState", () => {
  it("returns the default value when no cache exists", async () => {
    const { result } = renderHook(
      () => {
        const ctx = useTabContext();
        const [state] = useTabState<GridState>("grid", DEFAULT);
        return { ctx, state };
      },
      { wrapper },
    );
    await act(async () => {
      await result.current.ctx.openTab("/admin/companies", "회사관리");
    });
    expect(result.current.state).toEqual(DEFAULT);
  });

  it("setState updates the value and writes to context", async () => {
    const { result } = renderHook(
      () => {
        const ctx = useTabContext();
        const [state, setState] = useTabState<GridState>("grid", DEFAULT);
        return { ctx, state, setState };
      },
      { wrapper },
    );
    await act(async () => {
      await result.current.ctx.openTab("/admin/companies", "회사관리");
    });
    await act(async () => {
      result.current.setState({ dirtyRows: ["x"], newRows: [] });
    });
    expect(result.current.state).toEqual({ dirtyRows: ["x"], newRows: [] });
    expect(result.current.ctx.getTabState("/admin/companies", "grid")).toEqual({
      dirtyRows: ["x"],
      newRows: [],
    });
  });

  it("functional setState is applied against previous state", async () => {
    const { result } = renderHook(
      () => useTabState<GridState>("grid", DEFAULT),
      { wrapper },
    );
    await act(async () => {
      result.current[1]({ dirtyRows: ["a"], newRows: [] });
    });
    await act(async () => {
      result.current[1]((prev) => ({ ...prev, dirtyRows: [...prev.dirtyRows, "b"] }));
    });
    expect(result.current[0]).toEqual({ dirtyRows: ["a", "b"], newRows: [] });
  });
});
