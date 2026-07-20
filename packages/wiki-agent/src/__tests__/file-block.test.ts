import { describe, expect, it } from "vitest";

import { parseFileBlocks } from "../index.js";

function block(path: string, eol = "\n"): string {
  return `---FILE: ${path}---${eol}body${eol}---END FILE---`;
}

describe("parseFileBlocks", () => {
  it("accepts complete normalized auto markdown blocks with LF or CRLF", () => {
    expect(parseFileBlocks(block("auto/concepts/평균임금.md"))).toEqual([{
      path: "auto/concepts/평균임금.md",
      content: "body",
      mode: "overwrite",
    }]);
    expect(parseFileBlocks(block("auto/guides/annual-leave.md", "\r\n"))).toHaveLength(1);
  });

  it.each([
    "../escape.md",
    "C:\\temp\\escape.md",
    "//server/share/page.md",
    "/absolute.md",
    "manual/page.md",
    "_system/index.md",
    "_archive/page.md",
    "index.md",
    "log.md",
    "auto/../escape.md",
    "auto/*.md",
    "auto/NUL.md",
    "auto/guides/NUL.example.md",
  ])("drops denied generated path %s", (path) => {
    expect(parseFileBlocks(block(path))).toEqual([]);
  });

  it("drops non-NFC and incomplete blocks", () => {
    expect(parseFileBlocks(block("auto/concepts/Cafe\u0301.md"))).toEqual([]);
    expect(parseFileBlocks("---FILE: auto/concepts/a.md---\npartial")).toEqual([]);
  });
});
