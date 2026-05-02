// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { TabBar } from "../TabBar";
import { TabProvider, useTabContext } from "../TabContext";
import type { ReactNode } from "react";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
}));

function Wrapper({ children }: { children: ReactNode }) {
  return <TabProvider workspaceId="ws-bar">{children}</TabProvider>;
}

function Seed({ urls }: { urls: string[] }) {
  const ctx = useTabContext();
  return (
    <button
      type="button"
      data-testid="seed"
      onClick={() => {
        for (const u of urls) void ctx.openTab(u, u.slice(1));
      }}
    >
      seed
    </button>
  );
}

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  pushMock.mockReset();
});

describe("TabBar", () => {
  it("renders nothing when no tabs", () => {
    const { container } = render(
      <Wrapper>
        <TabBar />
      </Wrapper>,
    );
    expect(container.querySelector("[data-tab-key]")).toBeNull();
  });

  it("renders one element per tab with title", async () => {
    const { getByTestId, getAllByTestId } = render(
      <Wrapper>
        <Seed urls={["/admin/companies", "/admin/menus"]} />
        <TabBar />
      </Wrapper>,
    );
    await act(async () => {
      fireEvent.click(getByTestId("seed"));
    });
    const tabs = getAllByTestId(/^tab-\//);
    expect(tabs).toHaveLength(2);
    expect(tabs[0]?.textContent).toContain("admin/companies");
  });

  it("clicking a tab focuses it and pushes the URL", async () => {
    const { getByTestId, getAllByTestId } = render(
      <Wrapper>
        <Seed urls={["/a", "/b"]} />
        <TabBar />
      </Wrapper>,
    );
    await act(async () => {
      fireEvent.click(getByTestId("seed"));
    });
    const tabs = getAllByTestId(/^tab-\//);
    await act(async () => {
      if (tabs[0]) fireEvent.click(tabs[0]);
    });
    expect(pushMock).toHaveBeenCalledWith("/a");
  });

  it("clicking the X button closes the tab", async () => {
    const { getByTestId, getAllByTestId } = render(
      <Wrapper>
        <Seed urls={["/a", "/b"]} />
        <TabBar />
      </Wrapper>,
    );
    await act(async () => {
      fireEvent.click(getByTestId("seed"));
    });
    const closeBtns = getAllByTestId(/^close-\//);
    await act(async () => {
      if (closeBtns[0]) fireEvent.click(closeBtns[0]);
    });
    const remaining = getAllByTestId(/^tab-\//);
    expect(remaining).toHaveLength(1);
  });

  it("pinned tab does not render an X button", async () => {
    function PinFirst() {
      const ctx = useTabContext();
      return (
        <button
          type="button"
          data-testid="pin"
          onClick={() => ctx.pinTab("/a")}
        >
          pin
        </button>
      );
    }
    const { getByTestId, queryByTestId } = render(
      <Wrapper>
        <Seed urls={["/a"]} />
        <PinFirst />
        <TabBar />
      </Wrapper>,
    );
    await act(async () => fireEvent.click(getByTestId("seed")));
    await act(async () => fireEvent.click(getByTestId("pin")));
    expect(queryByTestId("close-/a")).toBeNull();
  });

  it("dirty tab shows the dirty marker", async () => {
    function MarkDirty() {
      const ctx = useTabContext();
      return (
        <button
          type="button"
          data-testid="dirty"
          onClick={() => ctx.setDirty("/a", true)}
        >
          d
        </button>
      );
    }
    const { getByTestId } = render(
      <Wrapper>
        <Seed urls={["/a"]} />
        <MarkDirty />
        <TabBar />
      </Wrapper>,
    );
    await act(async () => fireEvent.click(getByTestId("seed")));
    await act(async () => fireEvent.click(getByTestId("dirty")));
    expect(getByTestId("tab-/a").querySelector("[data-dirty]")).not.toBeNull();
  });
});
