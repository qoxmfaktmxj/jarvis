import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConversationListClient } from "./ConversationListClient";

const mocks = vi.hoisted(() => ({
  router: { replace: vi.fn(), refresh: vi.fn() },
  renameConversation: vi.fn(async () => ({ ok: true as const })),
  deleteConversation: vi.fn(async () => ({ ok: true as const })),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.ComponentProps<"a">) => <a href={href} {...props}>{children}</a>,
}));

vi.mock("next/navigation", () => ({ useRouter: () => mocks.router }));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => ({
    new: "새 대화",
    untitled: "제목 없음",
    menu: "대화 메뉴",
    rename: "이름 변경",
    renameTitle: "대화 이름 변경",
    renameLabel: "대화 이름",
    renameSave: "저장",
    delete: "삭제",
    deleteTitle: "대화를 삭제할까요?",
    deleteDescription: "이 작업은 되돌릴 수 없습니다.",
    deleteConfirm: "삭제",
    actionFailed: "작업을 완료하지 못했습니다.",
  })[key] ?? key,
}));
vi.mock("../actions", () => ({
  renameConversation: mocks.renameConversation,
  deleteConversation: mocks.deleteConversation,
}));

const rows = [{ id: "conversation-1", title: "기존 대화", updatedAt: new Date() }];

describe("ConversationListClient", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("React", React);
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mocks.router.replace.mockReset();
    mocks.router.refresh.mockReset();
    mocks.renameConversation.mockReset();
    mocks.deleteConversation.mockReset();
    mocks.renameConversation.mockResolvedValue({ ok: true });
    mocks.deleteConversation.mockResolvedValue({ ok: true });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  async function renderList(activeConversationId = "conversation-1") {
    await act(async () => root.render(<ConversationListClient rows={rows} activeConversationId={activeConversationId} />));
  }

  it("links the new conversation plus button to /ask and exposes a menu per row", async () => {
    await renderList();

    expect(container.querySelector("aside")).toHaveClass("h-full", "overflow-hidden");
    expect(container.querySelector("nav")).toHaveClass("overflow-y-auto");
    expect(container.querySelectorAll('a[href="/ask"]')).toHaveLength(1);
    expect(container.querySelector('a[href="/ask"]')).toHaveAttribute("aria-label", "새 대화");
    expect(container.querySelector('button[aria-label="대화 메뉴"]')).toBeInTheDocument();
  });

  it("submits a trimmed rename through the server action", async () => {
    await renderList();
    await act(async () => (container.querySelector('button[aria-label="대화 메뉴"]') as HTMLButtonElement).click());
    await act(async () => (container.querySelector('button[data-action="rename"]') as HTMLButtonElement).click());

    const input = document.body.querySelector('input[aria-label="대화 이름"]') as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "  새 제목  ");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => (document.body.querySelector('button[type="submit"]') as HTMLButtonElement).click());

    expect(mocks.renameConversation).toHaveBeenCalledWith("conversation-1", "새 제목");
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
  });

  it("uses a destructive confirmation and returns home after deleting the active conversation", async () => {
    await renderList();
    await act(async () => (container.querySelector('button[aria-label="대화 메뉴"]') as HTMLButtonElement).click());

    const deleteButton = container.querySelector('button[data-action="delete"]') as HTMLButtonElement;
    expect(deleteButton.className).toContain("text-red-700");
    await act(async () => deleteButton.click());
    expect(document.body.querySelector('[role="dialog"]')).toHaveTextContent("대화를 삭제할까요?");

    await act(async () => (document.body.querySelector('button[data-action="confirm-delete"]') as HTMLButtonElement).click());

    expect(mocks.deleteConversation).toHaveBeenCalledWith("conversation-1");
    expect(mocks.router.replace).toHaveBeenCalledWith("/ask");
  });

  it("closes the menu with Escape", async () => {
    await renderList();
    await act(async () => (container.querySelector('button[aria-label="대화 메뉴"]') as HTMLButtonElement).click());
    expect(container.querySelector('button[data-action="rename"]')).toBeInTheDocument();

    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));

    expect(container.querySelector('button[data-action="rename"]')).toBeNull();
  });
});
