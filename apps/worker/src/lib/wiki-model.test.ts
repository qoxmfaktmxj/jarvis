import { describe, expect, it, vi } from "vitest";
import { createWorkerWikiModel } from "./wiki-model.js";

describe("createWorkerWikiModel", () => {
  it("uses CLI Proxy Sol for ingest without fallback", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => new Response(
      JSON.stringify({ choices: [{ message: { content: "{\"findings\":[]}" } }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    ));
    const model = createWorkerWikiModel({
      LLM_GATEWAY_URL: "http://127.0.0.1:8317/v1",
      LLM_GATEWAY_KEY: "local-proxy-secret",
    }, fetchImpl as typeof fetch);

    await expect(model.complete({
      purpose: "wiki-analyze",
      messages: [{ role: "user", content: "analyze" }],
      sourceRevisionId: "source-id",
      sourceTitle: "source",
      effectiveDate: null,
    })).resolves.toBe("{\"findings\":[]}");

    const request = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body)) as { model: string };
    expect(request.model).toBe("gpt-5.6-sol");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("fails immediately when the gateway credential is absent", () => {
    expect(() => createWorkerWikiModel({})).toThrow("LLM_GATEWAY_KEY is required for CLI Proxy");
  });
});
