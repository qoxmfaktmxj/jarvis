import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MenusGridContainer } from "./MenusGridContainer";

const saveMenusAction = vi.fn(async (input: unknown) => {
  void input;
  return { ok: true, created: 0, updated: 1, deleted: 0 };
});

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("../actions", () => ({
  saveMenusAction: (input: unknown) => saveMenusAction(input),
}));

describe("MenusGridContainer", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("React", React);
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    saveMenusAction.mockClear();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("persists menu visibility instead of deleting the menu", async () => {
    await act(async () => root.render(
      <MenusGridContainer
        initialRows={[{
          id: "bcb3fbc7-8a2c-4d8a-84e7-eed31af43f86",
          parentId: null,
          code: "sources",
          label: "공식 자료",
          description: "공식 자료 수집",
          kind: "page",
          icon: "FileText",
          routePath: "/admin/sources",
          sortOrder: 50,
          isVisible: true,
          permissionCodes: ["source:ingest"],
        }]}
        total={1}
        routeOptions={["/admin/sources"]}
        permissionOptions={["source:ingest"]}
      />,
    ));

    const visibility = container.querySelector('input[aria-label="공식 자료 columns.isVisible"]') as HTMLInputElement;
    await act(async () => visibility.click());
    await act(async () => {
      (container.querySelector("button") as HTMLButtonElement).click();
      await Promise.resolve();
    });

    expect(saveMenusAction).toHaveBeenCalledWith(expect.objectContaining({
      deletes: [],
      updates: [expect.objectContaining({
        patch: expect.objectContaining({ isVisible: false }),
      })],
    }));
  });
});
