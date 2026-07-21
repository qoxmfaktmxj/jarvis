import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("repo policy files", () => {
  it("uses the public repository name", async () => {
    const manifest = JSON.parse(
      await readFile(join(process.cwd(), "package.json"), "utf8"),
    ) as { name?: string };

    expect(manifest.name).toBe("jarvis");
  });

  it("keeps the example wiki repository path generic", async () => {
    const environment = await readFile(join(process.cwd(), ".env.example"), "utf8");

    expect(environment).not.toContain("jarvis-public-staging");
    expect(environment).toContain("WIKI_REPO_ROOT=C:/absolute/path/to/jarvis/.runtime/wiki-repo");
  });

  it("publishes the standard MIT license and links to it from the README", async () => {
    const [license, readme] = await Promise.all([
      readFile(join(process.cwd(), "LICENSE"), "utf8"),
      readFile(join(process.cwd(), "README.md"), "utf8"),
    ]);

    expect(license).toBe(`MIT License

Copyright (c) 2026 qoxmfaktmxj

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`);
    expect(readme).toContain("[MIT](LICENSE)");
  });

  it("keeps public security documents release-ready and uses GitHub advisories", async () => {
    const [security, audit, gitleaks] = await Promise.all([
      readFile(join(process.cwd(), "SECURITY.md"), "utf8"),
      readFile(join(process.cwd(), "docs", "security-audit.md"), "utf8"),
      readFile(join(process.cwd(), "config", "gitleaks.toml"), "utf8"),
    ]);

    for (const document of [security, audit, gitleaks]) {
      expect(document).not.toMatch(/candidate|no remote/i);
    }
    expect(security).toContain("https://github.com/qoxmfaktmxj/jarvis/security/advisories/new");
  });

  it("pins CODEOWNERS to the real owner handle", async () => {
    const codeowners = await readFile(join(process.cwd(), ".github", "CODEOWNERS"), "utf8");
    expect(codeowners).toContain("@qoxmfaktmxj");
    expect(codeowners).not.toContain(`@${["repo", "owner"].join("-")}`);
  });

  it("keeps integration/e2e gates in manual deep verification", async () => {
    const required = await readFile(join(process.cwd(), ".github", "workflows", "ci.yml"), "utf8");
    const deep = await readFile(join(process.cwd(), ".github", "workflows", "deep-verify.yml"), "utf8");
    expect(required).not.toContain("pnpm setup:local");
    expect(deep).toContain("pnpm setup:local");
    expect(deep).toContain("pnpm test:integration");
    expect(deep).toContain("pnpm test:e2e");
    expect(deep).toContain("pnpm worker:eval");
  });

  it("installs Playwright from the web package in deep verification", async () => {
    const workflow = await readFile(join(process.cwd(), ".github", "workflows", "deep-verify.yml"), "utf8");
    expect(workflow).toContain("pnpm --filter @jarvis/web exec playwright install chromium --with-deps");
    expect(workflow).not.toContain("pnpm exec playwright install chromium --with-deps");
  });

  it("blocks moderate dependency vulnerabilities in deep verification", async () => {
    const workflow = await readFile(join(process.cwd(), ".github", "workflows", "deep-verify.yml"), "utf8");
    expect(workflow).toContain("pnpm audit --audit-level=moderate");
    expect(workflow).not.toContain("pnpm audit --audit-level=high");
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
      "LLM_GATEWAY_URL",
      "LLM_GATEWAY_KEY",
      "ASK_AI_MODEL",
      "INGEST_AI_MODEL",
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
