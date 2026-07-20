import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createProvider } from "../provider.js";

const servers = new Set<ReturnType<typeof createServer>>();

afterEach(async () => {
  await Promise.all(
    [...servers].map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    ),
  );
  servers.clear();
});

describe("openai provider contract", () => {
  it("uses only the caller-supplied baseUrl and local fetch target", async () => {
    const requests: string[] = [];
    const server = createServer((req, res) => {
      requests.push(req.url ?? "");
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          choices: [{ message: { content: "답변 [[average-wage]] [source:11111111-1111-4111-8111-111111111111#paragraph:1]" } }],
          usage: { prompt_tokens: 12, completion_tokens: 7 },
        }),
      );
    });
    servers.add(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("failed to bind test server");
    }

    const provider = createProvider({
      LLM_MODE: "openai",
      OPENAI_API_KEY: "test-key",
      OPENAI_BASE_URL: `http://127.0.0.1:${address.port}/v1`,
      OPENAI_MODEL: "fake-model",
    });

    const result = await provider.next({
      messages: [{ role: "user", content: "테스트" }],
      tools: [],
    });

    expect(requests).toEqual(["/v1/chat/completions"]);
    expect(result.kind).toBe("final");
  });

  it("rejects production mock without explicit allow flag", () => {
    expect(() => createProvider({ NODE_ENV: "production", LLM_MODE: "mock" })).toThrow(
      "LLM_MODE=mock is disabled in production",
    );
  });
});
