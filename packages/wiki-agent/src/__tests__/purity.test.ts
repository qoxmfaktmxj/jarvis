import packageJson from "../../package.json" with { type: "json" };
import { describe, expect, it } from "vitest";

import { appendLogEntry, buildIndexMarkdown } from "../index.js";

describe("wiki-agent purity and repo-relative helpers", () => {
  it("has only the schema runtime dependency", () => {
    const forbidden = [`@jarvis/${"db"}`, `drizzle-${"orm"}`, "simple" + "-git"];
    expect(Object.keys(packageJson.dependencies ?? {})).toEqual(["zod"]);
    for (const dependency of forbidden) expect(packageJson.dependencies).not.toHaveProperty(dependency);
  });

  it("categorizes the first repo-relative path segment without a workspace prefix", () => {
    const markdown = buildIndexMarkdown([
      { slug: "manual-page", title: "수동 페이지", path: "manual/guides/manual-page.md" },
      { slug: "auto-page", title: "자동 페이지", path: "auto/concepts/auto-page.md" },
    ], { generatedAt: new Date("2026-07-20T00:00:00.000Z"), workspaceCode: "public-demo" });

    expect(markdown).toContain("## 수동 작성 (manual) — 1");
    expect(markdown).toContain("## 자동 생성 (auto) — 1");
    expect(markdown).not.toContain("## 기타 (other)");
  });

  it("formats an append-only log without I/O", () => {
    expect(appendLogEntry("", {
      date: new Date("2026-07-20T12:00:00.000Z"),
      type: "projection",
      summary: "합성 위키 투영 완료",
      details: ["pages: 2"],
    })).toContain("## [2026-07-20] projection | 합성 위키 투영 완료\n- pages: 2");
  });
});
