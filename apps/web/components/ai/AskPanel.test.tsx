import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DASHBOARD_ASK_DRAFT_KEY } from "./ask-draft";
import { AskPanel } from "./AskPanel";

const router = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) =>
    ({
      "Composer.label": "질문",
      "Composer.placeholder": "무엇이든 물어보세요…",
      "Composer.hint": "Enter 전송 · Shift+Enter 줄바꿈",
      "Composer.submit": "질문 전송",
      "Composer.submitting": "질문 처리 중",
      "Composer.failed": "질문 처리에 실패했습니다.",
      "Timeline.assistant": "Jarvis",
      "Timeline.thinking": "근거를 확인하고 있습니다",
      "Empty.eyebrow": "문서 기반 AI 어시스턴트",
      "Empty.title": "무엇이 궁금하신가요?",
      "Empty.description": "등록된 문서를 근거로 답변합니다.",
    })[key] ?? key,
}));

function changeTextarea(textarea: HTMLTextAreaElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  setter?.call(textarea, value);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("AskPanel", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("React", React);
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    sessionStorage.clear();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    router.replace.mockReset();
  });

  it("clears the composer and renders the submitted question before the answer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          [
            'event: abstain\ndata: {"type":"abstain","reason":"근거를 확인할 수 없어 답변을 보류합니다."}\n',
            'event: done\ndata: {"type":"done"}\n',
          ].join("\n"),
          { status: 200, headers: { "Content-Type": "text/event-stream" } },
        ),
      ),
    );

    await act(async () => root.render(<AskPanel />));
    const textarea = container.querySelector("textarea");
    expect(textarea).not.toBeNull();

    await act(async () => changeTextarea(textarea as HTMLTextAreaElement, "HR 관련 질문 뭐할까?"));
    await act(async () => {
      textarea?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      await Promise.resolve();
    });

    expect(textarea).toHaveValue("");
    expect(
      [...container.querySelectorAll("[data-message-role]")].map((node) => node.getAttribute("data-message-role")),
    ).toEqual(["user", "assistant"]);
  });

  it("consumes a dashboard draft exactly once", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        [
          'event: abstain\ndata: {"type":"abstain","reason":"근거를 확인할 수 없어 답변을 보류합니다."}\n',
          'event: done\ndata: {"type":"done"}\n',
        ].join("\n"),
        {
          status: 200,
          headers: {
            "Content-Type": "text/event-stream",
            "X-Conversation-Id": "550e8400-e29b-41d4-a716-446655440000",
          },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    sessionStorage.setItem(DASHBOARD_ASK_DRAFT_KEY, "식대 비과세 한도는?");

    await act(async () => {
      root.render(<AskPanel />);
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/ask",
      expect.objectContaining({ body: JSON.stringify({ question: "식대 비과세 한도는?" }) }),
    );
    expect(sessionStorage.getItem(DASHBOARD_ASK_DRAFT_KEY)).toBeNull();
  });
});
