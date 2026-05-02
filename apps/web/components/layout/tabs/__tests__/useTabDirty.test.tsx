// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { TabProvider, useTabContext } from "../TabContext";
import { useTabDirty } from "../useTabDirty";
import type { ReactNode } from "react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/admin/companies",
}));

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

describe("useTabDirty", () => {
  it("toggles dirty when prop changes", async () => {
    const { result, rerender } = renderHook(
      ({ dirty }: { dirty: boolean }) => {
        const ctx = useTabContext();
        useTabDirty(dirty);
        return ctx;
      },
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <TabProvider workspaceId="ws-utd">{children}</TabProvider>
        ),
        initialProps: { dirty: false },
      },
    );
    await act(async () => {
      await result.current.openTab("/admin/companies", "회사관리");
    });
    expect(result.current.isDirty("/admin/companies")).toBe(false);
    rerender({ dirty: true });
    expect(result.current.isDirty("/admin/companies")).toBe(true);
    rerender({ dirty: false });
    expect(result.current.isDirty("/admin/companies")).toBe(false);
  });

});
