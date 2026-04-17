/**
 * scripts/tests/embed-knowledge-pages.test.mjs
 *
 * node:test unit test for embed-knowledge-pages.mjs.
 * Run: node --test scripts/tests/embed-knowledge-pages.test.mjs
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { embedPages } from "../embed-knowledge-pages.mjs";

function makeMockDb() {
  const calls = [];
  return {
    calls,
    queue: [],
    execute(query) {
      calls.push(query);
      const next = this.queue.shift() ?? { rows: [] };
      return Promise.resolve(next);
    },
    enqueue(result) {
      this.queue.push(result);
    },
  };
}

// Mock `sql` tagged-template: returns a { strings, values } object the
// real drizzle sql tag would build. The mock db ignores structure; this
// just keeps the call signature the same.
function mockSql(strings, ...values) {
  return { strings: Array.from(strings), values };
}

function makeMockOpenAI() {
  const calls = [];
  return {
    calls,
    embeddings: {
      create(payload) {
        calls.push(payload);
        return Promise.resolve({
          data: [{ embedding: new Array(1536).fill(0.01) }],
          usage: { total_tokens: 42 },
        });
      },
    },
  };
}

describe("embedPages", () => {
  let mockDb;
  let mockOpenAI;

  beforeEach(() => {
    mockDb = makeMockDb();
    mockOpenAI = makeMockOpenAI();
  });

  it("returns 0 and does not call OpenAI when no pages need embedding", async () => {
    mockDb.enqueue({ rows: [] });
    const n = await embedPages({ db: mockDb, openai: mockOpenAI, sql: mockSql });
    assert.equal(n, 0);
    assert.equal(mockOpenAI.calls.length, 0);
  });

  it("embeds a single page with text-embedding-3-small + upserts via UPDATE", async () => {
    mockDb.enqueue({
      rows: [{ id: "page-1", title: "취업규칙", summary: "제1장 총칙" }],
    });
    mockDb.enqueue({ rows: [] });
    const n = await embedPages({ db: mockDb, openai: mockOpenAI, sql: mockSql });
    assert.equal(n, 1);
    assert.equal(mockOpenAI.calls.length, 1);
    assert.equal(mockOpenAI.calls[0].model, "text-embedding-3-small");
    assert.equal(mockOpenAI.calls[0].input, "취업규칙\n제1장 총칙");
    // 1 SELECT + 1 UPDATE = 2 execute calls
    assert.equal(mockDb.calls.length, 2);
  });

  it("embeds multiple pages sequentially", async () => {
    mockDb.enqueue({
      rows: [
        { id: "p1", title: "연차 규정", summary: "" },
        { id: "p2", title: "출장 규정", summary: "국내출장" },
      ],
    });
    mockDb.enqueue({ rows: [] });
    mockDb.enqueue({ rows: [] });
    const n = await embedPages({ db: mockDb, openai: mockOpenAI, sql: mockSql });
    assert.equal(n, 2);
    assert.equal(mockOpenAI.calls.length, 2);
    // 1 SELECT + 2 UPDATE = 3 execute calls
    assert.equal(mockDb.calls.length, 3);
  });
});
