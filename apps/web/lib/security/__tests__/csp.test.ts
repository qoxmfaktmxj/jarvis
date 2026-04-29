import { describe, expect, it } from "vitest";
import { buildCsp } from "../csp.js";

describe("buildCsp", () => {
  it("prod CSP includes strict-dynamic + nonce", () => {
    const csp = buildCsp({ nonce: "abc123", isProd: true });
    expect(csp).toMatchSnapshot();
    expect(csp).toContain("'nonce-abc123'");
    expect(csp).toContain("'strict-dynamic'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("prod CSP does not include ws: in connect-src", () => {
    const csp = buildCsp({ nonce: "abc123", isProd: true });
    expect(csp).not.toContain("ws:");
  });

  it("dev CSP allows ws: for HMR in connect-src", () => {
    const csp = buildCsp({ nonce: "test-nonce", isProd: false });
    expect(csp).toMatchSnapshot();
    expect(csp).toContain("ws:");
  });

  it("both variants include required directives", () => {
    for (const isProd of [true, false]) {
      const csp = buildCsp({ nonce: "n", isProd });
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("base-uri 'self'");
      expect(csp).toContain("form-action 'self'");
      expect(csp).toContain("style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net");
      expect(csp).toContain("font-src 'self' data: https://cdn.jsdelivr.net");
      expect(csp).toContain("img-src 'self' data: blob:");
    }
  });

  it("nonce is interpolated into script-src", () => {
    const csp = buildCsp({ nonce: "unique-nonce-xyz", isProd: true });
    expect(csp).toContain("'nonce-unique-nonce-xyz'");
    expect(csp).toContain("script-src 'self' 'nonce-unique-nonce-xyz' 'strict-dynamic'");
  });
});
