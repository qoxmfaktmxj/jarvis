import { describe, expect, it } from "vitest";
import { runPageFirstQa } from "./page-first-qa.js";

describe("runPageFirstQa", () => {
  it("passes the public demo fixture in mock mode", async () => {
    const rows = await runPageFirstQa("eval/fixtures/public-demo/page-first-qa.jsonl");
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.passed)).toBe(true);
  });
});
