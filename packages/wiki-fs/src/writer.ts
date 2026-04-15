/**
 * Atomic file writer for wiki pages.
 *
 * Strategy: write-to-sibling then rename. Followed precisely because the
 * reference_only Tauri implementation (`src-tauri/src/commands/fs.rs`
 * `write_file`) does a non-atomic write, which was a known-bad source of
 * partial-page corruption when the process crashed mid-write.
 *
 *   1. Ensure parent directory exists (recursive).
 *   2. Write payload to `{path}.tmp-{pid}-{rand}`.
 *   3. `fsync` the tmp file so the bytes hit disk before the rename.
 *   4. `rename` tmp → final (POSIX rename = atomic per-filesystem; on
 *      Windows, `fs.rename` also uses MoveFileEx under the hood which is
 *      atomic within a single volume, which is our case).
 *   5. Best-effort `fsync` of the parent directory on POSIX to persist
 *      the rename metadata. No-op on Windows (open dir handles aren't
 *      supported) — caught and swallowed.
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

import type { WriteOptions } from "./types.js";

/**
 * Atomically write `content` to `filePath`. Creates parent directories as
 * needed. Throws if the final rename fails — the tmp file is removed on
 * error.
 */
export async function atomicWrite(
  filePath: string,
  content: string | Uint8Array,
  options: WriteOptions = {},
): Promise<void> {
  const { mode = 0o644, encoding = "utf8" } = options;
  const absolute = path.resolve(filePath);
  const parent = path.dirname(absolute);

  await fs.mkdir(parent, { recursive: true });

  const tmpPath = makeTmpPath(absolute);
  let handle: Awaited<ReturnType<typeof fs.open>> | null = null;
  try {
    handle = await fs.open(tmpPath, "w", mode);
    if (typeof content === "string") {
      await handle.writeFile(content, { encoding });
    } else {
      await handle.writeFile(content);
    }
    // fsync so rename sees fully-flushed bytes on power loss.
    await handle.sync();
    await handle.close();
    handle = null;

    await fs.rename(tmpPath, absolute);
    await tryFsyncDir(parent);
  } catch (err) {
    // Clean up tmp file so repeat calls don't pile up debris.
    if (handle) {
      await handle.close().catch(() => undefined);
    }
    await fs.rm(tmpPath, { force: true }).catch(() => undefined);
    throw err;
  }
}

/**
 * Read a file as UTF-8 string. Wraps `fs.readFile` to normalize EOLs —
 * some ingested manual pages arrive with `\r\n` line endings on Windows
 * which breaks frontmatter detection otherwise.
 */
export async function readUtf8(filePath: string): Promise<string> {
  const raw = await fs.readFile(filePath, "utf8");
  return raw.replace(/\r\n/g, "\n");
}

/**
 * Check whether a file or directory exists. Returns `false` for any
 * `ENOENT`; rethrows other errors so permission issues aren't silently
 * swallowed.
 */
export async function exists(targetPath: string): Promise<boolean> {
  try {
    await fs.stat(targetPath);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw err;
  }
}

// ── internals ──────────────────────────────────────────────────────────

function makeTmpPath(absolute: string): string {
  const pid = process.pid;
  const rand = Math.random().toString(36).slice(2, 10);
  return `${absolute}.tmp-${pid}-${rand}`;
}

async function tryFsyncDir(dirPath: string): Promise<void> {
  if (os.platform() === "win32") return; // Directory fsync not supported.
  try {
    const handle = await fs.open(dirPath, "r");
    await handle.sync();
    await handle.close();
  } catch {
    // Best-effort only — a failed directory fsync is not a write failure.
  }
}
