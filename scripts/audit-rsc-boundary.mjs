import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

const BANNED_CLIENT_IMPORTS = [
  "node:",
  "fs",
  "path",
  "crypto",
  "drizzle-orm",
  "@jarvis/db",
  "@jarvis/wiki-fs",
  "@jarvis/wiki-agent",
  "next/headers",
  "server-only",
];
const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"]);
const IGNORED_DIRS = new Set([".git", "node_modules", ".turbo", ".next", "dist", "coverage", "test-results", "playwright-report", ".runtime", "artifacts"]);

function isClientFile(source) {
  return /^\s*["']use client["'];?/m.test(source);
}

function importSources(source) {
  return [...source.matchAll(/(?:import\s+(?:[^"']+?\s+from\s+)?|export\s+[^"']+?\s+from\s+|require\s*\()\s*["']([^"']+)["']/g)].map((match) => match[1]);
}

function isBanned(source) {
  return BANNED_CLIENT_IMPORTS.some((banned) =>
    banned.endsWith(":") ? source.startsWith(banned) : source === banned || source.startsWith(`${banned}/`)
  );
}

async function collectSourceFiles(root) {
  const files = [];
  async function walk(directory) {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) await walk(path);
      } else if (entry.isFile() && SOURCE_EXTENSIONS.has(entry.name.slice(entry.name.lastIndexOf(".")).toLowerCase())) {
        files.push(path);
      }
    }
  }
  await walk(root);
  return files;
}

export async function auditRscBoundary(root = process.cwd()) {
  const violations = [];
  const files = await collectSourceFiles(root);
  for (const file of files) {
    const source = await readFile(file, "utf8");
    if (!isClientFile(source)) continue;
    for (const imported of importSources(source)) {
      if (isBanned(imported)) {
        violations.push(`${relative(root, file).replaceAll("\\", "/")}: client component imports ${imported}`);
      }
    }
  }
  return { violations };
}

export async function main() {
  const report = await auditRscBoundary();
  if (report.violations.length === 0) return;
  console.error(report.violations.join("\n"));
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
