import { describe, it, expect } from "vitest";
import { getModelContextWindow, DEFAULT_CONTEXT_WINDOW } from "./model-windows";

describe("getModelContextWindow", () => {
  it("returns 400k for gpt-5.5", () => {
    expect(getModelContextWindow("gpt-5.5")).toBe(400_000);
  });

  it("returns 400k for gpt-5.4-mini", () => {
    expect(getModelContextWindow("gpt-5.4-mini")).toBe(400_000);
  });

  it("falls back to DEFAULT_CONTEXT_WINDOW for unknown model", () => {
    expect(getModelContextWindow("unknown-model-x")).toBe(DEFAULT_CONTEXT_WINDOW);
  });

  it("DEFAULT_CONTEXT_WINDOW is a positive integer", () => {
    expect(DEFAULT_CONTEXT_WINDOW).toBeGreaterThan(0);
    expect(Number.isInteger(DEFAULT_CONTEXT_WINDOW)).toBe(true);
  });
});
