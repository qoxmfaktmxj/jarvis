#!/usr/bin/env node
/**
 * scripts/build-db-private-zip.mjs
 *
 * Build the private DB zip channel (README §17.2).
 *
 * What goes in:
 *   - .local/db/drizzle/        (full migration history; restored to packages/db/drizzle/)
 *   - packages/db/seed/         (gitignored seed scripts; restored as-is)
 *
 * Output:
 *   .local/db/zips/db-private-<YYYYMMDD-HHMMSS>.zip
 *
 * On the server:
 *   unzip db-private-<...>.zip          # restores packages/db/{drizzle,seed}
 *   pnpm install --frozen-lockfile
 *   pnpm db:migrate                     # applies historical migrations
 *   pnpm db:seed                        # optional
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const LOCAL_DB = path.join(ROOT, ".local", "db");
const DRIZZLE_SRC = path.join(LOCAL_DB, "drizzle");
const SEED_SRC = path.join(ROOT, "packages", "db", "seed");
const OUT_DIR = path.join(LOCAL_DB, "zips");

if (!fs.existsSync(DRIZZLE_SRC)) {
  console.error(`ERROR: ${path.relative(ROOT, DRIZZLE_SRC)} not found.`);
  console.error("Run a migration locally first, then copy packages/db/drizzle to .local/db/drizzle.");
  process.exit(1);
}

fs.mkdirSync(OUT_DIR, { recursive: true });

const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 15).replace(/^(\d{8})(\d{6}).*/, "$1-$2");
const outFile = path.join(OUT_DIR, `db-private-${stamp}.zip`);

const staging = fs.mkdtempSync(path.join(os.tmpdir(), "db-private-"));
try {
  const stagedDb = path.join(staging, "packages", "db");
  fs.mkdirSync(stagedDb, { recursive: true });
  copyDir(DRIZZLE_SRC, path.join(stagedDb, "drizzle"));
  if (fs.existsSync(SEED_SRC)) {
    copyDir(SEED_SRC, path.join(stagedDb, "seed"));
  } else {
    console.warn(`(skip) ${path.relative(ROOT, SEED_SRC)} not found — zip will not include seed/.`);
  }

  zipDir(staging, outFile);
} finally {
  fs.rmSync(staging, { recursive: true, force: true });
}

const sizeMb = (fs.statSync(outFile).size / 1024 / 1024).toFixed(2);
console.log(`✓ Built ${path.relative(ROOT, outFile)} (${sizeMb} MB)`);
console.log(`  Deploy: scp this to the server, unzip at repo root, then 'pnpm db:migrate'.`);

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function zipDir(stagingDir, outFile) {
  if (process.platform === "win32") {
    const ps = spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `Compress-Archive -Path '${stagingDir.replace(/'/g, "''")}\\*' -DestinationPath '${outFile.replace(/'/g, "''")}' -Force`,
      ],
      { stdio: "inherit" },
    );
    if (ps.status !== 0) throw new Error(`Compress-Archive failed (exit ${ps.status})`);
  } else {
    const zip = spawnSync("zip", ["-r", outFile, "."], { cwd: stagingDir, stdio: "inherit" });
    if (zip.status !== 0) throw new Error(`zip failed (exit ${zip.status})`);
  }
}
