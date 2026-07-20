import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readPage } from "../reader.js";
import { atomicWrite, readUtf8, writePage } from "../writer.js";

describe("contained atomic wiki writes", () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(join(tmpdir(), "jarvis-wiki-writer-"));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("writes atomically, creates parents, and normalizes CRLF", async () => {
    await writePage(root, "human", "manual/concepts/leave.md", "line 1\r\nline 2\r\n");
    await expect(readPage(root, "manual/concepts/leave.md")).resolves.toBe("line 1\nline 2\n");
    expect(await fs.readdir(join(root, "manual", "concepts"))).toEqual(["leave.md"]);
  });

  it("does not expose arbitrary actor paths", async () => {
    await expect(writePage(root, "agent", "manual/a.md", "x")).rejects.toThrow(/agent/i);
    await expect(writePage(root, "human", "../escape.md", "x")).rejects.toThrow();
  });

  it("supports byte writes internally without leaving temporary files", async () => {
    const target = join(root, "payload.bin");
    await atomicWrite(target, new Uint8Array([0x68, 0x69]));
    expect(await fs.readFile(target)).toEqual(Buffer.from("hi"));
    expect((await fs.readdir(root)).filter((name) => name.includes(".tmp-"))).toEqual([]);
  });

  it("normalizes direct UTF-8 reads", async () => {
    const target = join(root, "crlf.md");
    await fs.writeFile(target, "a\r\nb\r\n", "utf8");
    await expect(readUtf8(target)).resolves.toBe("a\nb\n");
  });
});
