import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { GitRepo } from "../git.js";
import { createTempWorktree } from "../worktree.js";

describe("createTempWorktree", () => {
  let repoDirectory: string;

  beforeEach(async () => {
    repoDirectory = await fs.mkdtemp(join(tmpdir(), "jarvis-wiki-main-"));
  });

  afterEach(async () => {
    await fs.rm(repoDirectory, { recursive: true, force: true });
  });

  it("returns repo + baseSha + worktreePath and cleanup is idempotent", async () => {
    const mainRepo = new GitRepo(repoDirectory);
    await mainRepo.createRepo("main");
    const baseSha = await mainRepo.headSha();
    const handle = await createTempWorktree(mainRepo, { baseSha });
    expect(handle.baseSha).toBe(baseSha);
    expect(handle.worktreePath).toContain("jarvis-wiki-wt-");
    expect(await handle.repo.headSha()).toBe(baseSha);
    await handle.cleanup();
    await expect(handle.cleanup()).resolves.not.toThrow();
    await expect(fs.stat(handle.worktreePath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects abbreviated bases before touching Git", async () => {
    const mainRepo = new GitRepo(repoDirectory);
    await mainRepo.createRepo("main");
    await expect(createTempWorktree(mainRepo, { baseSha: "abc123" })).rejects.toThrow(/full SHA/i);
  });
});
