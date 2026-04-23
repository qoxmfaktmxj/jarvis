// packages/wiki-agent/src/__tests__/append-log.test.ts
//
// Phase C2 — wiki/log.md append-only 포맷팅 로직 테스트.
// Karpathy LLM Wiki §logging: `## [YYYY-MM-DD] type | summary` prefix 로
// grep 파싱 가능한 append-only timeline 유지.

import { describe, expect, it } from "vitest";
import {
  formatLogEntry,
  appendLogEntry,
  parseRecentLogHeaders,
  type LogEntry,
} from "../append-log.js";

const BASE_ENTRY: LogEntry = {
  date: new Date("2026-04-23T09:15:00Z"),
  type: "ingest",
  summary: "사내대출 이자 한도 개정",
  details: [
    "Source: raw/loan-policy-2026-04.pdf",
    "Updated: [[loan-interest-limit]], [[welfare-loan-overview]]",
  ],
};

describe("formatLogEntry", () => {
  it("uses '## [YYYY-MM-DD] type | summary' header", () => {
    const out = formatLogEntry(BASE_ENTRY);
    expect(out.startsWith("## [2026-04-23] ingest | 사내대출 이자 한도 개정")).toBe(true);
  });

  it("renders details as dash-bulleted list", () => {
    const out = formatLogEntry(BASE_ENTRY);
    expect(out).toContain("- Source: raw/loan-policy-2026-04.pdf");
    expect(out).toContain("- Updated: [[loan-interest-limit]], [[welfare-loan-overview]]");
  });

  it("ends with a trailing blank line so the next append is separated", () => {
    const out = formatLogEntry(BASE_ENTRY);
    expect(out.endsWith("\n\n")).toBe(true);
  });

  it("omits detail list section when details is empty/missing", () => {
    const out = formatLogEntry({ ...BASE_ENTRY, details: [] });
    // Should contain the header only, no bullet lines
    const lines = out.split("\n").filter((l) => l.startsWith("- "));
    expect(lines).toEqual([]);
  });

  it("supports all event types (ingest/query/lint/graph-build)", () => {
    const types = ["ingest", "query", "lint", "graph-build"] as const;
    for (const t of types) {
      const out = formatLogEntry({ ...BASE_ENTRY, type: t });
      expect(out).toContain(`## [2026-04-23] ${t} | `);
    }
  });

  it("uses UTC date (not local) for reproducible dates", () => {
    const out = formatLogEntry({ ...BASE_ENTRY, date: new Date("2026-04-23T23:00:00Z") });
    // Regardless of local TZ, use UTC date 2026-04-23
    expect(out).toContain("## [2026-04-23] ");
  });
});

describe("appendLogEntry", () => {
  it("appends with a leading newline when existing text does not end with blank line", () => {
    const existing = "# Log\n\n## [2026-04-22] ingest | 이전\n\n";
    const out = appendLogEntry(existing, BASE_ENTRY);
    expect(out.startsWith(existing)).toBe(true);
    expect(out).toContain("## [2026-04-23] ingest | 사내대출 이자 한도 개정");
  });

  it("creates a file header when existing is empty", () => {
    const out = appendLogEntry("", BASE_ENTRY);
    expect(out.startsWith("# ")).toBe(true); // header
    expect(out).toContain("## [2026-04-23] ingest | 사내대출 이자 한도 개정");
  });

  it("preserves the entire existing content verbatim at the top", () => {
    const existing = "# Log\n\n## [2026-04-22] lint | clean run\n\n";
    const out = appendLogEntry(existing, BASE_ENTRY);
    expect(out.indexOf(existing)).toBe(0);
  });
});

describe("parseRecentLogHeaders", () => {
  const text = [
    "# Log",
    "",
    "## [2026-04-21] ingest | A",
    "",
    "## [2026-04-22] lint | B",
    "",
    "## [2026-04-23] query | C",
    "",
  ].join("\n");

  it("returns the most recent N headers in descending order", () => {
    const heads = parseRecentLogHeaders(text, 2);
    expect(heads).toEqual([
      "## [2026-04-23] query | C",
      "## [2026-04-22] lint | B",
    ]);
  });

  it("defaults to 5 entries", () => {
    const heads = parseRecentLogHeaders(text);
    expect(heads.length).toBe(3);
  });

  it("returns empty array when text has no log headers", () => {
    expect(parseRecentLogHeaders("no headers here")).toEqual([]);
  });
});
