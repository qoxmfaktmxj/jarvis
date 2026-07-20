import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("repo policy files", () => {
  it("pins CODEOWNERS to the real owner handle", async () => {
    const codeowners = await readFile(join(process.cwd(), ".github", "CODEOWNERS"), "utf8");
    expect(codeowners).toContain("@qoxmfaktmxj");
    expect(codeowners).not.toContain(`@${["repo", "owner"].join("-")}`);
  });

  it("ensures CI provisions local setup before integration/e2e gates", async () => {
    const workflow = await readFile(join(process.cwd(), ".github", "workflows", "ci.yml"), "utf8");
    expect(workflow).toContain("pnpm setup:local");
    expect(workflow).toContain("pnpm test:integration");
    expect(workflow).toContain("pnpm test:e2e");
    expect(workflow).toContain("pnpm worker:eval");
  });

  it("keeps runtime package exports on tracked source files", async () => {
    for (const packageName of ["wiki-fs", "wiki-agent"]) {
      const manifest = JSON.parse(
        await readFile(join(process.cwd(), "packages", packageName, "package.json"), "utf8"),
      ) as { exports?: unknown };
      expect(JSON.stringify(manifest.exports), packageName).not.toContain("./dist/");
    }
  });

  it("passes the isolated runtime configuration through Turbo", async () => {
    const turbo = JSON.parse(
      await readFile(join(process.cwd(), "turbo.json"), "utf8"),
    ) as { globalEnv?: string[] };
    expect(turbo.globalEnv).toEqual(expect.arrayContaining([
      "DATABASE_URL",
      "TEST_DATABASE_URL",
      "SESSION_SECRET",
      "WIKI_REPO_ROOT",
      "MINIO_ENDPOINT",
      "MINIO_ACCESS_KEY",
      "MINIO_SECRET_KEY",
      "MINIO_BUCKET",
      "LLM_MODE",
      "ASK_DAILY_BUDGET_USD",
    ]));
  });

  it("emits worker build artifacts only into dist", async () => {
    const workerTsconfig = JSON.parse(
      await readFile(join(process.cwd(), "apps", "worker", "tsconfig.json"), "utf8"),
    ) as { compilerOptions?: Record<string, unknown> };
    expect(workerTsconfig.compilerOptions).toMatchObject({
      rootDir: "src",
      outDir: "dist",
      noEmit: false,
    });
  });
});
