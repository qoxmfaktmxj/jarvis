/**
 * scripts/tests/check-schema-drift.test.mjs
 *
 * node:test self-test for check-schema-drift.mjs
 * Tests --ci, --precommit (blocking), and --hook (advisory) modes.
 *
 * Run: node --test scripts/tests/check-schema-drift.test.mjs
 */

import { describe, it, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SCRIPT = path.resolve(import.meta.dirname, "../check-schema-drift.mjs");

/**
 * Create a temporary directory mimicking the repo layout:
 *   tmp/packages/db/schema/sample.ts      (mtime = now)
 *   tmp/packages/db/drizzle/meta/_journal.json (mtime = now - offsetMs)
 *
 * Returns the tmp root path.
 */
function makeFixture({ schemaAheadMs = 10_000, journalExists = true } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "schema-drift-test-"));
  const schemaDir = path.join(tmp, "packages", "db", "schema");
  const metaDir = path.join(tmp, "packages", "db", "drizzle", "meta");

  fs.mkdirSync(schemaDir, { recursive: true });
  fs.mkdirSync(metaDir, { recursive: true });

  const schemaFile = path.join(schemaDir, "sample.ts");
  fs.writeFileSync(schemaFile, "// sample schema\n");

  if (journalExists) {
    const journalFile = path.join(metaDir, "_journal.json");
    fs.writeFileSync(journalFile, JSON.stringify({ version: "7", entries: [] }));

    // Set journal mtime to schemaAheadMs before schema mtime
    const now = Date.now();
    const schemaMtime = now;
    const journalMtime = now - schemaAheadMs;

    fs.utimesSync(schemaFile, schemaMtime / 1000, schemaMtime / 1000);
    fs.utimesSync(journalFile, journalMtime / 1000, journalMtime / 1000);
  }

  return tmp;
}

function runScript(args, { cwd, stdin } = {}) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd,
    input: stdin,
    encoding: "utf8",
    timeout: 10_000,
  });
}

describe("check-schema-drift.mjs --ci mode", () => {
  it("exits 1 when schema is ahead of journal (drift)", () => {
    const tmp = makeFixture({ schemaAheadMs: 10_000 });
    try {
      const result = runScript(["--ci"], { cwd: tmp });
      assert.strictEqual(result.status, 1, `Expected exit 1 but got ${result.status}.\nstderr: ${result.stderr}`);
      assert.match(result.stderr, /\[CI\].*Schema drift detected/i);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("exits 0 when journal is newer than schema (no drift)", () => {
    const tmp = makeFixture({ schemaAheadMs: -5_000 }); // journal is 5s AHEAD of schema
    try {
      const result = runScript(["--ci"], { cwd: tmp });
      assert.strictEqual(result.status, 0, `Expected exit 0 but got ${result.status}.\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("exits 1 when journal is missing", () => {
    const tmp = makeFixture({ journalExists: false });
    try {
      const result = runScript(["--ci"], { cwd: tmp });
      assert.strictEqual(result.status, 1, `Expected exit 1 but got ${result.status}.\nstderr: ${result.stderr}`);
      assert.match(result.stderr, /missing/i);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("check-schema-drift.mjs --precommit mode", () => {
  it("exits 1 when drift is detected", () => {
    const tmp = makeFixture({ schemaAheadMs: 10_000 });
    try {
      const result = runScript(["--precommit"], { cwd: tmp });
      assert.strictEqual(result.status, 1, `Expected exit 1 but got ${result.status}.\nstderr: ${result.stderr}`);
      assert.match(result.stderr, /\[pre-commit\].*Schema drift detected/i);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("exits 0 when no drift", () => {
    const tmp = makeFixture({ schemaAheadMs: -5_000 });
    try {
      const result = runScript(["--precommit"], { cwd: tmp });
      assert.strictEqual(result.status, 0, `Expected exit 0 but got ${result.status}.\nstdout: ${result.stdout}`);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("check-schema-drift.mjs --hook mode", () => {
  it("exits 0 even when drift is detected (advisory only)", () => {
    const tmp = makeFixture({ schemaAheadMs: 10_000 });
    try {
      const schemaFile = path.join(tmp, "packages", "db", "schema", "sample.ts");
      const payload = JSON.stringify({ tool_input: { file_path: schemaFile } });
      const result = runScript(["--hook"], { cwd: tmp, stdin: payload });
      assert.strictEqual(result.status, 0, `Expected exit 0 but got ${result.status}.\nstderr: ${result.stderr}`);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("exits 0 for non-schema file (not interested)", () => {
    const tmp = makeFixture({ schemaAheadMs: 10_000 });
    try {
      const payload = JSON.stringify({ tool_input: { file_path: "/some/other/file.ts" } });
      const result = runScript(["--hook"], { cwd: tmp, stdin: payload });
      assert.strictEqual(result.status, 0, `Expected exit 0 but got ${result.status}.`);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("check-schema-drift.mjs --hook wins over --ci (hook safety priority)", () => {
  it("exits 0 when both --hook and --ci are given (hook wins)", () => {
    const tmp = makeFixture({ schemaAheadMs: 10_000 });
    try {
      const schemaFile = path.join(tmp, "packages", "db", "schema", "sample.ts");
      const payload = JSON.stringify({ tool_input: { file_path: schemaFile } });
      const result = runScript(["--hook", "--ci"], { cwd: tmp, stdin: payload });
      assert.strictEqual(result.status, 0, `Expected exit 0 (hook wins) but got ${result.status}.`);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
