/**
 * scripts/tests/weave-wikilinks.test.ts
 *
 * Unit tests for weave-wikilinks (Karpathy LLM Wiki Task 3 — automatic
 * infra → companies wikilink weaver).
 *
 * Run:
 *   pnpm exec tsx --test scripts/tests/weave-wikilinks.test.ts
 *
 * No DB, no network. In-memory fixtures under an OS temp dir.
 */

import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  buildCompanyIndex,
  findMatchForInfra,
  hasExistingLink,
  insertRelatedLink,
  weavePage,
  type CompanyIndex,
  type CompanyEntry,
} from "../weave-wikilinks.ts";

// ─────────────────────────────────────────────────────────────
// Fixture helpers
// ─────────────────────────────────────────────────────────────

function companyDoc(title: string, tagCode: string): string {
  return [
    "---",
    `title: "${title}"`,
    "type: synthesis",
    "authority: auto",
    "sensitivity: INTERNAL",
    "domain: cases",
    `tags: ["domain/cases", "company", "company/${tagCode}"]`,
    "---",
    "",
    `# ${title}`,
    "",
  ].join("\n");
}

function infraDoc(opts: {
  title: string;
  companyCd: string;
  tagCode?: string;
  body?: string;
}): string {
  const tag = opts.tagCode ?? opts.companyCd.toLowerCase();
  return [
    "---",
    `title: "${opts.title}"`,
    "type: infra-runbook",
    "authority: auto",
    "sensitivity: INTERNAL",
    "domain: infra",
    `tags: ["domain/infra", "company/${tag}", "env/운영"]`,
    "infra:",
    `  companyCd: "${opts.companyCd}"`,
    '  envType: "운영"',
    "---",
    "",
    opts.body ?? `# ${opts.title}\n\n## Summary\nSome body.\n`,
  ].join("\n");
}

async function mkTmp(prefix: string): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

// ─────────────────────────────────────────────────────────────
// buildCompanyIndex
// ─────────────────────────────────────────────────────────────

describe("buildCompanyIndex", () => {
  let dir: string;

  before(async () => {
    dir = await mkTmp("weave-idx-");
    await fs.writeFile(
      path.join(dir, "01-foo.md"),
      companyDoc("Foo Corp (01)", "01"),
      "utf-8",
    );
    await fs.writeFile(
      path.join(dir, "e-HR-KCAR.md"),
      companyDoc("[e-HR] KCAR", "e-HR-KCAR"),
      "utf-8",
    );
    await fs.writeFile(
      path.join(dir, "e-HR-BGF.md"),
      companyDoc("[e-HR] BGF리테일", "e-HR-BGF리테일"),
      "utf-8",
    );
    // Duplicate of tag "01" — should be reported as a warning and ignored.
    await fs.writeFile(
      path.join(dir, "01-dup.md"),
      companyDoc("Foo Corp duplicate", "01"),
      "utf-8",
    );
  });

  after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  test("builds a map from tagCode → entry", async () => {
    const idx = await buildCompanyIndex(dir);
    assert.equal(idx.all.length, 4);

    const hit01 = idx.byTagCode.get("01");
    assert.ok(hit01);
    // Lexicographic sort: "01-dup.md" < "01-foo.md", so 01-dup registers
    // the tag first. Either way we just assert it's one of the two.
    assert.ok(["01-foo", "01-dup"].includes(hit01!.stem));

    const hitKcar = idx.byTagCode.get("e-hr-kcar");
    assert.ok(hitKcar);
    assert.equal(hitKcar!.stem, "e-HR-KCAR");
    assert.equal(hitKcar!.title, "[e-HR] KCAR");

    // e-hr-stripped form reachable via byStripped
    assert.equal(idx.byStripped.get("kcar")!.stem, "e-HR-KCAR");
  });

  test("handles duplicate tag-codes gracefully (first wins, warning logged)", async () => {
    const idx = await buildCompanyIndex(dir);
    const dupWarning = idx.warnings.find((w) =>
      w.includes('duplicate company tag-code "01"'),
    );
    assert.ok(dupWarning, "expected a duplicate warning for tag 01");
  });

  test("returns empty index when dir is missing (ENOENT)", async () => {
    const idx = await buildCompanyIndex(path.join(dir, "does-not-exist"));
    assert.equal(idx.all.length, 0);
    assert.equal(idx.byTagCode.size, 0);
  });
});

// ─────────────────────────────────────────────────────────────
// findMatchForInfra
// ─────────────────────────────────────────────────────────────

describe("findMatchForInfra", () => {
  // Build an in-memory index without hitting disk by hand-constructing it.
  function makeIndex(
    entries: Array<Omit<CompanyEntry, "absPath">>,
  ): CompanyIndex {
    const idx: CompanyIndex = {
      byTagCode: new Map(),
      byStripped: new Map(),
      all: [],
      warnings: [],
    };
    for (const e of entries) {
      const full: CompanyEntry = { ...e, absPath: `/mem/${e.stem}.md` };
      idx.byTagCode.set(full.tagCodeLower, full);
      const stripped = full.tagCodeLower.startsWith("e-hr-")
        ? full.tagCodeLower.slice("e-hr-".length)
        : full.tagCodeLower;
      if (stripped !== full.tagCodeLower) idx.byStripped.set(stripped, full);
      idx.all.push(full);
    }
    return idx;
  }

  test("returns match when companyCd resolves exactly", () => {
    const idx = makeIndex([
      { stem: "01-foo", title: "Foo Corp", tagCodeLower: "01", tagCode: "01" },
    ]);
    const hit = findMatchForInfra(
      {
        absPath: "/x.md",
        wikiPath: "wiki/jarvis/auto/infra/01/x.md",
        companyCd: "01",
        tagCodes: ["01"],
      },
      idx,
    );
    assert.ok(hit);
    assert.equal(hit!.stem, "01-foo");
  });

  test("returns match via e-HR prefix scan (infra BGF → company e-HR-BGF리테일)", () => {
    const idx = makeIndex([
      {
        stem: "e-HR-BGF",
        title: "[e-HR] BGF리테일",
        tagCodeLower: "e-hr-bgf리테일",
        tagCode: "e-HR-BGF리테일",
      },
    ]);
    const hit = findMatchForInfra(
      {
        absPath: "/x.md",
        wikiPath: "wiki/jarvis/auto/infra/bgf/x.md",
        companyCd: "BGF",
        tagCodes: ["bgf"],
      },
      idx,
    );
    assert.ok(hit);
    assert.equal(hit!.stem, "e-HR-BGF");
  });

  test("returns null when no company page exists for that code", () => {
    const idx = makeIndex([
      {
        stem: "e-HR-KCAR",
        title: "KCAR",
        tagCodeLower: "e-hr-kcar",
        tagCode: "e-HR-KCAR",
      },
    ]);
    const hit = findMatchForInfra(
      {
        absPath: "/x.md",
        wikiPath: "wiki/jarvis/auto/infra/zzz/x.md",
        companyCd: "ZZZ",
        tagCodes: ["zzz"],
      },
      idx,
    );
    assert.equal(hit, null);
  });

  test("e-HR-stripped map resolves bare infra code (KCAR → e-HR-KCAR)", () => {
    const idx = makeIndex([
      {
        stem: "e-HR-KCAR",
        title: "[e-HR] KCAR",
        tagCodeLower: "e-hr-kcar",
        tagCode: "e-HR-KCAR",
      },
    ]);
    const hit = findMatchForInfra(
      {
        absPath: "/x.md",
        wikiPath: "wiki/jarvis/auto/infra/kcar/x.md",
        companyCd: "KCAR",
        tagCodes: ["kcar"],
      },
      idx,
    );
    assert.ok(hit);
    assert.equal(hit!.stem, "e-HR-KCAR");
  });

  test("returns null + warns on ambiguous prefix matches", () => {
    const idx = makeIndex([
      {
        stem: "e-HR-BGF1",
        title: "[e-HR] BGF리테일",
        tagCodeLower: "e-hr-bgf리테일",
        tagCode: "e-HR-BGF리테일",
      },
      {
        stem: "e-HR-BGF2",
        title: "[e-HR] BGF마트",
        tagCodeLower: "e-hr-bgf마트",
        tagCode: "e-HR-BGF마트",
      },
    ]);
    const msgs: string[] = [];
    const hit = findMatchForInfra(
      {
        absPath: "/x.md",
        wikiPath: "wiki/jarvis/auto/infra/bgf/x.md",
        companyCd: "BGF",
        tagCodes: ["bgf"],
      },
      idx,
      (m) => msgs.push(m),
    );
    assert.equal(hit, null);
    assert.ok(
      msgs.some((m) => m.includes("ambiguous prefix match")),
      "expected ambiguity warning",
    );
  });
});

// ─────────────────────────────────────────────────────────────
// hasExistingLink
// ─────────────────────────────────────────────────────────────

describe("hasExistingLink", () => {
  test("true when body contains [[auto/companies/XXX]]", () => {
    const body = "blah\n[[auto/companies/01-foo]]\nmore";
    assert.equal(hasExistingLink(body, "01-foo"), true);
  });

  test("true when link has alias pipe [[auto/companies/XXX|title]]", () => {
    const body = "see [[auto/companies/e-HR-KCAR|KCAR company]] for more";
    assert.equal(hasExistingLink(body, "e-HR-KCAR"), true);
  });

  test("true when link has anchor [[auto/companies/XXX#h1]]", () => {
    const body = "jump to [[auto/companies/01-foo#overview]]";
    assert.equal(hasExistingLink(body, "01-foo"), true);
  });

  test("false when link points elsewhere", () => {
    const body = "unrelated [[auto/companies/other-co]] link";
    assert.equal(hasExistingLink(body, "01-foo"), false);
  });

  test("false when body has no wikilinks at all", () => {
    assert.equal(hasExistingLink("# title\n\nplain text", "01-foo"), false);
  });
});

// ─────────────────────────────────────────────────────────────
// insertRelatedLink
// ─────────────────────────────────────────────────────────────

describe("insertRelatedLink", () => {
  test("appends ## Related when absent", () => {
    const body = "# Title\n\n## Summary\nHello\n";
    const res = insertRelatedLink(body, "01-foo", "Foo Corp");
    assert.equal(res.changed, true);
    assert.ok(res.newBody.includes("## Related"));
    assert.ok(
      res.newBody.endsWith("- Company: [[auto/companies/01-foo|Foo Corp]]\n"),
    );
  });

  test("inserts bullet into existing ## Related", () => {
    const body = [
      "# Title",
      "",
      "## Related",
      "- Other: [[auto/companies/other-co|Other]]",
      "",
      "## Footer",
      "tail",
      "",
    ].join("\n");
    const res = insertRelatedLink(body, "01-foo", "Foo Corp");
    assert.equal(res.changed, true);
    const relatedIdx = res.newBody.indexOf("## Related");
    const footerIdx = res.newBody.indexOf("## Footer");
    const block = res.newBody.slice(relatedIdx, footerIdx);
    assert.ok(block.includes("[[auto/companies/other-co|Other]]"));
    assert.ok(block.includes("[[auto/companies/01-foo|Foo Corp]]"));
    assert.ok(res.newBody.includes("## Footer\ntail"));
  });

  test("does NOT duplicate when bullet already present", () => {
    const body = [
      "# Title",
      "",
      "## Related",
      "- Company: [[auto/companies/01-foo|Foo Corp]]",
      "",
    ].join("\n");
    const res = insertRelatedLink(body, "01-foo", "Foo Corp");
    assert.equal(res.changed, false);
    assert.equal(res.newBody, body);
  });

  test("does NOT duplicate when link present anywhere in body", () => {
    const body = "# Title\n\nsee [[auto/companies/01-foo]] above\n";
    const res = insertRelatedLink(body, "01-foo", "Foo Corp");
    assert.equal(res.changed, false);
    assert.equal(res.newBody, body);
  });
});

// ─────────────────────────────────────────────────────────────
// weavePage (end-to-end)
// ─────────────────────────────────────────────────────────────

describe("weavePage (end-to-end, in-memory fixture)", () => {
  let companiesDir: string;

  before(async () => {
    companiesDir = await mkTmp("weave-e2e-");
    await fs.writeFile(
      path.join(companiesDir, "01-foo.md"),
      companyDoc("Foo Corp (01)", "01"),
      "utf-8",
    );
  });

  after(async () => {
    await fs.rm(companiesDir, { recursive: true, force: true });
  });

  test("weaves a link on first run, idempotent on second", async () => {
    const idx = await buildCompanyIndex(companiesDir);
    const infra = infraDoc({
      title: "01 운영 (VPN) Runbook",
      companyCd: "01",
    });

    const first = weavePage({
      content: infra,
      wikiPath: "wiki/jarvis/auto/infra/01/op.md",
      index: idx,
    });
    assert.equal(first.reason, "ok");
    assert.equal(first.changed, true);
    assert.ok(
      first.newContent.includes("[[auto/companies/01-foo|Foo Corp (01)]]"),
    );
    // Frontmatter preserved verbatim (starts with the same block)
    assert.ok(
      first.newContent.startsWith(`---\ntitle: "01 운영 (VPN) Runbook"`),
    );

    // Second pass on the already-woven content: no change, byte-identical.
    const second = weavePage({
      content: first.newContent,
      wikiPath: "wiki/jarvis/auto/infra/01/op.md",
      index: idx,
    });
    assert.equal(second.changed, false);
    assert.equal(second.reason, "already-linked");
    assert.equal(second.newContent, first.newContent);
  });

  test("skips pages whose frontmatter type is index", async () => {
    const idx = await buildCompanyIndex(companiesDir);
    const indexPage = [
      "---",
      'title: "Infra Catalog"',
      "type: index",
      "authority: auto",
      "sensitivity: INTERNAL",
      'tags: ["company/01"]',
      "infra:",
      '  companyCd: "01"',
      "---",
      "",
      "# Catalog",
      "",
    ].join("\n");
    const res = weavePage({
      content: indexPage,
      wikiPath: "wiki/jarvis/auto/infra/_index.md",
      index: idx,
    });
    assert.equal(res.changed, false);
    assert.equal(res.reason, "index-skip");
    assert.equal(res.newContent, indexPage);
  });

  test("skips pages with no-match and does not modify content", async () => {
    const idx = await buildCompanyIndex(companiesDir);
    const infra = infraDoc({
      title: "ZZZ 운영 Runbook",
      companyCd: "ZZZ",
      tagCode: "zzz",
    });
    const res = weavePage({
      content: infra,
      wikiPath: "wiki/jarvis/auto/infra/zzz/op.md",
      index: idx,
    });
    assert.equal(res.reason, "no-match");
    assert.equal(res.changed, false);
    assert.equal(res.newContent, infra);
  });
});
