/**
 * scripts/weave-wikilinks.ts
 *
 * Task 3 (Karpathy LLM Wiki handoff) — Automatic wikilink weaver.
 *
 * Walks `wiki/<workspaceCode>/auto/infra/**\/*.md` and for each infra page,
 * looks up the corresponding `wiki/<workspaceCode>/auto/companies/*.md` page
 * based on the `infra.companyCd` in frontmatter (with fallback to the
 * `company/<code>` tag). When a confident match is found, a short
 * `## Related` section with a `[[auto/companies/<stem>|<title>]]` bullet
 * is appended (or merged into an existing `## Related`).
 *
 * Deterministic, idempotent, no LLM calls. Re-running produces byte-identical
 * output. Safe to run repeatedly.
 *
 * Why this exists:
 *   Currently the wiki has only 2 wikilinks across 1,322 pages. Karpathy's
 *   LLM Wiki approach requires dense cross-linking for retrieval quality.
 *   Infra pages each carry a `companyCd` in frontmatter but the body never
 *   references the company page — this closes that gap.
 *
 * Usage:
 *   pnpm exec tsx scripts/weave-wikilinks.ts \
 *     [--workspace=jarvis] [--dry-run] [--root=wiki/jarvis] [--limit=N]
 *
 * Tests (no DB, in-memory fixtures):
 *   pnpm exec tsx --test scripts/tests/weave-wikilinks.test.ts
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import {
  parseFrontmatter,
  splitFrontmatter,
  parseWikilinks,
} from "../packages/wiki-fs/src/index.js";
// Direct YAML loader — used as a lenient fallback when wiki-fs's strict
// enum validator rejects a `type` value (e.g. `type: index` from Task 2
// catalog pages, which predates the validator's enum). Mirrors the
// approach in `scripts/wiki-reproject.ts`.
import YAML from "../packages/wiki-fs/node_modules/yaml/dist/index.js";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

/** A resolved company page that can be a wikilink target. */
export interface CompanyEntry {
  /** Absolute path to the `.md` on disk. */
  absPath: string;
  /** Stem (filename without `.md`), used in `[[auto/companies/<stem>...]]`. */
  stem: string;
  /** Human-readable title from frontmatter. */
  title: string;
  /**
   * The full tag-code following `company/` (e.g. `e-HR-BGF리테일`, `01`,
   * `DGB캐피탈`). Lower-cased for matching.
   */
  tagCodeLower: string;
  /** The first `company/<x>` tag value verbatim (for logs / dedupe). */
  tagCode: string;
}

/** Map keyed by several normalized forms of the company tag-code. */
export interface CompanyIndex {
  /** Exact match: normalized tag-code → entry. */
  byTagCode: Map<string, CompanyEntry>;
  /** `e-hr-` prefix stripped → entry. */
  byStripped: Map<string, CompanyEntry>;
  /** All entries, for prefix scanning. */
  all: CompanyEntry[];
  /** Warnings accumulated while building the index. */
  warnings: string[];
}

export interface InfraMatchInput {
  absPath: string;
  wikiPath: string;
  companyCd: string | null;
  /** Company tag candidates pulled from `tags: ["company/..."]`. */
  tagCodes: string[];
}

// ─────────────────────────────────────────────────────────────
// buildCompanyIndex
// ─────────────────────────────────────────────────────────────

/**
 * Build an in-memory index of company pages under
 * `wiki/<workspaceCode>/auto/companies/`. Duplicate tag-codes keep the
 * first-seen entry (deterministic by sort order) and log a warning.
 */
export async function buildCompanyIndex(
  companiesDir: string,
): Promise<CompanyIndex> {
  const index: CompanyIndex = {
    byTagCode: new Map(),
    byStripped: new Map(),
    all: [],
    warnings: [],
  };

  let entries: string[];
  try {
    entries = await fs.readdir(companiesDir);
  } catch (err) {
    // Missing companies dir is not fatal; the caller just gets zero matches.
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return index;
    throw err;
  }

  // Sort for determinism.
  entries.sort();

  for (const name of entries) {
    if (!name.endsWith(".md")) continue;
    const absPath = path.join(companiesDir, name);
    const stat = await fs.stat(absPath);
    if (!stat.isFile()) continue;

    const content = await fs.readFile(absPath, "utf-8");
    let data: Record<string, unknown>;
    try {
      data = parseFrontmatter(content).data as Record<string, unknown>;
    } catch (err) {
      index.warnings.push(
        `[weave] skipping company page with invalid frontmatter: ${absPath} (${err instanceof Error ? err.message : String(err)})`,
      );
      continue;
    }

    const tags = Array.isArray(data["tags"])
      ? (data["tags"] as unknown[]).filter(
          (t): t is string => typeof t === "string",
        )
      : [];
    // Find the first `company/<code>` tag with a non-empty code.
    let tagCode: string | null = null;
    for (const t of tags) {
      if (t.startsWith("company/") && t.length > "company/".length) {
        tagCode = t.slice("company/".length);
        break;
      }
    }
    if (tagCode === null) {
      // No company/<code> tag — we can't map this page to an infra. Skip.
      continue;
    }

    const title =
      typeof data["title"] === "string" && data["title"].length > 0
        ? (data["title"] as string)
        : name.replace(/\.md$/, "");

    const stem = name.replace(/\.md$/, "");
    const tagCodeLower = tagCode.toLowerCase();

    const entry: CompanyEntry = {
      absPath,
      stem,
      title,
      tagCodeLower,
      tagCode,
    };

    if (index.byTagCode.has(tagCodeLower)) {
      index.warnings.push(
        `[weave] duplicate company tag-code "${tagCode}" — keeping first (${index.byTagCode.get(tagCodeLower)!.stem}), ignoring ${stem}`,
      );
    } else {
      index.byTagCode.set(tagCodeLower, entry);
    }

    // Also index by `e-hr-`-stripped form so `e-HR-KCAR` is reachable by
    // `kcar`. Only register if the stripped key isn't already claimed.
    const stripped = stripEhrPrefix(tagCodeLower);
    if (stripped !== tagCodeLower && !index.byStripped.has(stripped)) {
      index.byStripped.set(stripped, entry);
    }

    index.all.push(entry);
  }

  return index;
}

function stripEhrPrefix(lower: string): string {
  return lower.startsWith("e-hr-") ? lower.slice("e-hr-".length) : lower;
}

// ─────────────────────────────────────────────────────────────
// findMatchForInfra
// ─────────────────────────────────────────────────────────────

/**
 * Resolve the single most-confident company page for an infra page.
 *
 * Matching order (first hit wins):
 *   1. byTagCode[companyCdLower]          exact on `company/<code>` tag
 *   2. byStripped[companyCdLower]         `e-HR-<companyCd>` variant
 *   3. byTagCode[infraTagCode]            from infra `tags: [company/<x>]`
 *   4. prefix match `e-hr-<companyCd>` followed by a non-ASCII-alphanumeric
 *      boundary or end-of-string (e.g. infra BGF → `e-hr-bgf리테일`).
 *
 * Returns `null` when no confident match exists. Does NOT guess on
 * ambiguity: if multiple prefix matches hit, returns `null` and logs a
 * warning via the `warn` callback.
 */
export function findMatchForInfra(
  input: InfraMatchInput,
  index: CompanyIndex,
  warn: (msg: string) => void = () => {},
): CompanyEntry | null {
  const companyCd = input.companyCd?.trim() ?? "";
  const companyCdLower = companyCd.toLowerCase();

  // 1) Exact tag-code match.
  if (companyCdLower.length > 0) {
    const hit = index.byTagCode.get(companyCdLower);
    if (hit) return hit;
  }

  // 2) `e-hr-` stripped map.
  if (companyCdLower.length > 0) {
    const hit = index.byStripped.get(companyCdLower);
    if (hit) return hit;
  }

  // 3) Infra's own `company/<x>` tag.
  for (const rawTag of input.tagCodes) {
    const key = rawTag.toLowerCase();
    const hit = index.byTagCode.get(key) ?? index.byStripped.get(key);
    if (hit) return hit;
  }

  // 4) Prefix scan: `e-hr-<companyCd>` followed by non-ASCII (Korean) or EOS.
  if (companyCdLower.length > 0) {
    const prefix = `e-hr-${companyCdLower}`;
    const candidates = index.all.filter((e) => {
      const t = e.tagCodeLower;
      if (!t.startsWith(prefix)) return false;
      const rest = t.slice(prefix.length);
      if (rest.length === 0) return true;
      const first = rest.charCodeAt(0);
      // Accept any char that isn't ASCII letter/digit — prevents `e-hr-bg`
      // from matching `e-hr-bgfxxx` if someone ever shipped that.
      return !isAsciiAlnum(first);
    });
    if (candidates.length === 1) return candidates[0];
    if (candidates.length > 1) {
      warn(
        `[weave] ambiguous prefix match for companyCd="${companyCd}" (${candidates.length} candidates): ${candidates.map((c) => c.tagCode).join(", ")} — skipping ${input.wikiPath}`,
      );
      return null;
    }
  }

  return null;
}

function isAsciiAlnum(code: number): boolean {
  return (
    (code >= 0x30 && code <= 0x39) || // 0-9
    (code >= 0x41 && code <= 0x5a) || // A-Z
    (code >= 0x61 && code <= 0x7a) // a-z
  );
}

// ─────────────────────────────────────────────────────────────
// hasExistingLink
// ─────────────────────────────────────────────────────────────

/**
 * Returns `true` if `body` already contains a wikilink whose target
 * matches the company's `auto/companies/<stem>` path (with or without an
 * alias pipe, anchor, or leading `./`).
 *
 * Accepted targets:
 *   [[auto/companies/<stem>]]
 *   [[auto/companies/<stem>|title]]
 *   [[auto/companies/<stem>#anchor]]
 *
 * Case-sensitive target comparison (filenames are case-sensitive on *nix).
 */
export function hasExistingLink(body: string, companyStem: string): boolean {
  const canonical = `auto/companies/${companyStem}`;
  const links = parseWikilinks(body);
  for (const link of links) {
    // parseWikilinks strips anchors/aliases but keeps the target raw.
    if (link.target === canonical) return true;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────
// insertRelatedLink
// ─────────────────────────────────────────────────────────────

/**
 * Insert a `- Company: [[auto/companies/<stem>|<title>]]` bullet into the
 * page body. Appends a new `## Related` section if one doesn't exist;
 * otherwise merges into the first existing `## Related` block.
 *
 * Idempotent: if the bullet is already present (verbatim or by target),
 * returns `{ changed: false }` and the body unchanged.
 */
export function insertRelatedLink(
  body: string,
  companyStem: string,
  companyTitle: string,
): { changed: boolean; newBody: string } {
  if (hasExistingLink(body, companyStem)) {
    return { changed: false, newBody: body };
  }

  // The wiki-fs wikilink parser uses `[^\]\n]+?` between `[[` and `]]`, so
  // a `]` anywhere in the alias terminates parsing early and the whole
  // link is dropped by downstream projection (we saw this in practice:
  // alias `[e-HR] BGF리테일 — …` caused BGF/DHL/KCAR/YS infra pages to
  // record 0 links while HMM/PSNM with `[`-free titles recorded 4 each).
  // Replace `[` and `]` with their full-width analogs so the alias stays
  // readable but the parser no longer mis-terminates.
  const safeAlias = companyTitle.replace(/\[/g, "［").replace(/\]/g, "］");
  const bullet = `- Company: [[auto/companies/${companyStem}|${safeAlias}]]`;

  // Detect an existing `## Related` heading. We match at line start to
  // avoid hits inside code blocks starting at column > 0.
  const headingRegex = /^## Related\s*$/m;
  const headingMatch = headingRegex.exec(body);

  if (headingMatch === null) {
    // Append a new section at EOF. Ensure exactly one blank line before
    // the heading; the body should end with a single newline.
    const trimmedBody = body.replace(/\s+$/, "");
    const section = `\n\n## Related\n${bullet}\n`;
    return { changed: true, newBody: `${trimmedBody}${section}` };
  }

  // Merge into existing `## Related`. Find the bounds of the section:
  // from the heading line to the next `## ` heading (exclusive) or EOF.
  const headingStart = headingMatch.index;
  const afterHeading = headingStart + headingMatch[0].length;
  // Search for next top-level `## ` heading after our heading line.
  const nextHeadingRegex = /\n## /g;
  nextHeadingRegex.lastIndex = afterHeading;
  const next = nextHeadingRegex.exec(body);
  const sectionEnd = next ? next.index : body.length;

  const sectionText = body.slice(afterHeading, sectionEnd);
  // De-dupe: skip if exact bullet already present.
  if (sectionText.split(/\r?\n/).some((line) => line.trimEnd() === bullet)) {
    return { changed: false, newBody: body };
  }

  // Trim trailing whitespace inside the section, add bullet, then restore a
  // single trailing newline.
  const cleaned = sectionText.replace(/\s+$/, "");
  const insertion = `${cleaned}\n${bullet}`;
  const newBody =
    body.slice(0, afterHeading) +
    insertion +
    (next ? "\n\n" : "\n") +
    body.slice(sectionEnd).replace(/^\s+/, "");

  return { changed: true, newBody };
}

// ─────────────────────────────────────────────────────────────
// weavePage
// ─────────────────────────────────────────────────────────────

export interface WeavePageResult {
  changed: boolean;
  newContent: string;
  reason: "ok" | "no-frontmatter" | "index-skip" | "no-match" | "already-linked";
  match: CompanyEntry | null;
}

/**
 * Pure function: given the raw content of an infra page and a company
 * index, return the woven content (or reason for skipping). No file I/O.
 */
export function weavePage(args: {
  content: string;
  wikiPath: string;
  index: CompanyIndex;
  warn?: (msg: string) => void;
}): WeavePageResult {
  const { content, wikiPath, index } = args;
  const warn = args.warn ?? (() => {});

  const split = splitFrontmatter(content);
  if (split.frontmatter === null) {
    return {
      changed: false,
      newContent: content,
      reason: "no-frontmatter",
      match: null,
    };
  }

  let data: Record<string, unknown>;
  try {
    data = parseFrontmatter(content).data as Record<string, unknown>;
  } catch {
    // parseFrontmatter throws on non-enum `type` values (e.g. `index`).
    // Fall back to raw YAML so we can still detect `type: index` and skip.
    try {
      const raw = YAML.parse(split.frontmatter) as
        | Record<string, unknown>
        | null;
      if (!raw || typeof raw !== "object") {
        return {
          changed: false,
          newContent: content,
          reason: "no-frontmatter",
          match: null,
        };
      }
      data = raw;
    } catch {
      return {
        changed: false,
        newContent: content,
        reason: "no-frontmatter",
        match: null,
      };
    }
  }

  // Guard: never touch catalog/index pages.
  if (data["type"] === "index") {
    return {
      changed: false,
      newContent: content,
      reason: "index-skip",
      match: null,
    };
  }

  // Pull `infra.companyCd` and top-level company tags.
  let companyCd: string | null = null;
  const infra = data["infra"];
  if (infra && typeof infra === "object") {
    const raw = (infra as Record<string, unknown>)["companyCd"];
    if (typeof raw === "string") companyCd = raw;
    else if (typeof raw === "number") companyCd = String(raw);
  }

  const tagCodes: string[] = [];
  if (Array.isArray(data["tags"])) {
    for (const t of data["tags"] as unknown[]) {
      if (typeof t !== "string") continue;
      if (t.startsWith("company/") && t.length > "company/".length) {
        tagCodes.push(t.slice("company/".length));
      }
    }
  }

  const match = findMatchForInfra(
    { absPath: wikiPath, wikiPath, companyCd, tagCodes },
    index,
    warn,
  );
  if (match === null) {
    return {
      changed: false,
      newContent: content,
      reason: "no-match",
      match: null,
    };
  }

  const body = split.body;
  if (hasExistingLink(body, match.stem)) {
    return {
      changed: false,
      newContent: content,
      reason: "already-linked",
      match,
    };
  }

  const { changed, newBody } = insertRelatedLink(body, match.stem, match.title);
  if (!changed) {
    return {
      changed: false,
      newContent: content,
      reason: "already-linked",
      match,
    };
  }

  // Preserve original frontmatter verbatim — splitFrontmatter already gave
  // us `{ frontmatter, body }`. Reassemble with the same terminators used
  // by the schema (`---\n<yaml>\n---\n`).
  const newContent = `---\n${split.frontmatter}\n---\n${newBody}`;
  return { changed: true, newContent, reason: "ok", match };
}

// ─────────────────────────────────────────────────────────────
// Orchestrator
// ─────────────────────────────────────────────────────────────

export interface WeaveOptions {
  workspaceCode?: string;
  rootDir?: string;
  dryRun?: boolean;
  limit?: number;
}

export interface WeaveReport {
  collected: number;
  changed: number;
  alreadyLinked: number;
  noMatch: number;
  skipped: number;
  plans: Array<{ from: string; to: string; title: string }>;
  warnings: string[];
}

/**
 * Recursively collect `*.md` files under `dir` with deterministic
 * lexicographic ordering (sort at each level).
 */
async function collectMarkdown(dir: string): Promise<string[]> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = (await fs.readdir(dir, {
      withFileTypes: true,
    })) as unknown as import("node:fs").Dirent[];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  // Sort for determinism
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  const files: string[] = [];
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      const sub = await collectMarkdown(full);
      files.push(...sub);
    } else if (ent.isFile() && ent.name.endsWith(".md")) {
      files.push(full);
    }
  }
  return files;
}

export async function runWeave(opts: WeaveOptions = {}): Promise<WeaveReport> {
  const workspaceCode = opts.workspaceCode ?? "jarvis";
  const rootDir =
    opts.rootDir ?? path.join(process.cwd(), "wiki", workspaceCode);
  const infraDir = path.join(rootDir, "auto", "infra");
  const companiesDir = path.join(rootDir, "auto", "companies");

  const warnings: string[] = [];
  const warn = (msg: string) => {
    warnings.push(msg);
    console.warn(msg);
  };

  const index = await buildCompanyIndex(companiesDir);
  warnings.push(...index.warnings);
  for (const w of index.warnings) console.warn(w);
  console.log(
    `[weave] built company index: ${index.all.length} pages, ${index.byTagCode.size} unique tag-codes`,
  );

  const files = await collectMarkdown(infraDir);
  const slice = opts.limit ? files.slice(0, opts.limit) : files;
  console.log(
    `[weave] scanning ${slice.length} infra pages${opts.limit ? ` (limit=${opts.limit} of ${files.length})` : ""}`,
  );

  const report: WeaveReport = {
    collected: slice.length,
    changed: 0,
    alreadyLinked: 0,
    noMatch: 0,
    skipped: 0,
    plans: [],
    warnings,
  };

  for (const abs of slice) {
    const wikiPath = path
      .relative(process.cwd(), abs)
      .split(path.sep)
      .join("/");
    const content = await fs.readFile(abs, "utf-8");
    const result = weavePage({ content, wikiPath, index, warn });

    if (result.reason === "index-skip" || result.reason === "no-frontmatter") {
      report.skipped++;
      continue;
    }
    if (result.reason === "no-match") {
      report.noMatch++;
      continue;
    }
    if (result.reason === "already-linked") {
      report.alreadyLinked++;
      continue;
    }
    // reason === "ok"
    report.changed++;
    if (result.match) {
      report.plans.push({
        from: wikiPath,
        to: `auto/companies/${result.match.stem}`,
        title: result.match.title,
      });
    }

    if (opts.dryRun) {
      console.log(
        `[weave] (dry) ${wikiPath} → auto/companies/${result.match?.stem}`,
      );
    } else {
      // Normalize line endings to `\n` (the writer contract).
      const out = result.newContent.replace(/\r\n/g, "\n");
      await fs.writeFile(abs, out, "utf-8");
    }
  }

  console.log(
    `[weave] done: collected=${report.collected} changed=${report.changed} alreadyLinked=${report.alreadyLinked} noMatch=${report.noMatch} skipped=${report.skipped}`,
  );
  return report;
}

// ─────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────

function parseCliArgs(argv: string[]): WeaveOptions {
  const opts: WeaveOptions = {};
  for (const arg of argv) {
    if (arg === "--dry-run") opts.dryRun = true;
    else if (arg.startsWith("--workspace=")) {
      opts.workspaceCode = arg.split("=")[1];
    } else if (arg.startsWith("--root=")) {
      opts.rootDir = arg.split("=")[1];
    } else if (arg.startsWith("--limit=")) {
      opts.limit = Number(arg.split("=")[1]);
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
  runWeave(opts)
    .then((r) => {
      if (opts.dryRun) {
        console.log(`[weave] dry-run plans: ${r.plans.length}`);
      }
    })
    .catch((err) => {
      console.error(`[weave] failed:`, err);
      process.exitCode = 1;
    });
}
