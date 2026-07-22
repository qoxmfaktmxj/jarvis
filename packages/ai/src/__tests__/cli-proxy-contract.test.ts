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

  it("preserves the tool call id across the assistant and tool messages", async () => {
    const requests: Array<{ messages?: Array<Record<string, unknown>> }> = [];
    const server = createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => { body += String(chunk); });
      req.on("end", () => {
        const parsed = JSON.parse(body) as { messages?: Array<Record<string, unknown>> };
        requests.push(parsed);
        res.setHeader("content-type", "application/json");
        if (requests.length === 1) {
          res.end(JSON.stringify({
            choices: [{
              message: {
                content: null,
                tool_calls: [{
                  id: "call-wiki-search-1",
                  type: "function",
                  function: { name: "wiki_search", arguments: '{"query":"식대 비과세"}' },
                }],
              },
            }],
            usage: { prompt_tokens: 12, completion_tokens: 7 },
          }));
          return;
        }

        const assistant = parsed.messages?.[1] as {
          tool_calls?: Array<{ id?: string }>;
        } | undefined;
        const tool = parsed.messages?.[2] as { tool_call_id?: string } | undefined;
        if (
          assistant?.tool_calls?.[0]?.id !== "call-wiki-search-1" ||
          tool?.tool_call_id !== "call-wiki-search-1"
        ) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: { message: "missing tool call id" } }));
          return;
        }
        res.end(JSON.stringify({
          choices: [{ message: { content: "확인했습니다." } }],
          usage: { prompt_tokens: 18, completion_tokens: 4 },
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
    const tools = [{
      name: "wiki_search" as const,
      description: "Search the Wiki",
      inputSchema: { type: "object" },
    }];
    const first = await provider.next({
      messages: [{ role: "user", content: "식대 비과세 한도는?" }],
      tools,
    });
    expect(first.kind).toBe("tool");
    if (first.kind !== "tool") throw new Error("expected tool call");
    const call = first.call as typeof first.call & { id: string };
    expect(call.id).toBe("call-wiki-search-1");

    const second = await provider.next({
      messages: [
        { role: "user", content: "식대 비과세 한도는?" },
        { role: "assistant", content: "", toolCall: call },
        {
          role: "tool",
          content: JSON.stringify({ value: [] }),
          toolName: "wiki_search",
          toolCallId: call.id,
        },
      ] as Parameters<typeof provider.next>[0]["messages"],
      tools,
    });

    expect(second).toMatchObject({ kind: "final", text: "확인했습니다." });
    expect(requests).toHaveLength(2);
  });
});
