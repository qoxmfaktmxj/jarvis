import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  assertWritableWikiPath,
  isProjectableWikiPath,
  normalizeRepoRelativePath,
  resolveContainedPath,
} from "../path-policy.js";

const cleanup: string[] = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((path) => fs.rm(path, { recursive: true, force: true })));
});

describe("path policy", () => {
  it("allows only normalized repo-relative wiki paths", () => {
    expect(normalizeRepoRelativePath("auto/concepts/휴가-정책.md")).toBe("auto/concepts/휴가-정책.md");
    expect(isProjectableWikiPath("auto/concepts/휴가-정책.md")).toBe(true);
    expect(isProjectableWikiPath("manual/index.md")).toBe(true);
    expect(isProjectableWikiPath("_system/index.md")).toBe(false);
    expect(isProjectableWikiPath("index.md")).toBe(false);
    expect(isProjectableWikiPath("log.md")).toBe(false);
  });

  it("enforces the actor matrix", () => {
    expect(assertWritableWikiPath("agent", "auto/concepts/a.md")).toBe("auto/concepts/a.md");
    expect(assertWritableWikiPath("human", "manual/concepts/b.md")).toBe("manual/concepts/b.md");
    expect(assertWritableWikiPath("system", "auto/concepts/c.md")).toBe("auto/concepts/c.md");
    expect(assertWritableWikiPath("system", "_system/index.md")).toBe("_system/index.md");
    expect(assertWritableWikiPath("system", "index.md")).toBe("index.md");
    expect(assertWritableWikiPath("system", "log.md")).toBe("log.md");
    expect(() => assertWritableWikiPath("agent", "_archive/x.md")).toThrow(/archive/i);
    expect(() => assertWritableWikiPath("human", "auto/x.md")).toThrow(/manual/i);
    expect(() => assertWritableWikiPath("system", "_archive/x.md")).toThrow(/archive/i);
  });

  it.each([
    "../secret.md",
    "/abs.md",
    "C:\\temp\\x.md",
    "//server/share/x.md",
    "auto/..",
    "auto/.git/config",
    "auto/.GIT/config",
    "auto/*.md",
    "auto/bad\u0007.md",
    "auto/Cafe\u0301.md",
    "auto/NUL.md",
    "auto/trailing. /x.md",
  ])("rejects %s", (value) => {
    expect(() => normalizeRepoRelativePath(value)).toThrow();
  });

  it("rejects symlink or junction ancestors and permits contained missing paths", async () => {
    const root = await fs.mkdtemp(join(tmpdir(), "jarvis-wiki-path-"));
    cleanup.push(root);
    const realDirectory = join(root, "real");
    await fs.mkdir(realDirectory);
    const link = join(root, "link");
    await fs.symlink(realDirectory, link, process.platform === "win32" ? "junction" : "dir");
    await expect(resolveContainedPath(root, "link/page.md", { allowMissing: true })).rejects.toThrow(/symlink|junction/i);
    await expect(resolveContainedPath(root, "new/nested/page.md", { allowMissing: true })).resolves.toBe(
      join(root, "new", "nested", "page.md"),
    );
  });
});
