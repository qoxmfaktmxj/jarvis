import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { config, middleware } from "./middleware";

describe("middleware", () => {
  it("redirects unauthenticated root requests to login", () => {
    const response = middleware(new NextRequest("http://localhost:3010/"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3010/login?redirect=%2Fdashboard"
    );
  });

  it("lets the HMR websocket endpoint bypass auth redirects", () => {
    expect(config.matcher).toContain(
      "/((?!_next/static|_next/image|_next/webpack-hmr|favicon.ico).*)"
    );
  });
});
