import { copyFile, lstat, mkdir, readdir, readFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

export interface CopyTreeOptions {
  rejectOverwrite?: boolean;
  rejectSpecialFiles?: boolean;
  rejectSymlinks?: boolean;
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}

export function assertSafeRelativePath(input: string): string {
  const normalized = input.replaceAll("\\", "/").trim();
  if (!normalized || isAbsolute(normalized)) {
    throw new Error("absolute paths are not allowed");
  }
  const parts = normalized.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) {
    throw new Error("path escape is not allowed");
  }
  return normalized;
}

export function resolveInside(root: string, relativePath: string): string {
  const safeRelative = assertSafeRelativePath(relativePath);
  const resolvedRoot = resolve(root);
  const resolvedPath = resolve(resolvedRoot, safeRelative);
  const relativeToRoot = relative(resolvedRoot, resolvedPath);
  if (relativeToRoot.startsWith("..") || isAbsolute(relativeToRoot)) {
    throw new Error("path escape is not allowed");
  }
  return resolvedPath;
}

export async function assertFileIsRegular(path: string, label = basename(path)): Promise<void> {
  const stats = await lstat(path);
  if (stats.isSymbolicLink()) {
    throw new Error(`${label} is a symlink`);
  }
  if (!stats.isFile()) {
    throw new Error(`${label} must be a regular file`);
  }
}

export async function assertDirectoryIsNotSymlink(path: string, label = basename(path)): Promise<void> {
  const stats = await lstat(path);
  if (stats.isSymbolicLink()) {
    throw new Error(`${label} is a symlink`);
  }
  if (!stats.isDirectory()) {
    throw new Error(`${label} must be a directory`);
  }
}

export async function ensureParentDirectory(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
}

export async function assertEmptyDirectory(path: string): Promise<void> {
  if (!(await pathExists(path))) {
    await mkdir(path, { recursive: true });
    return;
  }
  await assertDirectoryIsNotSymlink(path, basename(path));
  const entries = await readdir(path);
  if (entries.length > 0) {
    throw new Error("target directory is non-empty");
  }
}

export async function readJsonFile<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

export async function copyTreeChecked(
  sourceRoot: string,
  targetRoot: string,
  options: CopyTreeOptions = {},
): Promise<void> {
  const sourceStats = await lstat(sourceRoot);
  if (sourceStats.isSymbolicLink() && options.rejectSymlinks) {
    throw new Error(`symlink denied: ${sourceRoot}`);
  }
  if (!sourceStats.isDirectory() && !sourceStats.isFile()) {
    throw new Error(`source root must be a regular file or directory: ${sourceRoot}`);
  }

  async function walk(currentSource: string, currentTarget: string): Promise<void> {
    const sourceEntryStats = await lstat(currentSource);
    if (sourceEntryStats.isSymbolicLink() && options.rejectSymlinks) {
      throw new Error(`symlink denied: ${currentSource}`);
    }
    if (sourceEntryStats.isDirectory()) {
      await mkdir(currentTarget, { recursive: true });
      const entries = await readdir(currentSource, { withFileTypes: true });
      for (const entry of entries) {
        const nextSource = join(currentSource, entry.name);
        const nextTarget = join(currentTarget, entry.name);
        if (entry.isSymbolicLink() && options.rejectSymlinks) {
          throw new Error(`symlink denied: ${nextSource}`);
        }
        if (entry.isDirectory()) {
          await walk(nextSource, nextTarget);
          continue;
        }
        if (!entry.isFile()) {
          if (options.rejectSpecialFiles ?? true) {
            throw new Error(`special file denied: ${nextSource}`);
          }
          continue;
        }
        if (options.rejectOverwrite && (await pathExists(nextTarget))) {
          throw new Error(`overwrite denied: ${nextTarget}`);
        }
        await ensureParentDirectory(nextTarget);
        await copyFile(nextSource, nextTarget);
      }
      return;
    }
    if (!sourceEntryStats.isFile()) {
      throw new Error(`special file denied: ${currentSource}`);
    }
    if (options.rejectOverwrite && (await pathExists(currentTarget))) {
      throw new Error(`overwrite denied: ${currentTarget}`);
    }
    await ensureParentDirectory(currentTarget);
    await copyFile(currentSource, currentTarget);
  }

  await walk(sourceRoot, targetRoot);
}
