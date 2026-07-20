import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { assertWritableWikiPath, resolveContainedPath } from "./path-policy.js";
import type { WikiActor, WriteOptions } from "./types.js";

export async function atomicWrite(
  filePath: string,
  content: string | Uint8Array,
  options: WriteOptions = {},
): Promise<void> {
  const { mode = 0o644, encoding = "utf8" } = options;
  const absolute = path.resolve(filePath);
  const parent = path.dirname(absolute);
  await fs.mkdir(parent, { recursive: true });
  const temporaryPath = `${absolute}.tmp-${process.pid}-${Math.random().toString(36).slice(2, 10)}`;
  let handle: Awaited<ReturnType<typeof fs.open>> | null = null;
  try {
    handle = await fs.open(temporaryPath, "wx", mode);
    if (typeof content === "string") await handle.writeFile(content, { encoding });
    else await handle.writeFile(content);
    await handle.sync();
    await handle.close();
    handle = null;
    await fs.rename(temporaryPath, absolute);
    await tryFsyncDirectory(parent);
  } catch (error) {
    if (handle) await handle.close().catch(() => undefined);
    await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function readUtf8(filePath: string): Promise<string> {
  return (await fs.readFile(filePath, "utf8")).replace(/\r\n/g, "\n");
}

export async function writePage(
  repoRoot: string,
  actor: WikiActor,
  repoRelativePath: string,
  content: string,
): Promise<void> {
  const writablePath = assertWritableWikiPath(actor, repoRelativePath);
  const absolute = await resolveContainedPath(repoRoot, writablePath, { allowMissing: true });
  await atomicWrite(absolute, content.replace(/\r\n/g, "\n"));
}

async function tryFsyncDirectory(directory: string): Promise<void> {
  if (os.platform() === "win32") return;
  try {
    const handle = await fs.open(directory, "r");
    await handle.sync();
    await handle.close();
  } catch {
    // Directory fsync is best effort; the file fsync and rename already completed.
  }
}
