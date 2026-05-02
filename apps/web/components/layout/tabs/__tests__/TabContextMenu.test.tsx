// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { TabBar } from "../TabBar";
import { TabProvider, useTabContext } from "../TabContext";
import type { ReactNode } from "react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
}));

function Wrapper({ children }: { children: ReactNode }) {
  return <TabProvider workspaceId="ws-cm">{children}</TabProvider>;
}

function Seed() {
  const ctx = useTabContext();
  return (
    <button
      type="button"
      data-testid="seed"
      onClick={() => {
        for (const u of ["/a", "/b", "/c"]) void ctx.openTab(u, u.slice(1));
      }}
    >
      seed
    </button>
  );
}

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

describe("TabContextMenu", () => {
  it("opens on right-click and shows 7 actions", async () => {
    const { getByTestId, getAllByTestId, queryByTestId } = render(
      <Wrapper>
        <Seed />
        <TabBar />
      </Wrapper>,
    );
    await act(async () => fireEvent.click(getByTestId("seed")));
    expect(queryByTestId("tab-context-menu")).toBeNull();

    const tabB = getAllByTestId(/^tab-\//)[1];
    await act(async () => {
      if (tabB) fireEvent.contextMenu(tabB);
    });
    const menu = getByTestId("tab-context-menu");
    expect(menu).toBeTruthy();
    expect(menu.querySelectorAll("[role='menuitem']")).toHaveLength(7);
  });

  it("clicking 'close left' closes tabs to the left of the right-clicked tab", async () => {
    const { getByTestId, getAllByTestId } = render(
      <Wrapper>
        <Seed />
        <TabBar />
      </Wrapper>,
    );
    await act(async () => fireEvent.click(getByTestId("seed")));
    const tabB = getAllByTestId(/^tab-\//)[1];
    await act(async () => {
      if (tabB) fireEvent.contextMenu(tabB);
    });
    const item = getByTestId("ctx-closeLeft");
    await act(async () => fireEvent.click(item));
    const remaining = getAllByTestId(/^tab-\//).map((el) => el.getAttribute("data-testid"));
    expect(remaining).toEqual(["tab-/b", "tab-/c"]);
  });

  it("clicking 'pin' pins the tab", async () => {
    const { getByTestId, getAllByTestId, queryByTestId } = render(
      <Wrapper>
        <Seed />
        <TabBar />
      </Wrapper>,
    );
    await act(async () => fireEvent.click(getByTestId("seed")));
    const tabA = getAllByTestId(/^tab-\//)[0];
    await act(async () => {
      if (tabA) fireEvent.contextMenu(tabA);
    });
    await act(async () => fireEvent.click(getByTestId("ctx-pin")));
    expect(queryByTestId("close-/a")).toBeNull();
  });
});
