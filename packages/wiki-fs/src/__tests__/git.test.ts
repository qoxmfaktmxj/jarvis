import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  GitRepo,
  defaultBotAuthor,
  validateCommitMessage,
} from "../git.js";
import { COMMIT_PREFIXES } from "../types.js";

describe("validateCommitMessage", () => {
  for (const prefix of COMMIT_PREFIXES) {
    it(`accepts prefix ${prefix}`, () => {
      expect(() =>
        validateCommitMessage(`${prefix} 한국어 설명이 붙어있다`),
      ).not.toThrow();
    });
  }

  it("rejects messages with no recognized prefix", () => {
    expect(() => validateCommitMessage("feat: add foo")).toThrow(
      /Invalid commit message prefix/,
    );
  });

  it("rejects messages that are only a prefix (too short)", () => {
    expect(() => validateCommitMessage("[ingest]")).toThrow(/too short/);
  });
});

describe("GitRepo — createRepo + writeAndCommit + headSha", () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = await fs.mkdtemp(path.join(os.tmpdir(), "jarvis-wiki-git-"));
  });

  afterEach(async () => {
    await fs.rm(workDir, { recursive: true, force: true });
  });

  it("initializes a repo and resolves HEAD after the bootstrap commit", async () => {
    const repo = new GitRepo(workDir);
    await repo.createRepo("main");
    const sha = await repo.headSha();
    expect(sha).toMatch(/^[0-9a-f]{40}$/);
  });

  it("writes one file, commits, and exposes it via headSha + log", async () => {
    const repo = new GitRepo(workDir);
    await repo.createRepo("main");

    const bootstrapSha = await repo.headSha();

    const commit = await repo.writeAndCommit({
      files: {
        "auto/concepts/휴가-정책.md": "# 휴가 정책\n\n본문\n",
      },
      message: "[ingest] 휴가 정책 — 1 page updated",
      author: defaultBotAuthor(),
    });

    expect(commit.sha).toMatch(/^[0-9a-f]{40}$/);
    expect(commit.sha).not.toBe(bootstrapSha);
    expect(commit.affectedPaths).toEqual(["auto/concepts/휴가-정책.md"]);
    expect(commit.message).toContain("[ingest]");

    const headAfter = await repo.headSha();
    expect(headAfter).toBe(commit.sha);

    const onDisk = await fs.readFile(
      path.join(workDir, "auto/concepts/휴가-정책.md"),
      "utf8",
    );
    expect(onDisk).toBe("# 휴가 정책\n\n본문\n");

    const logEntries = await repo.log(5);
    expect(logEntries.length).toBeGreaterThanOrEqual(1);
    const latest = logEntries[0];
    expect(latest?.sha).toBe(commit.sha);
    expect(latest?.affectedPaths).toContain("auto/concepts/휴가-정책.md");
  });

  it("rejects commits with invalid prefix before writing", async () => {
    const repo = new GitRepo(workDir);
    await repo.createRepo("main");

    await expect(
      repo.writeAndCommit({
        files: { "x.md": "x" },
        message: "chore: bad prefix for wiki commit",
        author: defaultBotAuthor(),
      }),
    ).rejects.toThrow(/Invalid commit message prefix/);
  });

  it("reads historical content via readBlob(ref, path)", async () => {
    const repo = new GitRepo(workDir);
    await repo.createRepo("main");

    const first = await repo.writeAndCommit({
      files: { "note.md": "old body\n" },
      message: "[manual] seed note",
      author: defaultBotAuthor(),
    });
    await repo.writeAndCommit({
      files: { "note.md": "new body\n" },
      message: "[manual] update note",
      author: defaultBotAuthor(),
    });

    const historical = await repo.readBlob(first.sha, "note.md");
    expect(historical.trim()).toBe("old body");
  });

  it("writes multiple files in one commit", async () => {
    const repo = new GitRepo(workDir);
    await repo.createRepo("main");

    const commit = await repo.writeAndCommit({
      files: {
        "auto/entities/Jarvis.md": "Jarvis entity\n",
        "auto/concepts/wiki-fs.md": "wiki-fs concept\n",
      },
      message: "[ingest] batch — 2 pages updated",
      author: defaultBotAuthor(),
    });

    expect(commit.affectedPaths).toHaveLength(2);
    expect(
      await fs.readFile(
        path.join(workDir, "auto/entities/Jarvis.md"),
        "utf8",
      ),
    ).toBe("Jarvis entity\n");
  });
});
