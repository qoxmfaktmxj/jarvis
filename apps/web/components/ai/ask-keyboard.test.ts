import { describe, expect, it } from "vitest";
import { shouldSubmitQuestion, type AskKeyboardEvent } from "./ask-keyboard";

function keyboardEvent(overrides: Partial<AskKeyboardEvent> = {}): AskKeyboardEvent {
  return {
    key: "Enter",
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    isComposing: false,
    ...overrides,
  };
}

describe("shouldSubmitQuestion", () => {
  it("submits on Enter", () => {
    expect(shouldSubmitQuestion(keyboardEvent())).toBe(true);
  });

  it("keeps Shift+Enter as a newline", () => {
    expect(shouldSubmitQuestion(keyboardEvent({ shiftKey: true }))).toBe(false);
  });

  it("does not submit modifier shortcuts", () => {
    expect(shouldSubmitQuestion(keyboardEvent({ ctrlKey: true }))).toBe(false);
    expect(shouldSubmitQuestion(keyboardEvent({ metaKey: true }))).toBe(false);
  });

  it("does not submit while an IME composition is active", () => {
    expect(shouldSubmitQuestion(keyboardEvent({ isComposing: true }))).toBe(false);
  });

  it("ignores non-Enter keys", () => {
    expect(shouldSubmitQuestion(keyboardEvent({ key: "a" }))).toBe(false);
  });
});
