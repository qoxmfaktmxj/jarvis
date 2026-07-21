import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createProvider } from "../provider.js";

const servers = new Set<ReturnType<typeof createServer>>();

afterEach(async () => {
  await Promise.all([...servers].map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  })));
  servers.clear();
});

describe("CLI Proxy provider contract", () => {
  it("calls only the configured local gateway with the subscription model", async () => {
    const requests: Array<{ url: string; authorization: string; body: unknown }> = [];
    const server = createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => { body += String(chunk); });
      req.on("end", () => {
        requests.push({
          url: req.url ?? "",
          authorization: String(req.headers.authorization ?? ""),
          body: JSON.parse(body) as unknown,
        });
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({
          choices: [{ message: { content: "답변 [[average-wage]]" } }],
          usage: { prompt_tokens: 12, completion_tokens: 7 },
        }));
      });
    });
    servers.add(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("failed to bind test server");

    const provider = createProvider({
      LLM_GATEWAY_URL: `http://127.0.0.1:${address.port}/v1`,
      LLM_GATEWAY_KEY: "local-proxy-secret",
      ASK_AI_MODEL: "gpt-5.6-terra",
    });
    const result = await provider.next({ messages: [{ role: "user", content: "테스트" }], tools: [] });

    expect(requests).toEqual([{
      url: "/v1/chat/completions",
      authorization: "Bearer local-proxy-secret",
      body: expect.objectContaining({ model: "gpt-5.6-terra" }),
    }]);
    expect(result.kind).toBe("final");
  });

  it("has no mock or direct API-key fallback", () => {
    expect(() => createProvider({})).toThrow("LLM_GATEWAY_KEY is required for CLI Proxy");
    expect(() => createProvider({
      LLM_GATEWAY_KEY: "local-proxy-secret",
      ASK_AI_MODEL: "unsupported-model",
    })).toThrow(/ASK_AI_MODEL/);
    expect(() => createProvider({
      LLM_GATEWAY_URL: "https://api.openai.com/v1",
      LLM_GATEWAY_KEY: "direct-key",
    })).toThrow(/loopback/);
  });
});
