import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("db migration CLI", () => {
  it("prints the underlying connection error", () => {
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "src/migrate-cli.ts"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          NODE_ENV: "production",
          DATABASE_URL: "postgresql://jarvis_public:invalid@127.0.0.1:1/jarvis_public",
        },
        timeout: 10_000,
      },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("ECONNREFUSED");
  });
});
