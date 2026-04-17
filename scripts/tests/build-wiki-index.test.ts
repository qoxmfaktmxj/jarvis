/**
 * scripts/tests/build-wiki-index.test.ts
 *
 * Unit tests for build-wiki-index (Karpathy LLM Wiki catalog generator).
 * No DB, no network — all fixtures are synthetic files written into a
 * temp dir and cleaned up on teardown.
 *
 * Run:
 *   pnpm exec tsx --test scripts/tests/build-wiki-index.test.ts
 */

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  collectPages,
  extractSnippet,
  groupBySubdir,
  renderIndex,
  writeIndex,
  type PageEntry,
} from "../build-wiki-index.ts";

// ─────────────────────────────────────────────────────────────
// Fixture helpers (all synthetic, no production data)
// ─────────────────────────────────────────────────────────────

const FIXED_AT = "2026-01-01T00:00:00.000Z";

function fm(title: string, body: string): string {
  return [
    "---",
    `title: "${title}"`,
    "type: concept",
    "authority: auto",
    "sensitivity: INTERNAL",
    "---",
    "",
    body,
  ].join("\n");
}

async function makeFixtureTree(
  tree: Record<string, string>,
): Promise<string> {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "jarvis-build-wiki-index-"),
  );
  for (const [rel, content] of Object.entries(tree)) {
    const abs = path.join(root, rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, content, "utf-8");
  }
  return root;
}

async function rmrf(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true });
}

// ─────────────────────────────────────────────────────────────
// extractSnippet
// ─────────────────────────────────────────────────────────────

describe("extractSnippet", () => {
  test("returns empty string for empty body", () => {
    assert.equal(extractSnippet(""), "");
  });

  test("returns empty string when content is only headings and blanks", () => {
    const md = ["# H1", "", "## H2", "", "### H3", ""].join("\n");
    assert.equal(extractSnippet(md), "");
  });

  test("strips frontmatter and picks the first non-heading paragraph", () => {
    const md = [
      "---",
      'title: "T"',
      "type: concept",
      "authority: auto",
      "sensitivity: INTERNAL",
      "---",
      "",
      "# Heading",
      "",
      "First paragraph line one.",
      "First paragraph line two.",
      "",
      "Second paragraph ignored.",
    ].join("\n");
    assert.equal(
      extractSnippet(md),
      "First paragraph line one. First paragraph line two.",
    );
  });

  test("collapses runs of whitespace (incl. tabs and newlines) to single spaces", () => {
    const md = "para   with\t\ttabs\nand  double  spaces";
    assert.equal(extractSnippet(md), "para with tabs and double spaces");
  });

  test("truncates to 120 chars and appends an ellipsis when body is longer", () => {
    const body = "a".repeat(200);
    const out = extractSnippet(body);
    // 120 visible chars + the single-char ellipsis
    assert.equal(out.length, 121);
    assert.ok(out.endsWith("…"));
    assert.equal(out.slice(0, 120), "a".repeat(120));
  });

  test("does not append ellipsis when body is exactly the limit", () => {
    const body = "a".repeat(120);
    const out = extractSnippet(body);
    assert.equal(out.length, 120);
    assert.ok(!out.endsWith("…"));
  });
});

// ─────────────────────────────────────────────────────────────
// collectPages
// ─────────────────────────────────────────────────────────────

describe("collectPages", () => {
  let root: string;
  let wikiRoot: string;
  let domainDir: string;

  before(async () => {
    root = await makeFixtureTree({
      // wiki/jarvis/auto/infra/<files>
      "wiki/jarvis/auto/infra/index.md": fm("Existing Index", "stale catalog"),
      "wiki/jarvis/auto/infra/whe/row1.md": fm("Row 1", "WHE runbook row 1."),
      "wiki/jarvis/auto/infra/whe/row2.md": fm("Row 2", "WHE runbook row 2."),
      "wiki/jarvis/auto/infra/kcar/row1.md": fm("KCAR 1", "KCAR row 1."),
      "wiki/jarvis/auto/infra/README.txt": "not markdown",
    });
    wikiRoot = path.join(root, "wiki", "jarvis");
    domainDir = path.join(wikiRoot, "auto", "infra");
  });

  after(async () => {
    await rmrf(root);
  });

  test("filters out existing index.md at the domain root", async () => {
    const pages = await collectPages(domainDir, wikiRoot);
    for (const p of pages) {
      assert.ok(
        !p.relFromDomain.endsWith("index.md"),
        `index.md leaked into pages: ${p.relFromDomain}`,
      );
    }
  });

  test("only returns .md files (ignores other extensions)", async () => {
    const pages = await collectPages(domainDir, wikiRoot);
    for (const p of pages) {
      assert.ok(p.relFromDomain.endsWith(".md"));
    }
  });

  test("returns paths sorted deterministically by relFromRoot (en-US collator)", async () => {
    const pages = await collectPages(domainDir, wikiRoot);
    const rels = pages.map((p) => p.relFromRoot);
    const collator = new Intl.Collator("en-US");
    const expected = [...rels].sort((a, b) => collator.compare(a, b));
    assert.deepEqual(rels, expected);
    // Spot-check: kcar/row1 sorts before whe/row1 alphabetically.
    assert.deepEqual(rels, [
      "auto/infra/kcar/row1.md",
      "auto/infra/whe/row1.md",
      "auto/infra/whe/row2.md",
    ]);
  });

  test("extracts title from frontmatter and snippet from body", async () => {
    const pages = await collectPages(domainDir, wikiRoot);
    const kcar = pages.find((p) => p.relFromDomain === "kcar/row1.md");
    assert.ok(kcar);
    assert.equal(kcar!.title, "KCAR 1");
    assert.equal(kcar!.snippet, "KCAR row 1.");
  });
});

// ─────────────────────────────────────────────────────────────
// groupBySubdir
// ─────────────────────────────────────────────────────────────

function entry(
  relFromDomain: string,
  title = relFromDomain,
  snippet = "s",
): PageEntry {
  return {
    wikiPath: `wiki/jarvis/auto/infra/${relFromDomain}`,
    relFromRoot: `auto/infra/${relFromDomain}`,
    relFromDomain,
    title,
    snippet,
  };
}

describe("groupBySubdir", () => {
  test("returns an empty map for zero pages", () => {
    const g = groupBySubdir([]);
    assert.equal(g.size, 0);
  });

  test("flat layout (no subdirectories) → single 'Pages' group", () => {
    const pages = [entry("a.md"), entry("b.md"), entry("c.md")];
    const g = groupBySubdir(pages);
    assert.equal(g.size, 1);
    assert.ok(g.has("Pages"));
    assert.equal(g.get("Pages")!.length, 3);
  });

  test("2-level layout groups by first subdirectory name", () => {
    const pages = [
      entry("kcar/row1.md"),
      entry("whe/row1.md"),
      entry("whe/row2.md"),
    ];
    const g = groupBySubdir(pages);
    assert.equal(g.size, 2);
    assert.ok(g.has("kcar"));
    assert.ok(g.has("whe"));
    assert.equal(g.get("kcar")!.length, 1);
    assert.equal(g.get("whe")!.length, 2);
  });

  test("mixes flat + nested: top-level files go under 'Pages', others by subdir", () => {
    const pages = [
      entry("top.md"),
      entry("whe/row1.md"),
      entry("whe/row2.md"),
    ];
    const g = groupBySubdir(pages);
    assert.ok(g.has("Pages"));
    assert.ok(g.has("whe"));
    assert.equal(g.get("Pages")!.length, 1);
    assert.equal(g.get("whe")!.length, 2);
  });
});

// ─────────────────────────────────────────────────────────────
// renderIndex
// ─────────────────────────────────────────────────────────────

describe("renderIndex", () => {
  const pages: PageEntry[] = [
    {
      wikiPath: "wiki/jarvis/auto/infra/kcar/row1.md",
      relFromRoot: "auto/infra/kcar/row1.md",
      relFromDomain: "kcar/row1.md",
      title: "KCAR 1",
      snippet: "KCAR row 1.",
    },
    {
      wikiPath: "wiki/jarvis/auto/infra/whe/row1.md",
      relFromRoot: "auto/infra/whe/row1.md",
      relFromDomain: "whe/row1.md",
      title: "WHE 1",
      snippet: "WHE row 1.",
    },
  ];

  test("emits frontmatter with page_count matching input length", () => {
    const out = renderIndex({
      domain: "infra",
      relFromWiki: "auto/infra",
      pages,
      generatedAt: FIXED_AT,
    });
    assert.match(out, /^---\n/);
    assert.match(out, /\ntype: index\n/);
    assert.match(out, /\nauthority: auto\n/);
    assert.match(out, /\nsensitivity: INTERNAL\n/);
    assert.match(out, /\ndomain: infra\n/);
    assert.match(out, /\ngenerated_by: scripts\/build-wiki-index\.ts\n/);
    assert.match(out, new RegExp(`\\ngenerated_at: ${FIXED_AT}\\n`));
    assert.match(out, /\npage_count: 2\n/);
    // Trailing frontmatter delimiter on its own line, followed by the H1.
    assert.match(out, /\n---\n# /);
  });

  test("every entry is a wikilink line `- [[slug|title]] — snippet`", () => {
    const out = renderIndex({
      domain: "infra",
      relFromWiki: "auto/infra",
      pages,
      generatedAt: FIXED_AT,
    });
    // slug = relFromRoot minus `.md`
    assert.ok(
      out.includes("- [[auto/infra/kcar/row1|KCAR 1]] — KCAR row 1."),
      `missing kcar wikilink:\n${out}`,
    );
    assert.ok(
      out.includes("- [[auto/infra/whe/row1|WHE 1]] — WHE row 1."),
      `missing whe wikilink:\n${out}`,
    );
  });

  test("re-rendering the same input yields byte-identical output (determinism)", () => {
    const a = renderIndex({
      domain: "infra",
      relFromWiki: "auto/infra",
      pages,
      generatedAt: FIXED_AT,
    });
    const b = renderIndex({
      domain: "infra",
      relFromWiki: "auto/infra",
      pages,
      generatedAt: FIXED_AT,
    });
    assert.equal(a, b);
  });

  test("uses only `\\n` line endings (no `\\r`)", () => {
    const out = renderIndex({
      domain: "infra",
      relFromWiki: "auto/infra",
      pages,
      generatedAt: FIXED_AT,
    });
    assert.ok(!out.includes("\r"), "output contains CR character");
  });

  test("flat layout emits a single `## Pages` heading", () => {
    const flat: PageEntry[] = [
      {
        wikiPath: "wiki/jarvis/manual/guidebook/a.md",
        relFromRoot: "manual/guidebook/a.md",
        relFromDomain: "a.md",
        title: "A",
        snippet: "a snippet",
      },
      {
        wikiPath: "wiki/jarvis/manual/guidebook/b.md",
        relFromRoot: "manual/guidebook/b.md",
        relFromDomain: "b.md",
        title: "B",
        snippet: "b snippet",
      },
    ];
    const out = renderIndex({
      domain: "guidebook",
      relFromWiki: "manual/guidebook",
      pages: flat,
      generatedAt: FIXED_AT,
    });
    assert.match(out, /\n## Pages\n/);
    // Should NOT have a per-subdir heading for a flat layout.
    assert.ok(!/\n## [^P]/.test(out), `unexpected subgroup heading: ${out}`);
  });

  test("omits snippet suffix when snippet is empty", () => {
    const out = renderIndex({
      domain: "infra",
      relFromWiki: "auto/infra",
      pages: [
        {
          wikiPath: "wiki/jarvis/auto/infra/empty.md",
          relFromRoot: "auto/infra/empty.md",
          relFromDomain: "empty.md",
          title: "Empty",
          snippet: "",
        },
      ],
      generatedAt: FIXED_AT,
    });
    // No em-dash or snippet portion
    assert.ok(out.includes("- [[auto/infra/empty|Empty]]\n"));
    assert.ok(!out.includes("- [[auto/infra/empty|Empty]] —"));
  });
});

// ─────────────────────────────────────────────────────────────
// writeIndex (dry-run only — real writes are exercised manually)
// ─────────────────────────────────────────────────────────────

describe("writeIndex", () => {
  test("dry-run does not touch disk and returns the rendered content", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "jarvis-write-index-"),
    );
    try {
      const domainDir = path.join(root, "wiki", "jarvis", "auto", "infra");
      await fs.mkdir(domainDir, { recursive: true });
      const idx = {
        domainDir,
        domain: "infra",
        indexPath: path.join(domainDir, "index.md"),
        pages: [
          {
            wikiPath: "wiki/jarvis/auto/infra/a.md",
            relFromRoot: "auto/infra/a.md",
            relFromDomain: "a.md",
            title: "A",
            snippet: "a",
          },
        ],
      };
      const r = await writeIndex(idx, FIXED_AT, /* dryRun */ true);
      assert.equal(r.wrote, false);
      assert.ok(r.content.startsWith("---\n"));
      // Verify disk untouched
      await assert.rejects(() => fs.access(idx.indexPath));
    } finally {
      await rmrf(root);
    }
  });
});
