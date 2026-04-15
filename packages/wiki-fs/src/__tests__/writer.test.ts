import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { atomicWrite, exists, readUtf8 } from "../writer.js";

describe("atomicWrite", () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = await fs.mkdtemp(path.join(os.tmpdir(), "jarvis-wiki-writer-"));
  });

  afterEach(async () => {
    await fs.rm(workDir, { recursive: true, force: true });
  });

  it("writes file content and creates parent directories", async () => {
    const target = path.join(workDir, "nested", "deep", "page.md");
    await atomicWrite(target, "hello 세계\n");
    const content = await readUtf8(target);
    expect(content).toBe("hello 세계\n");
  });

  it("does not leave tmp files after success", async () => {
    const target = path.join(workDir, "a.md");
    await atomicWrite(target, "body");
    const parent = await fs.readdir(workDir);
    expect(parent).toEqual(["a.md"]);
  });

  it("cleans up tmp file when write fails (invalid dir)", async () => {
    // Construct a path that cannot be created — passing a null byte makes
    // mkdir reject before any tmp file is created, which also validates
    // our cleanup path stays quiet in the error case.
    const badTarget = path.join(workDir, "sub\x00", "x.md");
    await expect(atomicWrite(badTarget, "x")).rejects.toThrow();
    // Workdir still holds nothing because we never reached write.
    const entries = await fs.readdir(workDir);
    expect(entries.filter((n) => n.includes(".tmp-"))).toEqual([]);
  });

  it("invokes fsync on the tmp file handle (rename-safe write)", async () => {
    // Spy on FileHandle.sync to assert fsync() is being called before
    // the rename step. We do this by wrapping `fs.open`.
    const realOpen = fs.open.bind(fs);
    const syncSpy = vi.fn(async () => undefined);
    const openSpy = vi.spyOn(fs, "open").mockImplementation(async (...args) => {
      // @ts-expect-error — forwarding positional args to the real fn.
      const handle = await realOpen(...args);
      const originalSync = handle.sync.bind(handle);
      handle.sync = async () => {
        await syncSpy();
        return originalSync();
      };
      return handle;
    });

    try {
      const target = path.join(workDir, "synced.md");
      await atomicWrite(target, "durable 데이터\n");
      expect(syncSpy).toHaveBeenCalled();
      expect(await readUtf8(target)).toBe("durable 데이터\n");
    } finally {
      openSpy.mockRestore();
    }
  });

  it("overwrites existing files atomically", async () => {
    const target = path.join(workDir, "over.md");
    await atomicWrite(target, "first\n");
    await atomicWrite(target, "second\n");
    expect(await readUtf8(target)).toBe("second\n");
  });

  it("writes Uint8Array payloads", async () => {
    const target = path.join(workDir, "bin.bin");
    const bytes = new Uint8Array([0x68, 0x69]); // 'hi'
    await atomicWrite(target, bytes);
    const content = await fs.readFile(target);
    expect(content.equals(Buffer.from([0x68, 0x69]))).toBe(true);
  });
});

describe("exists", () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = await fs.mkdtemp(path.join(os.tmpdir(), "jarvis-wiki-exists-"));
  });
  afterEach(async () => {
    await fs.rm(workDir, { recursive: true, force: true });
  });

  it("returns false for missing file", async () => {
    expect(await exists(path.join(workDir, "nope"))).toBe(false);
  });

  it("returns true for existing directory", async () => {
    expect(await exists(workDir)).toBe(true);
  });

  it("returns true for existing file", async () => {
    const target = path.join(workDir, "f.md");
    await atomicWrite(target, "x");
    expect(await exists(target)).toBe(true);
  });
});

describe("readUtf8", () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = await fs.mkdtemp(path.join(os.tmpdir(), "jarvis-wiki-read-"));
  });
  afterEach(async () => {
    await fs.rm(workDir, { recursive: true, force: true });
  });

  it("normalizes CRLF to LF", async () => {
    const target = path.join(workDir, "crlf.md");
    await fs.writeFile(target, "line1\r\nline2\r\n");
    expect(await readUtf8(target)).toBe("line1\nline2\n");
  });
});
