import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("openai", () => {
  return {
    default: vi.fn().mockImplementation((opts: Record<string, unknown>) => ({ _opts: opts })),
  };
});

import { getProvider, __resetProviderCache } from "./provider.js";

describe("getProvider", () => {
  beforeEach(() => {
    __resetProviderCache();
    // restore gateway-related env vars to known state
    delete process.env["LLM_GATEWAY_KEY"];
    delete process.env["CLIPROXY_API_KEY"];
    process.env["OPENAI_API_KEY"] = "sk-direct-test";
    process.env["FEATURE_SUBSCRIPTION_QUERY"] = "false";
  });

  it("returns direct client when flag is off", () => {
    const { via } = getProvider("query");
    expect(via).toBe("direct");
  });

  it("throws when gateway is enabled but no key is set", () => {
    process.env["FEATURE_SUBSCRIPTION_QUERY"] = "true";
    expect(() => getProvider("query", false)).toThrow(
      /LLM_GATEWAY_KEY|CLIPROXY_API_KEY/
    );
  });

  it("returns gateway client when flag is on and key is present", () => {
    process.env["FEATURE_SUBSCRIPTION_QUERY"] = "true";
    process.env["LLM_GATEWAY_KEY"] = "sk-real-key";
    const { via } = getProvider("query", false);
    expect(via).toBe("gateway");
  });

  it("returns gateway client when flag is on and CLIPROXY_API_KEY is present", () => {
    process.env["FEATURE_SUBSCRIPTION_QUERY"] = "true";
    process.env["CLIPROXY_API_KEY"] = "sk-proxy-key";
    const { via } = getProvider("query", false);
    expect(via).toBe("gateway");
  });
});
