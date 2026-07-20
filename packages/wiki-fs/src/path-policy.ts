import { lstat, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

import type { WikiActor } from "./types.js";

const PATHSPEC_META = /[*?\[\]:@{}!]/;
const CONTROL = /[\u0000-\u001f\u007f]/;
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

export function normalizeRepoRelativePath(value: string): string {
  const normalized = value.normalize("NFC");
  if (normalized !== value) throw new Error("path must already be NFC-normalized");
  if (!normalized || normalized.includes("\0") || normalized.includes("\\")) {
    throw new Error("invalid repo-relative path");
  }
  if (normalized.startsWith("/") || normalized.startsWith("//") || /^[A-Za-z]:/.test(normalized)) {
    throw new Error("absolute path denied");
  }

  const segments = normalized.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error("dot segment denied");
  }
  if (segments.some((segment) => segment.toLowerCase() === ".git")) {
    throw new Error(".git path denied");
  }
  if (segments.some((segment) => PATHSPEC_META.test(segment))) {
    throw new Error("git pathspec denied");
  }
  if (segments.some((segment) => CONTROL.test(segment))) {
    throw new Error("control character denied");
  }
  if (segments.some((segment) => segment.endsWith(".") || segment.endsWith(" ") || WINDOWS_RESERVED.test(segment))) {
    throw new Error("platform-reserved path denied");
  }
  return segments.join("/");
}

export async function resolveContainedPath(
  root: string,
  value: string,
  options: { allowMissing?: boolean } = {},
): Promise<string> {
  const normalized = normalizeRepoRelativePath(value);
  const rootReal = await realpath(resolve(root));
  const candidate = resolve(rootReal, ...normalized.split("/"));
  const relativePath = relative(rootReal, candidate);
  if (
    relativePath === "" ||
    relativePath === ".." ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    throw new Error("path escapes repository root");
  }

  let cursor = rootReal;
  for (const segment of normalized.split("/")) {
    cursor = resolve(cursor, segment);
    try {
      const stat = await lstat(cursor);
      if (stat.isSymbolicLink()) throw new Error("symlink or junction denied");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT" && options.allowMissing) continue;
      throw error;
    }
  }
  return candidate;
}

export function isProjectableWikiPath(value: string): boolean {
  try {
    const normalized = normalizeRepoRelativePath(value);
    const segments = normalized.split("/");
    return (
      (segments[0] === "auto" || segments[0] === "manual") &&
      segments.length >= 2 &&
      segments.at(-1) !== ".md" &&
      normalized.endsWith(".md")
    );
  } catch {
    return false;
  }
}

export function assertWritableWikiPath(actor: WikiActor, value: string): string {
  const normalized = normalizeRepoRelativePath(value);
  if (normalized.startsWith("_archive/")) throw new Error("archive path is read-only");
  const allowed =
    (actor === "agent" && normalized.startsWith("auto/")) ||
    (actor === "human" && normalized.startsWith("manual/")) ||
    (actor === "system" &&
      (normalized.startsWith("auto/") ||
        normalized.startsWith("_system/") ||
        normalized === "index.md" ||
        normalized === "log.md"));
  if (!allowed) {
    const allowedRoot =
      actor === "agent" ? "auto/" : actor === "human" ? "manual/" : "auto/, _system/, index.md, or log.md";
    throw new Error(`actor ${actor} cannot write ${normalized}; allowed: ${allowedRoot}`);
  }
  return normalized;
}
