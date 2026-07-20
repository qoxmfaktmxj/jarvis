import { describe, expect, it, vi } from "vitest";
import { fetchAllowed } from "./fetch-allowed.js";

const policy = {
  hostnames: new Set(["open.example.go.kr"]),
  pathPrefixes: ["/api/legal"],
  contentTypes: new Set(["application/json"]),
  maxBytes: 1024,
  timeoutMs: 1_000,
};

describe("fetchAllowed", () => {
  it("rejects non-HTTPS, unknown hosts, unknown endpoints, and credentials before fetch", async () => {
    const fetchImpl = vi.fn();
    const credentialUrl = new URL("https://open.example.go.kr/api/legal");
    credentialUrl.username = "user";
    credentialUrl.password = "pass";

    for (const url of [
      new URL("http://open.example.go.kr/api/legal"),
      new URL("https://attacker.example/api/legal"),
      new URL("https://open.example.go.kr/private"),
      credentialUrl,
    ]) {
      await expect(fetchAllowed(url, policy, fetchImpl as unknown as typeof fetch))
        .rejects.toThrow(/denied/);
    }

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("streams an allowlisted response with size and MIME enforcement", async () => {
    const fetchImpl = vi.fn(async () => new Response('{"ok":true}', {
      status: 200,
      headers: { "content-type": "application/json" },
    }));

    const result = await fetchAllowed(
      new URL("https://open.example.go.kr/api/legal/items"),
      policy,
      fetchImpl as unknown as typeof fetch,
    );

    expect(new TextDecoder().decode(result.bytes)).toBe('{"ok":true}');
    expect(result.contentType).toBe("application/json");
  });

  it("rejects redirecting responses, denied MIME types, and oversized bodies", async () => {
    const redirectingFetch = vi.fn(async () => Response.redirect("https://open.example.go.kr/api/legal/next", 302));
    await expect(fetchAllowed(
      new URL("https://open.example.go.kr/api/legal/items"),
      policy,
      redirectingFetch as unknown as typeof fetch,
    )).rejects.toThrow(/provider HTTP|redirect/i);

    const htmlFetch = vi.fn(async () => new Response("<html></html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    }));
    await expect(fetchAllowed(
      new URL("https://open.example.go.kr/api/legal/items"),
      policy,
      htmlFetch as unknown as typeof fetch,
    )).rejects.toThrow(/content type denied/);

    const largeFetch = vi.fn(async () => new Response("x".repeat(2048), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    await expect(fetchAllowed(
      new URL("https://open.example.go.kr/api/legal/items"),
      policy,
      largeFetch as unknown as typeof fetch,
    )).rejects.toThrow(/too large/);
  });
});
