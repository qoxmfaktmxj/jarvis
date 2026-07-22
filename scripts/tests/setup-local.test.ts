import { access, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, vi } from "vitest";
import { dataSync, runCommand, setupLocal } from "../setup-local.js";

async function pathExists(path: string) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

describe("setupLocal", () => {
  it.runIf(process.platform === "win32")(
    "runs the pnpm Windows command shim without spawn EINVAL",
    async () => {
      await expect(
        runCommand("pnpm", ["--version"], { cwd: process.cwd(), env: process.env }),
      ).resolves.toBeUndefined();
    },
  );

  it("rejects production, writes .env.local only once, and uses supplied cwd for commands", async () => {
    const sandbox = await mkdtemp(join(tmpdir(), "jarvis-setup-local-"));
    const fakeRun = vi.fn(async () => {});

    await expect(
      setupLocal({ env: { NODE_ENV: "production" }, cwd: sandbox })
    ).rejects.toThrow(/production/i);

    await setupLocal({ env: { ...process.env }, cwd: sandbox, run: fakeRun });
    expect(await pathExists(join(sandbox, ".env.local"))).toBe(true);
    const first = await readFile(join(sandbox, ".env.local"), "utf8");

    await setupLocal({ env: { ...process.env }, cwd: sandbox, run: fakeRun });
    const second = await readFile(join(sandbox, ".env.local"), "utf8");

    expect(second).toBe(first);
    expect(first).toMatch(/^DATABASE_URL=postgresql:\/\/jarvis_public:/m);
    expect(first).toMatch(/^SESSION_SECRET=(?!.*1234).+/m);
    expect(first).toContain("WIKI_REPO_ROOT=");
    expect(first).toContain(".runtime/wiki-repo");
    expect(first).toContain("MINIO_BUCKET=jarvis-public-sources");
    expect(first).toContain("LLM_GATEWAY_URL=http://127.0.0.1:8317/v1");
    expect(first).toContain("LLM_GATEWAY_KEY=sk-jarvis-local-dev");
    expect(first).toContain("ASK_AI_MODEL=gpt-5.6-terra");
    expect(first).toContain("INGEST_AI_MODEL=gpt-5.6-sol");
    expect(first).not.toMatch(/^BOOTSTRAP_ADMIN_/m);

    expect(fakeRun).toHaveBeenNthCalledWith(
      1,
      "docker",
      expect.arrayContaining(["compose", "--env-file", join(sandbox, ".env.local"), "-f", "infra/compose.yaml", "--project-name", "jarvis-public-local", "up", "-d", "--wait"]),
      expect.objectContaining({ cwd: sandbox, env: expect.any(Object) })
    );
    expect(fakeRun).toHaveBeenNthCalledWith(2, "pnpm", ["db:migrate"], expect.objectContaining({ cwd: sandbox }));
    expect(fakeRun).toHaveBeenNthCalledWith(3, "pnpm", ["db:seed"], expect.objectContaining({ cwd: sandbox }));
    expect(fakeRun).toHaveBeenNthCalledWith(4, "pnpm", ["samples:ingest"], expect.objectContaining({ cwd: sandbox }));
    expect(fakeRun).toHaveBeenNthCalledWith(5, "pnpm", ["wiki:bootstrap"], expect.objectContaining({ cwd: sandbox }));
    expect(fakeRun).toHaveBeenNthCalledWith(6, "pnpm", ["wiki:project"], expect.objectContaining({ cwd: sandbox }));
    expect(fakeRun).not.toHaveBeenCalledWith("pnpm", ["admin:bootstrap"], expect.objectContaining({ cwd: sandbox }));
  });

  it("syncs bundled Wiki pages between source ingest and projection", async () => {
    const sandbox = await mkdtemp(join(tmpdir(), "jarvis-data-sync-"));
    const fakeRun = vi.fn(async () => {});
    await writeFile(join(sandbox, ".env.local"), [
      "DATABASE_URL=postgresql://example",
      "SESSION_SECRET=example",
      `WIKI_REPO_ROOT=${join(sandbox, ".runtime", "wiki-repo")}`,
      "MINIO_ENDPOINT=http://127.0.0.1:59000",
      "MINIO_ACCESS_KEY=example",
      "MINIO_SECRET_KEY=example",
      "MINIO_BUCKET=example",
      "LLM_GATEWAY_URL=http://127.0.0.1:8317/v1",
      "LLM_GATEWAY_KEY=example",
      "ASK_AI_MODEL=example",
      "INGEST_AI_MODEL=example",
      "",
    ].join("\n"));

    await dataSync({ cwd: sandbox, run: fakeRun });

    expect(fakeRun).toHaveBeenNthCalledWith(1, "pnpm", ["samples:ingest"], expect.any(Object));
    expect(fakeRun).toHaveBeenNthCalledWith(2, "pnpm", ["wiki:sync-samples"], expect.any(Object));
    expect(fakeRun).toHaveBeenNthCalledWith(3, "pnpm", ["wiki:project"], expect.any(Object));
  });
});
