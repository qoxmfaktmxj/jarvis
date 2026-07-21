import { describe, expect, it } from "vitest";
import { createCliProxyClient } from "../cli-proxy.js";

describe("CLI Proxy live smoke", () => {
  it.each([
    ["ASK_AI_MODEL" as const, "gpt-5.6-terra" as const],
    ["INGEST_AI_MODEL" as const, "gpt-5.6-sol" as const],
  ])("reaches the authenticated subscription gateway with %s", async (modelEnv, model) => {
    const client = createCliProxyClient(process.env, {
      modelEnv,
      defaultModel: model,
    });
    const response = await client.complete({
      messages: [{ role: "user", content: "한 단어로 OK라고 답해줘." }],
    });
    expect(client.model).toBe(model);
    expect(response.content.length).toBeGreaterThan(0);
  });
});
