import { lstat, readFile, readdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { join, relative } from "node:path";
import {
  assertEmptyDirectory,
  assertFileIsRegular,
  assertSafeRelativePath,
  copyTreeChecked,
  ensureParentDirectory,
  pathExists,
  readJsonFile,
  resolveInside,
} from "./fs-utils.js";

export interface InitWikiOptions {
  samplesRoot: string;
  runtimeRoot: string;
  sourceRevisionIds?: Readonly<Record<string, string>>;
}

const SOURCE_REVISION_PLACEHOLDER = /\{\{sourceRevisionId:([^{}]+)\}\}/g;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function renderTemplates(
  samplesRoot: string,
  sourceRevisionIds: Readonly<Record<string, string>>,
): Promise<Map<string, string>> {
  const rendered = new Map<string, string>();

  async function walk(current: string): Promise<void> {
    const stats = await lstat(current);
    if (stats.isSymbolicLink()) throw new Error(`symlink denied: ${current}`);
    if (stats.isDirectory()) {
      const entries = await readdir(current);
      for (const entry of entries) await walk(join(current, entry));
      return;
    }
    if (!stats.isFile()) throw new Error(`special file denied: ${current}`);
    const relativePath = assertSafeRelativePath(relative(samplesRoot, current));
    if (!relativePath.endsWith(".md")) return;
    const template = await readFile(current, "utf8");
    const content = template.replace(SOURCE_REVISION_PLACEHOLDER, (_match, rawKey: string) => {
      const key = assertSafeRelativePath(rawKey);
      const revisionId = sourceRevisionIds[key];
      if (!revisionId || !UUID.test(revisionId)) {
        throw new Error(`source revision placeholder is not declared: ${key}`);
      }
      return revisionId;
    });
    if (content.includes("{{sourceRevisionId:")) {
      throw new Error(`invalid source revision placeholder: ${relativePath}`);
    }
    rendered.set(relativePath, content);
  }

  await walk(samplesRoot);
  return rendered;
}

export async function initWiki({
  samplesRoot,
  runtimeRoot,
  sourceRevisionIds = {},
}: InitWikiOptions): Promise<void> {
  const rendered = await renderTemplates(samplesRoot, sourceRevisionIds);
  await assertEmptyDirectory(runtimeRoot);
  await copyTreeChecked(samplesRoot, runtimeRoot, {
    rejectOverwrite: true,
    rejectSpecialFiles: true,
    rejectSymlinks: true,
  });
  for (const [relativePath, content] of rendered) {
    await writeFile(resolveInside(runtimeRoot, relativePath), content, { flag: "w" });
  }
}

export async function syncWikiSamples({
  samplesRoot,
  runtimeRoot,
  sourceRevisionIds = {},
}: InitWikiOptions): Promise<void> {
  const rendered = await renderTemplates(samplesRoot, sourceRevisionIds);
  for (const [relativePath, content] of rendered) {
    const target = resolveInside(runtimeRoot, relativePath);
    if (await pathExists(target)) {
      await assertFileIsRegular(target, relativePath);
    } else {
      await ensureParentDirectory(target);
    }
    await writeFile(target, content, { flag: "w" });
  }
}

export async function main(): Promise<void> {
  const statePath = join(process.cwd(), ".runtime", "sample-ingest-state.json");
  await assertFileIsRegular(statePath, "sample ingest state");
  const state = await readJsonFile<Record<string, { sourceRevisionId: string }>>(statePath);
  await initWiki({
    samplesRoot: join(process.cwd(), "samples", "wiki"),
    runtimeRoot: join(process.cwd(), ".runtime", "wiki-repo"),
    sourceRevisionIds: Object.fromEntries(
      Object.entries(state).map(([key, value]) => [key, value.sourceRevisionId]),
    ),
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : "wiki bootstrap failed");
    process.exitCode = 1;
  });
}
