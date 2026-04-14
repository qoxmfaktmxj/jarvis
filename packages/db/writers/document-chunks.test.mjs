/**
 * packages/db/writers/document-chunks.test.mjs
 *
 * node:test self-test for document-chunks writer stub.
 * Tests FEATURE_DOCUMENT_CHUNKS_WRITE flag-guarded behavior.
 *
 * Run: node --test packages/db/writers/document-chunks.test.mjs
 */

import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Use file:// URL for Windows compatibility
const WRITER_URL = pathToFileURL(path.join(__dirname, "document-chunks.mjs")).href;

async function freshWriteChunks() {
  // Node.js ESM module cache cannot be easily busted.
  // Instead, we rely on writeChunks reading process.env at call time (not import time).
  const mod = await import(WRITER_URL);
  return mod.writeChunks;
}

describe("writeChunks (flag-guarded stub)", () => {
  const PREV = process.env.FEATURE_DOCUMENT_CHUNKS_WRITE;

  afterEach(() => {
    if (PREV === undefined) delete process.env.FEATURE_DOCUMENT_CHUNKS_WRITE;
    else process.env.FEATURE_DOCUMENT_CHUNKS_WRITE = PREV;
  });

  it("throws when flag is undefined (default)", async () => {
    delete process.env.FEATURE_DOCUMENT_CHUNKS_WRITE;
    const writeChunks = await freshWriteChunks();
    await assert.rejects(
      async () => writeChunks([]),
      /disabled/
    );
  });

  it("throws when flag = 'false' (string)", async () => {
    process.env.FEATURE_DOCUMENT_CHUNKS_WRITE = "false";
    const writeChunks = await freshWriteChunks();
    await assert.rejects(
      async () => writeChunks([]),
      /disabled/
    );
  });

  it("throws 'not landed' when flag = 'true' (7A has no impl yet)", async () => {
    process.env.FEATURE_DOCUMENT_CHUNKS_WRITE = "true";
    const writeChunks = await freshWriteChunks();
    await assert.rejects(
      async () => writeChunks([]),
      /not landed/
    );
  });
});
