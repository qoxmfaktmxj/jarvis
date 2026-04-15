import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { GitRepo, defaultBotAuthor } from "../git.js";
import { createTempWorktree } from "../worktree.js";

describe("createTempWorktree lifecycle", () => {
  let repoDir: string;

  beforeEach(async () => {
    repoDir = await fs.mkdtemp(path.join(os.tmpdir(), "jarvis-wiki-wt-"));
  });

  afterEach(async () => {
    await fs.rm(repoDir, { recursive: true, force: true });
  });

  it("creates a worktree directory with a fresh branch and cleans up", async () => {
    const repo = new GitRepo(repoDir);
    await repo.createRepo("main");

    // Seed a file so the worktree has content to check out.
    await repo.writeAndCommit({
      files: { "seed.md": "seed\n" },
      message: "[manual] seed for worktree test",
      author: defaultBotAuthor(),
    });

    const handle = await createTempWorktree(repo);
    expect(handle.worktreePath).not.toBe(repoDir);
    expect(handle.branch).toMatch(/^wiki-ingest-/);

    // Worktree dir exists and contains the seeded file.
    const seedInWorktree = path.join(handle.worktreePath, "seed.md");
    expect(await fs.readFile(seedInWorktree, "utf8")).toBe("seed\n");

    // Administrative entry under .git/worktrees/ should also exist.
    const adminDir = path.join(repoDir, ".git", "worktrees");
    const entries = await fs.readdir(adminDir);
    expect(entries.length).toBeGreaterThan(0);

    // Cleanup must remove both the worktree directory and the admin entry.
    await handle.cleanup();

    const worktreeStillExists = await fs
      .stat(handle.worktreePath)
      .then(() => true)
      .catch(() => false);
    expect(worktreeStillExists).toBe(false);

    const adminEntriesAfter = await fs
      .readdir(adminDir)
      .catch(() => [] as string[]);
    expect(adminEntriesAfter).toEqual([]);
  });

  it("accepts an explicit branch name and baseRef", async () => {
    const repo = new GitRepo(repoDir);
    await repo.createRepo("main");
    await repo.writeAndCommit({
      files: { "hello.md": "hi\n" },
      message: "[manual] seed",
      author: defaultBotAuthor(),
    });

    const baseRef = await repo.headSha();
    const handle = await createTempWorktree(repo, {
      branch: "wiki-test-branch",
      baseRef,
    });

    try {
      expect(handle.branch).toBe("wiki-test-branch");
      const helloAtWorktree = path.join(handle.worktreePath, "hello.md");
      expect(await fs.readFile(helloAtWorktree, "utf8")).toBe("hi\n");
    } finally {
      await handle.cleanup();
    }
  });

  it("is idempotent: cleanup twice does not throw", async () => {
    const repo = new GitRepo(repoDir);
    await repo.createRepo("main");
    await repo.writeAndCommit({
      files: { "seed.md": "seed\n" },
      message: "[manual] seed",
      author: defaultBotAuthor(),
    });

    const handle = await createTempWorktree(repo);
    await handle.cleanup();
    await expect(handle.cleanup()).resolves.not.toThrow();
  });
});
