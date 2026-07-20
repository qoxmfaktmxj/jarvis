import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { simpleGit } from "simple-git";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { GitRepo } from "../git.js";
import { createTempWorktree } from "../worktree.js";

const AUTHOR = { name: "jarvis-wiki-bot", email: "wiki-bot@example.invalid" };

describe("GitRepo", () => {
  let repoDirectory: string;

  beforeEach(async () => {
    repoDirectory = await fs.mkdtemp(join(tmpdir(), "jarvis-wiki-git-"));
  });

  afterEach(async () => {
    await fs.rm(repoDirectory, { recursive: true, force: true });
  });

  it("has only the narrow public method surface and rejects abbreviated refs", async () => {
    const methods = Object.getOwnPropertyNames(GitRepo.prototype);
    expect(methods).not.toEqual(expect.arrayContaining(["raw", "openWorktree", "isAncestor", "fastForwardMain"]));
    const repo = new GitRepo(repoDirectory);
    await repo.createRepo("main");
    const git = simpleGit({ baseDir: repoDirectory });
    const maintenanceAuto = ["main", "tenance.auto"].join("");
    await expect(git.raw(["config", "--get", maintenanceAuto])).resolves.toBe("false\n");
    await expect(git.raw(["config", "--get", "gc.auto"])).resolves.toBe("0\n");
    await expect(repo.readBlob("abc123", "auto/note.md")).rejects.toThrow(/full SHA/i);
    await expect(repo.listTreePaths("abc123")).rejects.toThrow(/full SHA/i);
  });

  it("includes safe pre-existing wiki pages in the bootstrap commit", async () => {
    await fs.mkdir(join(repoDirectory, "auto", "concepts"), { recursive: true });
    await fs.writeFile(join(repoDirectory, "auto", "concepts", "bootstrap.md"), "# bootstrap\n", "utf8");

    const repo = new GitRepo(repoDirectory);
    await repo.createRepo("main");

    await expect(repo.listTreePaths(await repo.headSha())).resolves.toEqual([
      "auto/concepts/bootstrap.md",
    ]);
  });

  it("rejects non-wiki files from a pre-existing bootstrap tree", async () => {
    await fs.writeFile(join(repoDirectory, ".env"), "must-not-be-committed\n", "utf8");

    const repo = new GitRepo(repoDirectory);
    await expect(repo.createRepo("main")).rejects.toThrow(/bootstrap tree|wiki path/i);
  });

  it("commits normalized exact paths and fast-forwards from a detached worktree", async () => {
    const mainRepo = new GitRepo(repoDirectory);
    await mainRepo.createRepo("main");
    const baseSha = await mainRepo.headSha();
    const handle = await createTempWorktree(mainRepo, { baseSha });
    try {
      const commit = await handle.repo.writeAndCommit({
        actor: "system",
        files: { "auto/concepts/a.md": "A\r\n" },
        message: "[manual] seed",
        author: AUTHOR,
      });
      await expect(mainRepo.fastForwardTo(commit.sha, baseSha)).resolves.toBeUndefined();
      await expect(mainRepo.fastForwardTo(commit.sha, baseSha)).resolves.toBeUndefined();
      await expect(fs.readFile(join(repoDirectory, "auto", "concepts", "a.md"), "utf8")).resolves.toBe("A\n");
    } finally {
      await handle.cleanup();
    }
  });

  it("rejects pathspecs, invalid authors, dirty worktrees, and stale compare-and-swap bases", async () => {
    const mainRepo = new GitRepo(repoDirectory);
    await mainRepo.createRepo("main");
    await expect(
      mainRepo.writeAndCommit({
        actor: "system",
        files: { "auto/*.md": "x" },
        message: "[manual] unsafe path",
        author: AUTHOR,
      }),
    ).rejects.toThrow(/pathspec/i);
    await expect(
      mainRepo.writeAndCommit({
        actor: "system",
        files: { "auto/a.md": "x" },
        message: "[manual] unsafe author",
        author: { name: "bad\nname", email: "bad@example.invalid" },
      }),
    ).rejects.toThrow(/author/i);

    const baseSha = await mainRepo.headSha();
    const handle = await createTempWorktree(mainRepo, { baseSha });
    try {
      const commit = await handle.repo.writeAndCommit({
        actor: "system",
        files: { "auto/a.md": "x" },
        message: "[manual] detached change",
        author: AUTHOR,
      });
      await fs.writeFile(join(repoDirectory, "untracked.txt"), "dirty");
      await expect(mainRepo.fastForwardTo(commit.sha, baseSha)).rejects.toThrow(/dirty/i);
      await fs.rm(join(repoDirectory, "untracked.txt"));
      const unrelated = await mainRepo.writeAndCommit({
        actor: "system",
        files: { "auto/b.md": "b" },
        message: "[manual] competing change",
        author: AUTHOR,
      });
      await expect(mainRepo.fastForwardTo(commit.sha, baseSha)).rejects.toThrow(/stale/i);
      expect(await mainRepo.headSha()).toBe(unrelated.sha);
    } finally {
      await handle.cleanup();
    }
  });

  it("finds source revision markers beyond the recent ten commits", async () => {
    const repo = new GitRepo(repoDirectory);
    await repo.createRepo("main");
    const marker = "source-revision:550e8400-e29b-41d4-a716-446655440000";
    const marked = await repo.writeAndCommit({
      actor: "system",
      files: { "auto/concepts/seed.md": "seed\n" },
      message: `[ingest] ${marker}`,
      author: AUTHOR,
    });
    const git = simpleGit({ baseDir: repoDirectory });
    for (let index = 0; index < 10; index += 1) {
      await git.raw(["commit", "--allow-empty", "-m", `[manual] filler ${index}`]);
    }
    await expect(repo.hasCommitTrailer(marker)).resolves.toMatchObject({
      sha: marked.sha,
      affectedPaths: ["auto/concepts/seed.md"],
    });
    await expect(repo.log()).resolves.toHaveLength(10);
    await expect(repo.logAll()).resolves.toHaveLength(12);
  });

  it("rejects non-blob tree entries", async () => {
    const repo = new GitRepo(repoDirectory);
    await repo.createRepo("main");
    const git = simpleGit({ baseDir: repoDirectory });
    await fs.writeFile(join(repoDirectory, "link-target.txt"), "auto/concepts/target.md", "utf8");
    const blobSha = (await git.raw(["hash-object", "-w", "link-target.txt"])).trim();
    await git.raw(["update-index", "--add", "--cacheinfo", `120000,${blobSha},auto/link.md`]);
    await git.raw(["commit", "-m", "[manual] add synthetic symlink entry"]);
    await expect(repo.listTreePaths(await repo.headSha())).rejects.toThrow(/120000/);
  });
});
