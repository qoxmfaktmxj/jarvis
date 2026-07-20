import { access, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

const GRAPH_OUTPUT_DIR = ["graph", "ify-out"].join("");
const FORBIDDEN_DIRS = new Set([
  ".git",
  ".agents",
  ".claude",
  ".codex",
  ".codex-artifacts",
  ".gstack",
  ".omx",
  ".obsidian",
  ".idea",
  ".pytest_cache",
  ".worktrees",
  ".superpowers",
  GRAPH_OUTPUT_DIR,
  "추가개발",
]);

const IGNORED_DIRS = new Set([
  "node_modules",
  ".turbo",
  ".next",
  ".next-e2e",
  ".vite",
  "dist",
  "coverage",
  "test-results",
  "playwright-report",
  ".runtime",
  "artifacts",
]);
const FORBIDDEN_EXTENSIONS = new Set([
  ".exe", ".dll", ".so", ".dylib", ".node",
  ".zip", ".7z", ".tar", ".gz", ".tgz",
  ".xls", ".xlsx", ".db", ".sqlite", ".bak", ".dump", ".enc",
  ".png", ".jpg", ".jpeg", ".gif", ".pdf",
]);
const FORBIDDEN_NAME_FRAGMENTS = [
  ["dev", "accounts"].join("-"),
  ["service", "desk"].join("-"),
  ["cli", "proxy"].join(""),
];

function normalizedPath(root: string, path: string) {
  return relative(root, path).replaceAll("\\", "/");
}

function isAllowedSqlPath(displayPath: string): boolean {
  return /^packages\/db\/migrations\/[^/]+\.sql$/i.test(displayPath);
}

async function isGeneratedWorkerJavaScript(displayPath: string, absolutePath: string): Promise<boolean> {
  if (!/^apps\/worker\/src\/.+\.js$/i.test(displayPath)) return false;
  try {
    await access(`${absolutePath.slice(0, -3)}.ts`);
    return true;
  } catch {
    return false;
  }
}

export async function findForbiddenPaths(root: string): Promise<string[]> {
  const hits: string[] = [];

  async function walk(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const path = join(directory, entry.name);
      const displayPath = normalizedPath(root, path);

      if (entry.isSymbolicLink()) {
        hits.push(displayPath);
        continue;
      }

      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        if (FORBIDDEN_NAME_FRAGMENTS.some((fragment) => entry.name.toLowerCase().includes(fragment))) {
          hits.push(displayPath);
          continue;
        }
        if (entry.name.startsWith("_workspace")) {
          hits.push(displayPath);
          continue;
        }
        if (directory === root && entry.name === ".git") continue;
        if (FORBIDDEN_DIRS.has(entry.name)) {
          hits.push(displayPath);
          continue;
        }
        await walk(path);
        continue;
      }

      if (displayPath === ".env.local") {
        continue;
      }
      if (entry.name.startsWith(".env") && entry.name !== ".env.example") {
        hits.push(displayPath);
        continue;
      }
      if (entry.name === ".git") {
        hits.push(displayPath);
        continue;
      }
      if (await isGeneratedWorkerJavaScript(displayPath, path)) {
        hits.push(displayPath);
        continue;
      }
      if (FORBIDDEN_NAME_FRAGMENTS.some((fragment) => entry.name.toLowerCase().includes(fragment))) {
        hits.push(displayPath);
        continue;
      }
      if (entry.name.toLowerCase().endsWith(".sql") && !isAllowedSqlPath(displayPath)) {
        hits.push(displayPath);
        continue;
      }

      const extension = entry.name.slice(entry.name.lastIndexOf(".")).toLowerCase();
      if (FORBIDDEN_EXTENSIONS.has(extension)) hits.push(displayPath);
    }
  }

  await walk(root);
  return hits.sort((left, right) => left.localeCompare(right));
}

export async function main(): Promise<void> {
  const hits = await findForbiddenPaths(process.cwd());
  if (hits.length === 0) return;
  console.error(`Forbidden staging paths:\n${hits.map((path) => `- ${path}`).join("\n")}`);
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
