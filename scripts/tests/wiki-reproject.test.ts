/**
 * scripts/tests/wiki-reproject.test.ts
 *
 * Unit tests for wiki-reproject (Karpathy LLM Wiki projection).
 * Run:
 *   node --test scripts/tests/wiki-reproject.test.ts
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  prepareProjection,
  upsertPagesBatch,
  upsertLinksBatch,
  fixUnquotedFlowListItems,
  type ProjectionRow,
  type LinkRequest,
} from "../wiki-reproject.ts";

const GIT_SHA = "afa0d9454903cb196c759e715e7d15d5cfd0b014";
const WS_ID = "11111111-1111-1111-1111-111111111111";
const WS_CODE = "jarvis";

function frontmatterDoc(fm: string, body: string = "body"): string {
  return ["---", fm, "---", "", body].join("\n");
}

describe("prepareProjection", () => {
  test("projects an infra-runbook page with frontmatter + wikilinks", () => {
    const content = frontmatterDoc(
      [
        'title: "WHE 운영 (IP) 시스템 Runbook"',
        "type: infra-runbook",
        "authority: auto",
        "sensitivity: INTERNAL",
        "domain: infra",
        'tags: ["domain/infra", "company/whe", "env/운영"]',
        "infra:",
        "  companyCd: WHE",
        '  envType: "운영"',
        '  dbUserInfo: "EHR_WHE / Whec113390"',
      ].join("\n"),
      "# Body\n\n연관: [[companies/whe]] 그리고 [[cluster-1|HRI 보정]]",
    );

    const result = prepareProjection({
      wikiPath: "wiki/jarvis/auto/infra/whe/운영-ip-row1.md",
      content,
      workspaceId: WS_ID,
      workspaceCode: WS_CODE,
      gitSha: GIT_SHA,
    });

    assert.equal(result.skipped, false, result.reason);
    assert.ok(result.row);
    const row = result.row!;
    assert.equal(row.workspaceId, WS_ID);
    assert.equal(row.path, "wiki/jarvis/auto/infra/whe/운영-ip-row1.md");
    assert.equal(row.title, "WHE 운영 (IP) 시스템 Runbook");
    assert.equal(row.slug, "운영-ip-row1");
    assert.equal(row.routeKey, "auto/infra/whe/운영-ip-row1");
    assert.equal(row.type, "infra-runbook");
    assert.equal(row.authority, "auto");
    assert.equal(row.sensitivity, "INTERNAL");
    assert.equal(row.gitSha, GIT_SHA);
    assert.equal(row.stale, false);
    assert.equal(row.publishedStatus, "published");
    assert.equal(row.requiredPermission, "knowledge:read");
    // frontmatter preserved (including domain-specific nested infra object)
    assert.equal(row.frontmatter.domain, "infra");
    assert.ok(row.frontmatter.infra && typeof row.frontmatter.infra === "object");

    // wikilinks extracted in source order
    assert.equal(result.links.length, 2);
    assert.equal(result.links[0].fromPath, row.path);
    assert.equal(result.links[0].targetRaw, "companies/whe");
    assert.equal(result.links[0].alias, null);
    assert.equal(result.links[1].targetRaw, "cluster-1");
    assert.equal(result.links[1].alias, "HRI 보정");
  });

  test("projects a synthesis (case digest) page", () => {
    const content = frontmatterDoc(
      [
        'title: "인사기본·증명서·발령내역 등 HRI 조회/출력 데이터 보정"',
        "type: synthesis",
        "authority: auto",
        "sensitivity: INTERNAL",
        "domain: cases",
        'tags: ["domain/cases", "cluster", "module/hri"]',
        "cases:",
        "  clusterId: 1",
        "  caseCount: 620",
      ].join("\n"),
      "# 증상\n빈 페이지",
    );
    const result = prepareProjection({
      wikiPath: "wiki/jarvis/auto/syntheses/cases/hri/cluster-1.md",
      content,
      workspaceId: WS_ID,
      workspaceCode: WS_CODE,
      gitSha: GIT_SHA,
    });
    assert.equal(result.skipped, false, result.reason);
    assert.equal(result.row?.type, "synthesis");
    assert.equal(result.row?.routeKey, "auto/syntheses/cases/hri/cluster-1");
    assert.equal(result.row?.slug, "cluster-1");
  });

  test("keeps manual authority when set on a manual-authored page", () => {
    const content = frontmatterDoc(
      [
        'title: "이수그룹 소개"',
        "type: concept",
        "authority: manual",
        "sensitivity: INTERNAL",
        "domain: hr",
      ].join("\n"),
      "이수그룹 본문",
    );
    const result = prepareProjection({
      wikiPath: "wiki/jarvis/manual/guidebook/isu-group.md",
      content,
      workspaceId: WS_ID,
      workspaceCode: WS_CODE,
      gitSha: GIT_SHA,
    });
    assert.equal(result.skipped, false, result.reason);
    assert.equal(result.row?.authority, "manual");
    assert.equal(result.row?.routeKey, "manual/guidebook/isu-group");
  });

  test("falls back to slug when frontmatter title is missing", () => {
    const content = frontmatterDoc(
      [
        "type: concept",
        "authority: auto",
        "sensitivity: INTERNAL",
      ].join("\n"),
      "content",
    );
    const result = prepareProjection({
      wikiPath: "wiki/jarvis/auto/misc/untitled-page.md",
      content,
      workspaceId: WS_ID,
      workspaceCode: WS_CODE,
      gitSha: GIT_SHA,
    });
    assert.equal(result.skipped, false, result.reason);
    assert.equal(result.row?.title, "untitled-page");
  });

  test("skips file without any frontmatter block", () => {
    const result = prepareProjection({
      wikiPath: "wiki/jarvis/auto/no-frontmatter.md",
      content: "# Just markdown\n\nNo YAML here.",
      workspaceId: WS_ID,
      workspaceCode: WS_CODE,
      gitSha: GIT_SHA,
    });
    assert.equal(result.skipped, true);
    assert.match(result.reason ?? "", /frontmatter/i);
  });

  test("preserves manual-doc types outside the auto/ enum (guidebook, policy, procedure, reference)", () => {
    // DB `type` column is varchar(20), not a Postgres enum, so the
    // projection preserves the original type verbatim. This lets
    // /wiki search & dashboard still see manual docs even though the
    // strict wiki-fs parser would reject the enum value.
    for (const typeValue of ["guidebook", "policy", "procedure", "reference"]) {
      const content = frontmatterDoc(
        [
          'title: "test"',
          `type: ${typeValue}`,
          "authority: manual",
          "sensitivity: INTERNAL",
        ].join("\n"),
      );
      const result = prepareProjection({
        wikiPath: `wiki/jarvis/manual/${typeValue}-test.md`,
        content,
        workspaceId: WS_ID,
        workspaceCode: WS_CODE,
        gitSha: GIT_SHA,
      });
      assert.equal(result.skipped, false, `type=${typeValue} reason=${result.reason}`);
      assert.equal(result.row?.type, typeValue);
      assert.equal(result.row?.authority, "manual");
    }
  });

  test("extracts alias + anchor from [[target#anchor|alias]] style", () => {
    const content = frontmatterDoc(
      [
        'title: "test"',
        "type: concept",
        "authority: auto",
        "sensitivity: INTERNAL",
      ].join("\n"),
      "See [[foo/bar#sec|Section 1]] and [[baz]].",
    );
    const result = prepareProjection({
      wikiPath: "wiki/jarvis/auto/test.md",
      content,
      workspaceId: WS_ID,
      workspaceCode: WS_CODE,
      gitSha: GIT_SHA,
    });
    assert.equal(result.skipped, false);
    assert.equal(result.links.length, 2);
    assert.equal(result.links[0].targetRaw, "foo/bar");
    assert.equal(result.links[0].anchor, "sec");
    assert.equal(result.links[0].alias, "Section 1");
    assert.equal(result.links[1].targetRaw, "baz");
    assert.equal(result.links[1].alias, null);
    assert.equal(result.links[1].anchor, null);
  });

  test("auto-fixes legacy case-source unquoted [e-HR] list items so YAML parses", () => {
    const content = [
      "---",
      'title: "test cluster"',
      "type: synthesis",
      "authority: auto",
      "sensitivity: INTERNAL",
      "cases:",
      "  clusterId: 10",
      "  topCompanies:",
      "  - 도이치오토모빌그룹",
      "  - [e-HR] 오스템임플란트",
      "  - [e-HR] 동성그룹",
      "  - GS E&R",
      "---",
      "",
      "body",
    ].join("\n");
    const result = prepareProjection({
      wikiPath: "wiki/jarvis/auto/syntheses/cases/hri/cluster-10.md",
      content,
      workspaceId: WS_ID,
      workspaceCode: WS_CODE,
      gitSha: GIT_SHA,
    });
    assert.equal(result.skipped, false, result.reason);
    assert.equal(result.row?.type, "synthesis");
    // topCompanies entries should come through as strings (including quoted `[e-HR]` variants)
    const fm = result.row!.frontmatter as Record<string, unknown>;
    const cases = fm.cases as Record<string, unknown> | undefined;
    assert.ok(Array.isArray(cases?.topCompanies));
    const companies = cases!.topCompanies as string[];
    assert.equal(companies.length, 4);
    assert.ok(companies.includes("[e-HR] 오스템임플란트"));
  });

  test("preserves unknown frontmatter passthrough fields (domain, infra, cases)", () => {
    const content = frontmatterDoc(
      [
        'title: "test"',
        "type: infra-runbook",
        "authority: auto",
        "sensitivity: INTERNAL",
        "domain: infra",
        "infra:",
        "  companyCd: WHE",
        "  envType: 운영",
      ].join("\n"),
    );
    const result = prepareProjection({
      wikiPath: "wiki/jarvis/auto/infra/whe/test.md",
      content,
      workspaceId: WS_ID,
      workspaceCode: WS_CODE,
      gitSha: GIT_SHA,
    });
    assert.equal(result.skipped, false);
    const fm = result.row!.frontmatter as Record<string, unknown>;
    assert.equal(fm.domain, "infra");
    assert.ok(fm.infra);
  });
});

describe("fixUnquotedFlowListItems", () => {
  test("wraps `- [foo] text` list items inside frontmatter in quotes", () => {
    const input = ["---", "k:", "  - [e-HR] 골프존", "  - 정상", "---", "body"].join("\n");
    const out = fixUnquotedFlowListItems(input);
    assert.match(out, /- "\[e-HR\] 골프존"/);
    assert.match(out, /- 정상/);
  });

  test("leaves already-quoted items untouched", () => {
    const input = ["---", "k:", '  - "[e-HR] x"', "---", ""].join("\n");
    const out = fixUnquotedFlowListItems(input);
    assert.equal(out, input);
  });

  test("does not touch body lines that start with `- [` (markdown lists)", () => {
    const input = ["---", "k: v", "---", "", "- [x] checkbox item"].join("\n");
    const out = fixUnquotedFlowListItems(input);
    assert.ok(out.includes("- [x] checkbox item"));
  });

  test("no-ops when document has no frontmatter", () => {
    const input = "just markdown\n- [x] item\n";
    assert.equal(fixUnquotedFlowListItems(input), input);
  });
});

// ─────────────────────────────────────────────────────────────
// Mock DB for batch upsert tests
// ─────────────────────────────────────────────────────────────

type QueryCall = { text: string; values?: unknown[] };

function makeMockDb() {
  const calls: QueryCall[] = [];
  const queue: Array<{ rows: unknown[] }> = [];
  return {
    calls,
    enqueue(result: { rows: unknown[] }) {
      queue.push(result);
    },
    query(text: string, values?: unknown[]) {
      calls.push({ text, values });
      const next = queue.shift() ?? { rows: [] };
      return Promise.resolve(next as { rows: unknown[] });
    },
  };
}

function makeRow(overrides: Partial<ProjectionRow> = {}): ProjectionRow {
  return {
    workspaceId: WS_ID,
    path: "wiki/jarvis/auto/test.md",
    title: "test",
    slug: "test",
    routeKey: "auto/test",
    type: "concept",
    authority: "auto",
    sensitivity: "INTERNAL",
    requiredPermission: "knowledge:read",
    frontmatter: { title: "test" },
    gitSha: GIT_SHA,
    stale: false,
    publishedStatus: "published",
    ...overrides,
  };
}

describe("upsertPagesBatch", () => {
  test("returns empty map and makes no query when rows is empty", async () => {
    const mock = makeMockDb();
    const result = await upsertPagesBatch(mock as never, []);
    assert.equal(result.size, 0);
    assert.equal(mock.calls.length, 0);
  });

  test("issues one INSERT ... ON CONFLICT DO UPDATE ... RETURNING for all rows", async () => {
    const mock = makeMockDb();
    mock.enqueue({
      rows: [
        { id: "id-1", path: "wiki/jarvis/auto/a.md" },
        { id: "id-2", path: "wiki/jarvis/auto/b.md" },
      ],
    });
    const rows = [
      makeRow({ path: "wiki/jarvis/auto/a.md", slug: "a", routeKey: "auto/a" }),
      makeRow({ path: "wiki/jarvis/auto/b.md", slug: "b", routeKey: "auto/b" }),
    ];
    const pathToId = await upsertPagesBatch(mock as never, rows);
    assert.equal(mock.calls.length, 1);
    assert.match(mock.calls[0].text, /INSERT INTO wiki_page_index/);
    assert.match(mock.calls[0].text, /ON CONFLICT .* DO UPDATE/);
    assert.match(mock.calls[0].text, /RETURNING id, path/);
    // 13 params per row × 2 rows = 26
    assert.equal(mock.calls[0].values?.length, 26);
    assert.equal(pathToId.get("wiki/jarvis/auto/a.md"), "id-1");
    assert.equal(pathToId.get("wiki/jarvis/auto/b.md"), "id-2");
  });
});

describe("upsertLinksBatch", () => {
  test("returns 0 and no queries when no links", async () => {
    const mock = makeMockDb();
    const n = await upsertLinksBatch(mock as never, WS_ID, [], new Map(), WS_CODE);
    assert.equal(n, 0);
    assert.equal(mock.calls.length, 0);
  });

  test("resolves links to pathToId and issues DELETE+INSERT", async () => {
    const mock = makeMockDb();
    mock.enqueue({ rows: [] }); // DELETE result
    mock.enqueue({ rows: [] }); // INSERT result
    const pathToId = new Map<string, string>([
      ["wiki/jarvis/auto/infra/whe/운영-ip-row1.md", "page-whe"],
      ["wiki/jarvis/auto/companies/whe.md", "page-companies-whe"],
    ]);
    const links: LinkRequest[] = [
      {
        fromPath: "wiki/jarvis/auto/infra/whe/운영-ip-row1.md",
        targetRaw: "companies/whe",
        alias: null,
        anchor: null,
      },
      {
        fromPath: "wiki/jarvis/auto/infra/whe/운영-ip-row1.md",
        targetRaw: "unknown/target",
        alias: null,
        anchor: null,
      },
    ];
    const n = await upsertLinksBatch(mock as never, WS_ID, links, pathToId, WS_CODE);
    assert.equal(n, 2);
    assert.equal(mock.calls.length, 2);
    assert.match(mock.calls[0].text, /DELETE FROM wiki_page_link/);
    assert.match(mock.calls[1].text, /INSERT INTO wiki_page_link/);
    // The INSERT should have 6 params × 2 rows = 12
    assert.equal(mock.calls[1].values?.length, 12);
    // First link resolved to companies/whe page, second unresolved
    const vals = mock.calls[1].values!;
    // Row layout: workspaceId, fromPageId, toPageId, toPath, alias, anchor
    assert.equal(vals[2], "page-companies-whe"); // resolved toPageId
    assert.equal(vals[8], null); // unresolved toPageId
  });

  test("tries `auto/<target>` fallback when bare target doesn't match", async () => {
    const mock = makeMockDb();
    mock.enqueue({ rows: [] });
    mock.enqueue({ rows: [] });
    const pathToId = new Map<string, string>([
      ["wiki/jarvis/src.md", "src-id"],
      ["wiki/jarvis/auto/companies/whe.md", "companies-whe-id"],
    ]);
    const links: LinkRequest[] = [
      {
        fromPath: "wiki/jarvis/src.md",
        targetRaw: "companies/whe",
        alias: null,
        anchor: null,
      },
    ];
    const n = await upsertLinksBatch(mock as never, WS_ID, links, pathToId, WS_CODE);
    assert.equal(n, 1);
    const vals = mock.calls[1].values!;
    assert.equal(vals[2], "companies-whe-id");
    assert.equal(vals[3], "wiki/jarvis/auto/companies/whe.md");
  });
});
