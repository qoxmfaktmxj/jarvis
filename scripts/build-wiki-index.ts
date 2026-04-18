/**
 * scripts/build-wiki-index.ts
 *
 * Task 2 (Karpathy LLM Wiki handoff) — Index/catalog builder.
 *
 * Walks `wiki/<workspaceCode>/**` and, for each domain directory that
 * contains markdown pages, writes an `index.md` catalog file listing every
 * page under that directory. Each entry includes the page title (from
 * frontmatter), a wikilink to the page (so `wiki-reproject.ts` picks it up
 * as a graph edge), and a one-line snippet of the first non-heading
 * paragraph.
 *
 * Deterministic: this is a pure file-system pass. No DB, no LLM, no network.
 * Re-running must produce byte-identical output (sorted by relative path,
 * `\n` line endings).
 *
 * Scope (default):
 *   wiki/jarvis/auto/{infra,companies,syntheses,onboarding,reports,playbooks}/
 *   wiki/jarvis/manual/{guidebook,policies,procedures,references,onboarding}/
 *
 * Usage:
 *   pnpm exec tsx scripts/build-wiki-index.ts \
 *     [--workspace=jarvis] [--dry-run] [--root=wiki/jarvis] [--domain=infra,cases]
 *
 * Tests (no network, no DB):
 *   pnpm exec tsx --test scripts/tests/build-wiki-index.test.ts
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import {
  parseFrontmatter,
  splitFrontmatter,
} from "../packages/wiki-fs/src/index.js";
import { CATALOG_PAGE_TYPE } from "./lib/wiki-constants.js";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface PageEntry {
  /** Repo-relative POSIX path (e.g. "wiki/jarvis/auto/infra/whe/foo.md"). */
  wikiPath: string;
  /** Path relative to the wiki root (e.g. "auto/infra/whe/foo.md"). */
  relFromRoot: string;
  /** Path relative to the domain dir (e.g. "whe/foo.md"). */
  relFromDomain: string;
  /** Title — frontmatter title, else the filename without extension. */
  title: string;
  /** 120-char snippet with optional trailing ellipsis. */
  snippet: string;
}

export interface DomainIndex {
  /** POSIX-style path to the domain dir (e.g. "wiki/jarvis/auto/infra"). */
  domainDir: string;
  /** Domain dir name (e.g. "infra"). */
  domain: string;
  /** Path to write the index file (always `<domainDir>/index.md`). */
  indexPath: string;
  /** Pages collected under the domain, sorted by relFromRoot asc. */
  pages: PageEntry[];
}

export interface BuildOptions {
  workspaceCode?: string;
  /** Path to the wiki root (e.g. "wiki/jarvis"). */
  rootDir?: string;
  dryRun?: boolean;
  /** Comma-separated list; default = all discovered domain dirs. */
  domainFilter?: string[];
  /** ISO 8601 UTC timestamp override (for test determinism). */
  now?: string;
}

export interface BuildReport {
  domainsScanned: number;
  indicesWritten: number;
  pagesListed: number;
  skipped: string[];
}

// ─────────────────────────────────────────────────────────────
// Default domain scope (documentation only)
// ─────────────────────────────────────────────────────────────

/**
 * The domains the wiki pipeline currently populates. Leaf directories on
 * disk that don't match this list are still picked up at runtime — this
 * constant just documents the known-good set.
 */
export const DEFAULT_DOMAIN_DIRS: Record<string, string[]> = {
  auto: [
    "infra",
    "companies",
    "syntheses",
    "onboarding",
    "reports",
    "playbooks",
  ],
  manual: ["guidebook", "policies", "procedures", "references", "onboarding"],
};

// ─────────────────────────────────────────────────────────────
// Pure helpers
// ─────────────────────────────────────────────────────────────

/**
 * Extracts a one-line snippet (≤120 chars) from a markdown body.
 *
 * - Strips frontmatter if present.
 * - Drops leading `#`-headings and horizontal rules.
 * - Takes the first non-empty paragraph.
 * - Collapses all whitespace (incl. newlines) to single spaces.
 * - Truncates at 120 chars and appends `…` if truncation occurred.
 */
export function extractSnippet(content: string): string {
  if (!content) return "";

  // 1) Strip frontmatter block (`---\n...\n---`).
  let body = content;
  try {
    const split = splitFrontmatter(content);
    if (split && typeof split.body === "string") {
      body = split.body;
    }
  } catch {
    body = content;
  }

  // 2) Walk lines, skip headings and blanks, find the first paragraph.
  const lines = body.split(/\r?\n/);
  const paragraph: string[] = [];
  let started = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!started) {
      if (line.length === 0) continue;
      if (/^#{1,6}\s/.test(line)) continue; // ATX heading
      if (/^-{3,}$/.test(line) || /^_{3,}$/.test(line)) continue; // HR / fm marker
      paragraph.push(line);
      started = true;
      continue;
    }
    // Inside an accumulating paragraph: stop at the first blank line.
    if (line.length === 0) break;
    paragraph.push(line);
  }

  if (paragraph.length === 0) return "";

  // 3) Collapse whitespace.
  const collapsed = paragraph.join(" ").replace(/\s+/g, " ").trim();

  // 4) Truncate.
  const LIMIT = 120;
  if (collapsed.length <= LIMIT) return collapsed;
  return `${collapsed.slice(0, LIMIT).trimEnd()}…`;
}

/**
 * Lenient title extractor: tries `parseFrontmatter`, falls back to a
 * regex-scan of the raw frontmatter block when the strict parser throws
 * (e.g. on manual-authored `type: guidebook` which is not in the wiki-fs
 * enum). Ultimate fallback is the filename without `.md`.
 */
function extractTitle(content: string, fileName: string): string {
  const fallback = fileName.replace(/\.md$/i, "");
  try {
    const parsed = parseFrontmatter(content);
    const fmTitle = parsed?.data?.title;
    if (typeof fmTitle === "string" && fmTitle.trim().length > 0) {
      return fmTitle.trim();
    }
  } catch {
    const split = splitFrontmatter(content);
    if (split && split.frontmatter) {
      const m = /^title:\s*(?:"([^"]*)"|'([^']*)'|(.+))$/m.exec(
        split.frontmatter,
      );
      if (m) {
        const t = (m[1] ?? m[2] ?? m[3] ?? "").trim();
        if (t.length > 0) return t;
      }
    }
  }
  return fallback;
}

/**
 * Recursively collects every `.md` file under `domainDir`, excluding any
 * existing `index.md` at any level (to avoid self-reference). Paths are
 * returned as repo-relative POSIX strings, sorted ascending by
 * `relFromRoot` using locale="en-US" for stable non-ASCII ordering.
 */
export async function collectPages(
  domainDir: string,
  wikiRoot: string,
): Promise<PageEntry[]> {
  const entries: PageEntry[] = [];
  const cwd = process.cwd();

  async function walk(dir: string): Promise<void> {
    let dirents;
    try {
      dirents = await fs.readdir(dir, { withFileTypes: true });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
      throw err;
    }
    for (const d of dirents) {
      const abs = path.join(dir, d.name);
      if (d.isDirectory()) {
        await walk(abs);
        continue;
      }
      if (!d.isFile()) continue;
      if (!d.name.endsWith(".md")) continue;
      // Exclude any existing index.md so re-runs don't cite themselves.
      if (d.name === "index.md") continue;

      const rel = path.relative(cwd, abs).replace(/\\/g, "/");
      const relFromRoot = path.relative(wikiRoot, abs).replace(/\\/g, "/");
      const relFromDomain = path.relative(domainDir, abs).replace(/\\/g, "/");

      let raw: string;
      try {
        raw = await fs.readFile(abs, "utf-8");
      } catch {
        continue;
      }

      entries.push({
        wikiPath: rel,
        relFromRoot,
        relFromDomain,
        title: extractTitle(raw, d.name),
        snippet: extractSnippet(raw),
      });
    }
  }

  await walk(domainDir);

  // Deterministic sort: by relFromRoot ascending, en-US locale so non-ASCII
  // (Hangul, CJK) orderings are stable for *this* Node version.
  // Caveat: `Intl.Collator` ultimately depends on the ICU tables bundled
  // with Node — a major Node upgrade that bumps ICU *can* re-shuffle ties
  // involving certain CJK / Hangul characters. Callers that need permanent
  // byte-equality should snapshot outputs in tests (see
  // `scripts/tests/build-wiki-index.test.ts`) rather than trust forever.
  const collator = new Intl.Collator("en-US");
  entries.sort((a, b) => collator.compare(a.relFromRoot, b.relFromRoot));
  return entries;
}

/**
 * Groups pages by their first path segment (relative to the domain dir).
 *
 * - Flat layout (all pages at the same level) → a single `{ "Pages": [...] }`
 *   bucket.
 * - 2-level layout (at least one page in a subdirectory) → buckets keyed by
 *   the first subdir name; top-level pages get grouped under `"Pages"`.
 *
 * Bucket insertion order is stable: first-seen wins, iteration preserves
 * the sorted order established by `collectPages`.
 */
export function groupBySubdir(
  pages: PageEntry[],
): Map<string, PageEntry[]> {
  const buckets = new Map<string, PageEntry[]>();
  if (pages.length === 0) return buckets;

  const hasSubdir = pages.some((p) => p.relFromDomain.includes("/"));

  if (!hasSubdir) {
    buckets.set("Pages", pages.slice());
    return buckets;
  }

  for (const page of pages) {
    const idx = page.relFromDomain.indexOf("/");
    const key = idx === -1 ? "Pages" : page.relFromDomain.slice(0, idx);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.push(page);
    } else {
      buckets.set(key, [page]);
    }
  }

  return buckets;
}

/**
 * Renders the complete `index.md` file contents.
 *
 * The output is terminated by a single trailing `\n`. All line endings are
 * `\n`. Re-rendering with identical inputs (including `generatedAt`) yields
 * byte-identical output — callers verify this in the test suite.
 */
export function renderIndex(args: {
  domain: string;
  relFromWiki: string;
  pages: PageEntry[];
  generatedAt: string;
}): string {
  const { domain, relFromWiki, pages, generatedAt } = args;
  const pageCount = pages.length;

  // Capitalise the first letter for a nicer title; preserve the rest.
  const prettyDomain =
    domain.length > 0
      ? domain[0].toLocaleUpperCase("en-US") + domain.slice(1)
      : domain;

  const fm = [
    "---",
    `title: "${prettyDomain} Index"`,
    `type: ${CATALOG_PAGE_TYPE}`,
    "authority: auto",
    "sensitivity: INTERNAL",
    `domain: ${domain}`,
    "generated_by: scripts/build-wiki-index.ts",
    `generated_at: ${generatedAt}`,
    `page_count: ${pageCount}`,
    "---",
    "",
  ];

  const body: string[] = [];
  body.push(`# ${prettyDomain} Index`);
  body.push("");
  body.push(
    `Auto-generated catalog of ${pageCount} page${pageCount === 1 ? "" : "s"} under \`${relFromWiki}\`.`,
  );
  body.push("");

  const groups = groupBySubdir(pages);
  for (const [groupName, groupPages] of groups) {
    body.push(`## ${groupName}`);
    body.push("");
    for (const p of groupPages) {
      // Slug = path relative to the wiki root, no `.md` extension.
      const slug = p.relFromRoot.replace(/\.md$/i, "");
      // Escape `|` in title to avoid breaking the wikilink. Titles with `]]`
      // would also break; replace with a safe Unicode variant.
      const safeTitle = p.title.replace(/\|/g, "\\|").replace(/]]/g, "]\u200B]");
      const snippet = p.snippet.length > 0 ? ` — ${p.snippet}` : "";
      body.push(`- [[${slug}|${safeTitle}]]${snippet}`);
    }
    body.push("");
  }

  // Join with `\n`. We collapse trailing blank lines from the body and end
  // the file with a single `\n` so re-running is byte-identical.
  return fm.join("\n") + body.join("\n").replace(/\n+$/, "") + "\n";
}

// ─────────────────────────────────────────────────────────────
// Discovery + write
// ─────────────────────────────────────────────────────────────

/**
 * Scans the wiki root for domain directories. A domain directory is a
 * level-2 subdirectory under `wikiRoot/auto` or `wikiRoot/manual`. Whether
 * it has any markdown pages is decided later by `collectPages` — empty
 * domains are skipped by `runBuildIndex`.
 */
export async function discoverDomains(
  wikiRoot: string,
): Promise<Array<{ domain: string; domainDir: string }>> {
  const found: Array<{ domain: string; domainDir: string }> = [];

  for (const parent of ["auto", "manual"]) {
    const parentDir = path.join(wikiRoot, parent);
    let dirents;
    try {
      dirents = await fs.readdir(parentDir, { withFileTypes: true });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw err;
    }
    for (const d of dirents) {
      if (!d.isDirectory()) continue;
      // Skip hidden/asset dirs (_assets, .cache, etc.).
      if (d.name.startsWith("_") || d.name.startsWith(".")) continue;
      found.push({ domain: d.name, domainDir: path.join(parentDir, d.name) });
    }
  }

  // en-US collator for domain-dir order — same ICU-stability caveat as
  // `collectPages`. Used so `discoverDomains` output is stable per Node
  // version; tests assert via snapshots when byte-equality matters.
  const collator = new Intl.Collator("en-US");
  found.sort((a, b) => collator.compare(a.domainDir, b.domainDir));
  return found;
}

/**
 * Writes a single domain's `index.md`. In `--dry-run` mode, prints a
 * preview instead of touching disk. Returns `{ wrote, content }` so tests
 * / callers can assert on the rendered payload.
 */
export async function writeIndex(
  idx: DomainIndex,
  generatedAt: string,
  dryRun: boolean,
): Promise<{ wrote: boolean; content: string }> {
  const wikiRoot = path.dirname(path.dirname(idx.domainDir));
  const relFromWiki = path
    .relative(wikiRoot, idx.domainDir)
    .replace(/\\/g, "/");

  const content = renderIndex({
    domain: idx.domain,
    relFromWiki,
    pages: idx.pages,
    generatedAt,
  });

  if (dryRun) {
    console.log(
      `[build-wiki-index] DRY ${JSON.stringify(idx.indexPath)} (${idx.pages.length} pages)`,
    );
    for (const line of content.split("\n").slice(0, 12)) {
      console.log(`  | ${line}`);
    }
    return { wrote: false, content };
  }

  await fs.writeFile(idx.indexPath, content, "utf-8");
  console.log(
    `[build-wiki-index] wrote ${JSON.stringify(idx.indexPath)} (${idx.pages.length} pages)`,
  );
  return { wrote: true, content };
}

// ─────────────────────────────────────────────────────────────
// Orchestrator
// ─────────────────────────────────────────────────────────────

export async function runBuildIndex(
  opts: BuildOptions = {},
): Promise<BuildReport> {
  const workspaceCode = opts.workspaceCode ?? "jarvis";
  const wikiRoot =
    opts.rootDir ?? path.join(process.cwd(), "wiki", workspaceCode);
  const generatedAt = opts.now ?? new Date().toISOString();
  const filter = new Set((opts.domainFilter ?? []).filter(Boolean));

  console.log(
    `[build-wiki-index] workspace=${workspaceCode} root=${JSON.stringify(wikiRoot)} dry=${!!opts.dryRun}`,
  );

  const discovered = await discoverDomains(wikiRoot);
  const skipped: string[] = [];
  let indicesWritten = 0;
  let pagesListed = 0;

  for (const { domain, domainDir } of discovered) {
    if (filter.size > 0 && !filter.has(domain)) continue;

    const pages = await collectPages(domainDir, wikiRoot);
    if (pages.length === 0) {
      skipped.push(domainDir);
      continue;
    }

    const idx: DomainIndex = {
      domainDir,
      domain,
      indexPath: path.join(domainDir, "index.md"),
      pages,
    };

    const r = await writeIndex(idx, generatedAt, !!opts.dryRun);
    if (r.wrote) indicesWritten++;
    pagesListed += pages.length;
  }

  return {
    domainsScanned: discovered.length,
    indicesWritten,
    pagesListed,
    skipped,
  };
}

// ─────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────

function parseCliArgs(argv: string[]): BuildOptions {
  const opts: BuildOptions = {};
  for (const arg of argv) {
    if (arg === "--dry-run") opts.dryRun = true;
    else if (arg.startsWith("--workspace="))
      opts.workspaceCode = arg.split("=")[1];
    else if (arg.startsWith("--root=")) opts.rootDir = arg.split("=")[1];
    else if (arg.startsWith("--domain=")) {
      opts.domainFilter = arg.split("=")[1].split(",").filter(Boolean);
    }
  }
  return opts;
}

const executedAsMain = (() => {
  try {
    const argv1 = process.argv[1];
    if (!argv1) return false;
    const mainPath = fileURLToPath(import.meta.url);
    return path.resolve(mainPath) === path.resolve(argv1);
  } catch {
    return false;
  }
})();

if (executedAsMain) {
  const opts = parseCliArgs(process.argv.slice(2));
  runBuildIndex(opts)
    .then((r) => {
      console.log(
        `[build-wiki-index] done: domainsScanned=${r.domainsScanned} indicesWritten=${r.indicesWritten} pagesListed=${r.pagesListed} skipped=${r.skipped.length}`,
      );
      if (r.skipped.length > 0) {
        // JSON.stringify keeps non-ASCII path segments from mojibake'ing
        // through Windows consoles (cp949) that don't handle raw Unicode.
        console.log(
          `[build-wiki-index] skipped (no pages): ${JSON.stringify(r.skipped)}`,
        );
      }
      process.exit(0);
    })
    .catch((err) => {
      console.error("[build-wiki-index] FAILED:", err);
      process.exit(1);
    });
}
