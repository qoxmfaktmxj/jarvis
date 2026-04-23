import { describe, expect, it } from "vitest";
import {
  sendMessageInputSchema,
  toggleReactionInputSchema
} from "./chat.js";

describe("sendMessageInputSchema", () => {
  it("accepts 1..2000 chars after trim", () => {
    expect(sendMessageInputSchema.parse({ body: "hi" }).body).toBe("hi");
    expect(sendMessageInputSchema.parse({ body: "  hi  " }).body).toBe("hi");
  });
  it("rejects empty and >2000", () => {
    expect(() => sendMessageInputSchema.parse({ body: "" })).toThrow();
    expect(() => sendMessageInputSchema.parse({ body: "   " })).toThrow();
    expect(() =>
      sendMessageInputSchema.parse({ body: "x".repeat(2001) })
    ).toThrow();
  });
});

describe("toggleReactionInputSchema", () => {
  it("accepts whitelist emoji", () => {
    const out = toggleReactionInputSchema.parse({
      messageId: "00000000-0000-0000-0000-000000000001",
      emoji: "👍"
    });
    expect(out.emoji).toBe("👍");
  });
  it("rejects non-whitelist emoji", () => {
    expect(() =>
      toggleReactionInputSchema.parse({
        messageId: "00000000-0000-0000-0000-000000000001",
        emoji: "🔥"
      })
    ).toThrow();
  });
  it("rejects non-uuid messageId", () => {
    expect(() =>
      toggleReactionInputSchema.parse({
        messageId: "not-uuid",
        emoji: "👍"
      })
    ).toThrow();
  });
});
