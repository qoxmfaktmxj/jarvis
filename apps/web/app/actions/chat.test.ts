import { describe, expect, it } from "vitest";
import { validateSend, validateToggle } from "./chat.validators.js";
import { chatChannel } from "@jarvis/shared/chat/channel";

describe("chatChannel", () => {
  it("replaces dashes with underscores so pg_notify channel is valid", () => {
    const ws = "550e8400-e29b-41d4-a716-446655440000";
    expect(chatChannel(ws)).toBe("chat_ws_550e8400_e29b_41d4_a716_446655440000");
  });
  it("produces consistent channel regardless of UUID format", () => {
    const ch = chatChannel("00000000-0000-0000-0000-000000000001");
    expect(ch).not.toContain("-");
    expect(ch.startsWith("chat_ws_")).toBe(true);
  });
});

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
