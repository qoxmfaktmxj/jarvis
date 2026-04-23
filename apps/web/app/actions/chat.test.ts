import { describe, expect, it } from "vitest";
import { validateSend, validateToggle } from "./chat.js";

describe("chat action validators (pure)", () => {
  it("send: trims + rejects empty", () => {
    expect(validateSend({ body: "  hi  " }).body).toBe("hi");
    expect(() => validateSend({ body: "   " })).toThrow();
    expect(() => validateSend({ body: "x".repeat(2001) })).toThrow();
  });
  it("toggle: enforces whitelist", () => {
    expect(() => validateToggle({ messageId: "bad", emoji: "👍" })).toThrow();
    expect(() =>
      validateToggle({
        messageId: "00000000-0000-0000-0000-000000000001",
        emoji: "🔥" as never
      })
    ).toThrow();
  });
});
