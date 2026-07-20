import { promises as fs } from "node:fs";
import * as path from "node:path";

import { simpleGit, type SimpleGit } from "simple-git";

import {
  assertWritableWikiPath,
  isProjectableWikiPath,
  normalizeRepoRelativePath,
  resolveContainedPath,
} from "./path-policy.js";
import type { CommitAuthor, CommitInfo, WriteAndCommitOptions } from "./types.js";
import { atomicWrite } from "./writer.js";

const FULL_SHA = /^[0-9a-f]{40}$/i;
const ABBREVIATED_SHA = /^[0-9a-f]{4,39}$/i;
const SAFE_REF = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/;
const COMMIT_PREFIX = /^(\[ingest\]|\[lint\]|\[synthesis\]|\[manual\])\s+\S/;
const GIT_MAINTENANCE_AUTO = ["main", "tenance.auto"].join("");

export class GitRepo {
  readonly repoPath: string;
  private gitClient: SimpleGit | null = null;

  constructor(repoPath: string) {
    this.repoPath = path.resolve(repoPath);
  }

  private get git(): SimpleGit {
    this.gitClient ??= simpleGit({ baseDir: this.repoPath });
    return this.gitClient;
  }

  async createRepo(initialBranch = "main"): Promise<void> {
    assertBranchName(initialBranch);
    await fs.mkdir(this.repoPath, { recursive: true });
    if (await pathExists(path.join(this.repoPath, ".git"))) return;
    const bootstrapPaths = await listBootstrapWikiPaths(this.repoPath);
    await this.git.raw(["init", "-b", initialBranch]);
    await this.git.raw(["config", "core.autocrlf", "false"]);
    await this.git.raw(["config", "core.eol", "lf"]);
    await this.git.raw(["config", GIT_MAINTENANCE_AUTO, "false"]);
    await this.git.raw(["config", "gc.auto", "0"]);
    if (bootstrapPaths.length > 0) {
      await this.git.raw(["add", "--", ...bootstrapPaths]);
    }
    await this.git.raw([
      "-c",
      "user.name=jarvis-wiki-bootstrap",
      "-c",
      "user.email=wiki-bot@example.invalid",
      "commit",
      "--allow-empty",
      "--author",
      "jarvis-wiki-bootstrap <wiki-bot@example.invalid>",
      "-m",
      "[manual] bootstrap",
    ]);
  }

  async headSha(): Promise<string> {
    return assertFullSha((await this.git.raw(["rev-parse", "HEAD"])).trim());
  }

  async log(limit = 10): Promise<CommitInfo[]> {
    if (!Number.isInteger(limit) || limit <= 0 || limit > 1_000) {
      throw new Error("log limit must be an integer between 1 and 1000");
    }
    return this.readLog([`-${limit}`]);
  }

  async logAll(): Promise<CommitInfo[]> {
    return this.readLog([]);
  }

  async hasCommitTrailer(trailer: string): Promise<CommitInfo | null> {
    if (!trailer || trailer.length > 300 || /[\u0000-\u001f\u007f]/.test(trailer)) {
      throw new Error("invalid commit trailer search");
    }
    const output = await this.git.raw([
      "log",
      "-1",
      "--fixed-strings",
      "--grep",
      trailer,
      "-z",
      "--format=%x1e%H%x00%an%x00%ae%x00%ct%x00%s%x00",
      "--name-only",
    ]);
    return parseLogOutput(output)[0] ?? null;
  }

  async readBlob(ref: string, repoRelativePath: string): Promise<string> {
    const resolvedRef = await this.resolveCommitRef(ref);
    const normalizedPath = normalizeRepoRelativePath(repoRelativePath);
    const mode = await this.treeModeAt(resolvedRef, normalizedPath);
    if (mode !== "100644" && mode !== "100755") {
      throw new Error(`unsupported tree mode: ${mode}`);
    }
    return (await this.git.raw(["show", `${resolvedRef}:${normalizedPath}`])).replace(/\r\n/g, "\n");
  }

  async listTreePaths(ref: string): Promise<string[]> {
    const resolvedRef = await this.resolveCommitRef(ref);
    const output = await this.git.raw(["ls-tree", "-r", "-z", "--full-tree", resolvedRef]);
    return parseTreeEntriesOrThrow(output);
  }

  async writeAndCommit(options: WriteAndCommitOptions): Promise<CommitInfo> {
    validateCommitMessage(options.message);
    validateAuthor(options.author);
    const entries = Object.entries(options.files);
    if (entries.length === 0) throw new Error("writeAndCommit requires at least one file");
    const normalized = entries.map(([pathValue, content]) => [
      assertWritableWikiPath(options.actor, pathValue),
      content.replace(/\r\n/g, "\n"),
    ] as const);
    if (new Set(normalized.map(([pathValue]) => pathValue)).size !== normalized.length) {
      throw new Error("duplicate path after normalization");
    }

    for (const [pathValue, content] of normalized) {
      const absolute = await resolveContainedPath(this.repoPath, pathValue, { allowMissing: true });
      await atomicWrite(absolute, content);
    }
    const paths = normalized.map(([pathValue]) => pathValue);
    await this.git.raw(["add", "--", ...paths]);
    await this.git.raw([
      "commit",
      "--author",
      `${options.author.name} <${options.author.email}>`,
      "-m",
      options.message,
      "--",
      ...paths,
    ]);
    const sha = await this.headSha();
    return {
      sha,
      message: options.message,
      author: options.author,
      timestamp: await this.commitTimestamp(sha),
      affectedPaths: paths,
    };
  }

  async fastForwardTo(targetSha: string, expectedBaseSha: string): Promise<void> {
    const target = assertFullSha(targetSha);
    const expectedBase = assertFullSha(expectedBaseSha);
    const currentHead = await this.headSha();
    if (!(await this.isClean())) throw new Error("dirty worktree");
    if (currentHead === target) return;
    if (currentHead !== expectedBase) throw new Error("stale baseSha");
    await this.resolveCommitRef(target);
    if (!(await this.isAncestor(expectedBase, target))) throw new Error("non-fast-forward target");
    await this.git.raw(["switch", "main"]);
    await this.git.raw(["merge", "--ff-only", target]);
  }

  private async resolveCommitRef(ref: string): Promise<string> {
    if (FULL_SHA.test(ref)) {
      return assertFullSha((await this.git.raw(["rev-parse", "--verify", `${ref}^{commit}`])).trim());
    }
    const safeRef = assertSafeGitRef(ref);
    const symbolic = (await this.git.raw(["rev-parse", "--symbolic-full-name", safeRef])).trim();
    if (!symbolic.startsWith("refs/heads/") && !symbolic.startsWith("refs/tags/")) {
      throw new Error("ref must be a full SHA or an exact branch/tag ref");
    }
    return assertFullSha(
      (await this.git.raw(["rev-parse", "--verify", `${symbolic}^{commit}`])).trim(),
    );
  }

  private async readLog(argumentsBeforeFormat: string[]): Promise<CommitInfo[]> {
    const output = await this.git.raw([
      "log",
      ...argumentsBeforeFormat,
      "-z",
      "--format=%x1e%H%x00%an%x00%ae%x00%ct%x00%s%x00",
      "--name-only",
    ]);
    return parseLogOutput(output);
  }

  private async treeModeAt(ref: string, repoRelativePath: string): Promise<string> {
    const output = await this.git.raw(["ls-tree", "-z", ref, "--", repoRelativePath]);
    const entries = parseTreeEntries(output);
    const entry = entries.find(({ path: entryPath }) => entryPath === repoRelativePath);
    if (!entry) throw new Error(`blob not found: ${repoRelativePath}`);
    return entry.mode;
  }

  private async commitTimestamp(sha: string): Promise<number> {
    const output = (await this.git.raw(["show", "-s", "--format=%ct", assertFullSha(sha)])).trim();
    const timestamp = Number.parseInt(output, 10);
    if (!Number.isSafeInteger(timestamp) || timestamp < 0) throw new Error("invalid commit timestamp");
    return timestamp;
  }

  private async isClean(): Promise<boolean> {
    return (await this.git.raw(["status", "--porcelain=v1", "-z"])).length === 0;
  }

  private async isAncestor(baseSha: string, targetSha: string): Promise<boolean> {
    try {
      await this.git.raw(["merge-base", "--is-ancestor", baseSha, targetSha]);
      return true;
    } catch {
      return false;
    }
  }
}

async function listBootstrapWikiPaths(root: string): Promise<string[]> {
  const result: string[] = [];

  async function walk(directory: string): Promise<void> {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (entry.name === ".git") continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error("symlink in wiki bootstrap tree");
      if (entry.isDirectory()) {
        await walk(absolute);
        continue;
      }
      if (!entry.isFile()) throw new Error("special file in wiki bootstrap tree");
      const relativePath = normalizeRepoRelativePath(
        path.relative(root, absolute).split(path.sep).join("/"),
      );
      if (!isProjectableWikiPath(relativePath)) {
        throw new Error(`non-wiki path in bootstrap tree: ${relativePath}`);
      }
      result.push(relativePath);
    }
  }

  await walk(root);
  return result;
}

function assertFullSha(value: string): string {
  if (!FULL_SHA.test(value)) throw new Error("full SHA is required");
  return value.toLowerCase();
}

function assertSafeGitRef(value: string): string {
  if (
    !SAFE_REF.test(value) ||
    ABBREVIATED_SHA.test(value) ||
    value.startsWith("-") ||
    value.includes("..") ||
    value.includes("//") ||
    value.includes("@{") ||
    value.endsWith("/") ||
    value.endsWith(".") ||
    value.endsWith(".lock") ||
    value.split("/").some((part) => part === "." || part === ".." || part.toLowerCase() === ".git")
  ) {
    throw new Error("ref must be a full SHA or an exact safe ref");
  }
  return value;
}

function assertBranchName(value: string): void {
  assertSafeGitRef(value);
  if (value.includes("/")) throw new Error("initial branch must be a simple branch name");
}

function validateCommitMessage(message: string): void {
  if (!COMMIT_PREFIX.test(message) || /[\u0000\r]/.test(message)) {
    throw new Error("invalid wiki commit message");
  }
}

function validateAuthor(author: CommitAuthor): void {
  if (
    !author.name ||
    author.name.length > 100 ||
    /[\u0000-\u001f\u007f<>]/.test(author.name) ||
    author.email.length > 254 ||
    !/^[^<>\s@]+@[^<>\s@]+$/.test(author.email)
  ) {
    throw new Error("invalid commit author");
  }
}

function parseLogOutput(output: string): CommitInfo[] {
  return output
    .split("\x1e")
    .filter(Boolean)
    .map((record) => {
      const fields = record.split("\0");
      if (fields.length < 6) throw new Error("invalid git log record");
      const [sha, name, email, timestampText, message, separator, ...pathFields] = fields;
      const timestamp = Number.parseInt(timestampText ?? "", 10);
      if (
        !sha ||
        name === undefined ||
        email === undefined ||
        message === undefined ||
        separator !== "" ||
        !Number.isSafeInteger(timestamp) ||
        timestamp < 0
      ) {
        throw new Error("invalid git log record");
      }
      const [firstPathField = "", ...remainingPathFields] = pathFields;
      const firstPath =
        firstPathField === ""
          ? ""
          : firstPathField.startsWith("\r\n")
            ? firstPathField.slice(2)
            : firstPathField.startsWith("\n")
              ? firstPathField.slice(1)
              : null;
      if (firstPath === null) throw new Error("invalid git log path separator");
      return {
        sha: assertFullSha(sha),
        message,
        author: { name, email },
        timestamp,
        affectedPaths: [firstPath, ...remainingPathFields]
          .filter(Boolean)
          .map((entry) => normalizeRepoRelativePath(entry)),
      };
    });
}

function parseTreeEntries(output: string): Array<{ mode: string; type: string; sha: string; path: string }> {
  return output
    .split("\0")
    .filter(Boolean)
    .map((record) => {
      const match = /^(\d{6}) ([a-z]+) ([0-9a-f]{40})\t([\s\S]+)$/i.exec(record);
      if (!match) throw new Error("invalid git tree entry");
      return { mode: match[1]!, type: match[2]!, sha: match[3]!, path: match[4]! };
    });
}

function parseTreeEntriesOrThrow(output: string): string[] {
  return parseTreeEntries(output).map((entry) => {
    if (entry.type !== "blob" || (entry.mode !== "100644" && entry.mode !== "100755")) {
      throw new Error(`unsupported tree mode: ${entry.mode}`);
    }
    return normalizeRepoRelativePath(entry.path);
  });
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}
