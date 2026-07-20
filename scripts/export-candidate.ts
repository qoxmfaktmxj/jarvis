import { lstat, mkdir, readdir } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { assertSafeRelativePath, ensureParentDirectory, pathExists, readJsonFile, resolveInside } from "./fs-utils.js";

export interface ExportCandidateOptions {
  sourceRoot?: string;
  targetRoot: string;
  allowlistPath?: string;
}

export interface ExportCandidateResult {
  copiedRoots: string[];
}

const GENERATED_DENY_NAMES = new Set([
  ".git",
  "node_modules",
  ".next",
  ".next-e2e",
  "dist",
  "coverage",
  "test-results",
  "playwright-report",
  ".turbo",
  ".vite",
  "artifacts",
  ".runtime",
  ".env.local",
]);

function isNestedPath(parent: string, candidate: string): boolean {
  const rel = relative(parent, candidate);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function ensureRootsDoNotOverlap(sourceRoot: string, targetRoot: string): void {
  if (isNestedPath(sourceRoot, targetRoot) || isNestedPath(targetRoot, sourceRoot)) {
    throw new Error("sourceRoot and targetRoot must not overlap or nest");
  }
}

async function assertEmptyTarget(targetRoot: string): Promise<void> {
  if (!(await pathExists(targetRoot))) {
    await mkdir(targetRoot, { recursive: true });
    return;
  }
  const stats = await lstat(targetRoot);
  if (stats.isSymbolicLink()) {
    throw new Error("targetRoot symlink is not allowed");
  }
  if (!stats.isDirectory()) {
    throw new Error("targetRoot must be a directory");
  }
  const entries = await readdir(targetRoot);
  if (entries.length > 0) {
    throw new Error("targetRoot must be empty");
  }
}

function normalizeAllowlist(raw: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const entry of raw) {
    const safe = assertSafeRelativePath(entry);
    if (seen.has(safe)) {
      continue;
    }
    seen.add(safe);
    normalized.push(safe);
  }
  return normalized;
}

async function copyPublicEntry(sourcePath: string, targetPath: string): Promise<void> {
  const stats = await lstat(sourcePath);
  if (stats.isSymbolicLink()) {
    throw new Error(`symlink denied: ${sourcePath}`);
  }
  if (GENERATED_DENY_NAMES.has(basename(sourcePath))) {
    throw new Error(`generated path denied: ${sourcePath}`);
  }
  if (stats.isDirectory()) {
    await mkdir(targetPath, { recursive: true });
    const entries = await readdir(sourcePath, { withFileTypes: true });
    for (const entry of entries) {
      if (GENERATED_DENY_NAMES.has(entry.name)) {
        continue;
      }
      await copyPublicEntry(join(sourcePath, entry.name), join(targetPath, entry.name));
    }
    return;
  }
  if (!stats.isFile()) {
    throw new Error(`special file denied: ${sourcePath}`);
  }
  await ensureParentDirectory(targetPath);
  const { copyFile } = await import("node:fs/promises");
  await copyFile(sourcePath, targetPath);
}

async function assertPublicEntrySafe(sourcePath: string): Promise<void> {
  const stats = await lstat(sourcePath);
  if (stats.isSymbolicLink()) throw new Error(`symlink denied: ${sourcePath}`);
  if (GENERATED_DENY_NAMES.has(basename(sourcePath))) {
    throw new Error(`generated path denied: ${sourcePath}`);
  }
  if (stats.isFile()) return;
  if (!stats.isDirectory()) throw new Error(`special file denied: ${sourcePath}`);
  const entries = await readdir(sourcePath, { withFileTypes: true });
  for (const entry of entries) {
    if (GENERATED_DENY_NAMES.has(entry.name)) continue;
    await assertPublicEntrySafe(join(sourcePath, entry.name));
  }
}

export async function exportCandidate({
  sourceRoot = process.cwd(),
  targetRoot,
  allowlistPath,
}: ExportCandidateOptions): Promise<ExportCandidateResult> {
  const absoluteSourceRoot = resolve(sourceRoot);
  const absoluteTargetRoot = resolve(targetRoot);
  ensureRootsDoNotOverlap(absoluteSourceRoot, absoluteTargetRoot);
  const resolvedAllowlistPath = allowlistPath ?? join(absoluteSourceRoot, "config", "public-export-allowlist.json");
  const allowlist = normalizeAllowlist(await readJsonFile<string[]>(resolvedAllowlistPath));
  const entries = allowlist.map((entry) => ({
    entry,
    sourcePath: resolveInside(absoluteSourceRoot, entry),
  }));
  for (const item of entries) {
    if (!(await pathExists(item.sourcePath))) {
      throw new Error(`allowlisted path is missing: ${item.entry}`);
    }
    await assertPublicEntrySafe(item.sourcePath);
  }
  await assertEmptyTarget(absoluteTargetRoot);

  const copiedRoots: string[] = [];
  for (const item of entries) {
    const targetPath = join(absoluteTargetRoot, item.entry);
    await copyPublicEntry(item.sourcePath, targetPath);
    copiedRoots.push(item.entry);
  }
  return { copiedRoots };
}

function parseTargetArg(argv: string[]): string {
  const index = argv.indexOf("--target");
  const target = index === -1 ? undefined : argv[index + 1];
  if (!target) {
    throw new Error("--target is required");
  }
  return target;
}

export async function main(): Promise<void> {
  await exportCandidate({ targetRoot: parseTargetArg(process.argv) });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : "export-candidate failed");
    process.exitCode = 1;
  });
}
