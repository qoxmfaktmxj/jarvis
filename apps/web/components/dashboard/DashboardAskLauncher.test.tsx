import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DASHBOARD_ASK_DRAFT_KEY } from "@/components/ai/ask-draft";
import { DashboardAskLauncher } from "./DashboardAskLauncher";

const router = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => ({
    eyebrow: "근거 기반 AI 어시스턴트",
    launcherTitle: "무엇을 확인할까요?",
    launcherDescription: "공식 근거와 기준일을 함께 찾아드립니다.",
    launcherLabel: "질문",
    launcherPlaceholder: "HR 관련 질문을 입력하세요…",
    launcherHint: "Enter 전송 · Shift+Enter 줄바꿈",
    launcherSubmit: "Ask AI에서 질문 시작",
    launcherStorageFailed: "질문을 전달할 수 없습니다. 다시 시도해 주세요.",
    "suggestions.meal": "식대 비과세 한도는?",
    "suggestions.retirement": "퇴직소득 원천징수 절차는?",
    "suggestions.dailyWorker": "일용근로자 지급명세서 제출기한은?",
    "suggestions.localTax": "종업원분 주민세 면세점은?",
  })[key] ?? key,
}));

function changeTextarea(textarea: HTMLTextAreaElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  setter?.call(textarea, value);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("DashboardAskLauncher", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("React", React);
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    sessionStorage.clear();
    router.push.mockReset();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("fills a suggestion without navigating", async () => {
    await act(async () => root.render(<DashboardAskLauncher />));
    const suggestion = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "식대 비과세 한도는?",
    );

    await act(async () => suggestion?.click());

    expect(container.querySelector("textarea")).toHaveValue("식대 비과세 한도는?");
    expect(router.push).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(DASHBOARD_ASK_DRAFT_KEY)).toBeNull();
  });

  it("stores the draft on Enter and keeps Shift+Enter for a newline", async () => {
    await act(async () => root.render(<DashboardAskLauncher />));
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    await act(async () => changeTextarea(textarea, "퇴직소득 원천징수 절차는?"));

    await act(async () => {
      textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", shiftKey: true, bubbles: true }));
    });
    expect(router.push).not.toHaveBeenCalled();

    await act(async () => {
      textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });

    expect(sessionStorage.getItem(DASHBOARD_ASK_DRAFT_KEY)).toBe("퇴직소득 원천징수 절차는?");
    expect(router.push).toHaveBeenCalledWith("/ask");
  });
});
