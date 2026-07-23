import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UsersGridContainer } from "./UsersGridContainer";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  saveUsersAction: vi.fn(async () => ({ ok: true, created: 1, updated: 0, deleted: 0 })),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) => key === "deleteUser" ? `${values?.email} 삭제` : key,
}));
vi.mock("../actions", () => ({ saveUsersAction: mocks.saveUsersAction }));

function setValue(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("UsersGridContainer", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("React", React);
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mocks.refresh.mockReset();
    mocks.saveUsersAction.mockClear();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("adds the new user to the visible list and refreshes server data", async () => {
    await act(async () => root.render(<UsersGridContainer initialRows={[]} total={0} currentUserId="admin-1" />));
    const inputs = container.querySelectorAll("input");

    await act(async () => {
      setValue(inputs.item(0), "new.user@example.com");
      setValue(inputs.item(1), "새 사용자");
      setValue(inputs.item(2), "PublicJarvis2026");
    });
    await act(async () => (container.querySelector("button") as HTMLButtonElement).click());

    expect(mocks.saveUsersAction).toHaveBeenCalledWith(expect.objectContaining({
      creates: [expect.objectContaining({
        email: "new.user@example.com",
        displayName: "새 사용자",
        initialPassword: "PublicJarvis2026",
      })],
    }));
    expect(container).toHaveTextContent("new.user@example.com");
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("does not send an invalid temporary password to the server", async () => {
    await act(async () => root.render(<UsersGridContainer initialRows={[]} total={0} currentUserId="admin-1" />));
    const inputs = container.querySelectorAll("input");
    await act(async () => {
      setValue(inputs.item(0), "new.user@example.com");
      setValue(inputs.item(1), "새 사용자");
      setValue(inputs.item(2), "short1");
      (container.querySelector("button") as HTMLButtonElement).click();
    });

    expect(mocks.saveUsersAction).not.toHaveBeenCalled();
    expect(container).toHaveTextContent("invalidInvite");
  });
});
