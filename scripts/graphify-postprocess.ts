/**
 * scripts/graphify-postprocess.ts
 *
 * Task 15 — Graphify raw output (.md, no frontmatter) → Jarvis derived/code 페이지 변환.
 * 사용자 Task 17 (EHR5 수동 Graphify) 지원 도구.
 *
 * Usage:
 *   pnpm exec tsx scripts/graphify-postprocess.ts \
 *     --input=<dir> --output=<dir> --module=<NAME> \
 *     [--source-prefix=ehr5/] [--dry-run]
 *
 * Input directory structure (expected):
 *   graphify-out-<MODULE>/
 *   ├── pages/*.md          — Graphify raw pages, no frontmatter
 *   ├── graph.json          — optional, copied to output/_graph-snapshots/
 *   └── graph.html          — optional
 *
 * Output directory:
 *   wiki/jarvis/auto/derived/code/<MODULE>/
 *   ├── <kind>s/<Name>.md   — Jarvis frontmatter 포함
 *   └── _graph-snapshots/
 *       └── graph.json
 */
import "dotenv/config";
import { promises as fs } from "node:fs";
import * as path from "node:path";

// ─────────────────────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────────────────────

const KIND_TO_KOREAN: Record<string, string> = {
  procedure: "프로시저",
  function: "함수",
  table: "테이블",
  view: "뷰",
  class: "클래스",
  interface: "인터페이스",
};

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface FrontmatterArgs {
  name: string;
  module: string;
  kind: string;
  source: string;
  callees?: string[];
  callers?: string[];
}

// ─────────────────────────────────────────────────────────────
// Pure functions (exported for tests)
// ─────────────────────────────────────────────────────────────

/**
 * 이름 접두사로 kind를 추론한다.
 * P_ → procedure, F_ → function, TB_ → table, V_ → view, else "unknown"
 */
export function inferKind(name: string): string {
  if (/^P_/i.test(name)) return "procedure";
  if (/^F_/i.test(name)) return "function";
  if (/^TB_/i.test(name)) return "table";
  if (/^V_/i.test(name)) return "view";
  return "unknown";
}

/**
 * 상대 경로의 첫 번째 세그먼트에서 모듈명을 추출한다.
 */
export function detectModule(relPath: string): string {
  const seg = relPath.split(/[\\/]/)[0];
  return seg ?? "UNKNOWN";
}

/**
 * Graphify raw markdown에 Jarvis 호환 frontmatter를 prepend한다.
 */
export function addFrontmatter(rawBody: string, args: FrontmatterArgs): string {
  const korKind = KIND_TO_KOREAN[args.kind] ?? args.kind;
  const aliases = [
    args.name,
    `${args.name} ${korKind}`,
    `${args.module} ${korKind}`,
  ];
  const linkedPages = (args.callees ?? []).map(
    (c) => `code/${args.module}/${inferKind(c)}s/${c}`,
  );
  const calledBy = (args.callers ?? []).map(
    (c) => `code/${args.module}/${inferKind(c)}s/${c}`,
  );

  const lines: string[] = [
    "---",
    `title: "${args.name}"`,
    "type: derived",
    "authority: auto",
    "sensitivity: INTERNAL",
    `domain: code/${args.module}`,
    `source: "${args.source}"`,
    `tags: ["derived/code", "module/${args.module}", "kind/${args.kind}"]`,
    `aliases:`,
    ...aliases.map((a) => `  - "${a}"`),
    `module: ${args.module}`,
    `kind: ${args.kind}`,
  ];

  if (linkedPages.length > 0) {
    lines.push("linkedPages:");
    lines.push(...linkedPages.map((p) => `  - "${p}"`));
  }

  if (calledBy.length > 0) {
    lines.push("calledBy:");
    lines.push(...calledBy.map((p) => `  - "${p}"`));
  }

  lines.push("---", "");

  return lines.join("\n") + rawBody;
}

// ─────────────────────────────────────────────────────────────
// 파일 처리
// ─────────────────────────────────────────────────────────────

interface ProcessOptions {
  inputDir: string;
  outputDir: string;
  module: string;
  sourcePrefix: string;
  dryRun: boolean;
}

/**
 * raw .md 파일 하나를 처리하여 Jarvis frontmatter를 붙이고 출력 경로에 저장.
 */
async function processFile(
  filePath: string,
  opts: ProcessOptions,
): Promise<void> {
  const rawBody = await fs.readFile(filePath, "utf-8");
  const basename = path.basename(filePath, ".md");
  const name = basename;

  const kind = inferKind(name);
  const kindDir = kind === "unknown" ? "unknowns" : `${kind}s`;
  const source = `${opts.sourcePrefix}${kindDir}/${basename}.sql`;

  const output = addFrontmatter(rawBody, {
    name,
    module: opts.module,
    kind,
    source,
  });

  const outPath = path.join(opts.outputDir, kindDir, `${name}.md`);

  if (opts.dryRun) {
    console.log(`[dry-run] ${filePath} → ${outPath}`);
    return;
  }

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, output, "utf-8");
  console.log(`written: ${outPath}`);
}

/**
 * input 디렉토리 전체를 처리한다.
 */
async function processDirectory(opts: ProcessOptions): Promise<void> {
  const pagesDir = path.join(opts.inputDir, "pages");

  let entries: string[];
  try {
    entries = await fs.readdir(pagesDir);
  } catch {
    console.error(`pages 디렉토리를 찾을 수 없습니다: ${pagesDir}`);
    process.exit(1);
  }

  const mdFiles = entries.filter((e) => e.endsWith(".md"));
  console.log(`처리 대상: ${mdFiles.length}개 파일 (module: ${opts.module})`);

  for (const file of mdFiles) {
    const filePath = path.join(pagesDir, file);
    await processFile(filePath, opts);
  }

  // graph.json 복사
  const graphJsonSrc = path.join(opts.inputDir, "graph.json");
  try {
    await fs.access(graphJsonSrc);
    const snapDir = path.join(opts.outputDir, "_graph-snapshots");
    const graphJsonDst = path.join(snapDir, "graph.json");

    if (opts.dryRun) {
      console.log(`[dry-run] graph.json → ${graphJsonDst}`);
    } else {
      await fs.mkdir(snapDir, { recursive: true });
      await fs.copyFile(graphJsonSrc, graphJsonDst);
      console.log(`graph.json copied → ${graphJsonDst}`);
    }
  } catch {
    // graph.json 없으면 스킵
  }
}

// ─────────────────────────────────────────────────────────────
// CLI entry point
// ─────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): ProcessOptions {
  const get = (flag: string): string | undefined =>
    argv
      .find((a) => a.startsWith(`--${flag}=`))
      ?.slice(`--${flag}=`.length);

  const inputDir = get("input");
  const outputDir = get("output");
  const module = get("module");

  if (!inputDir || !outputDir || !module) {
    console.error(
      "Usage: tsx scripts/graphify-postprocess.ts --input=<dir> --output=<dir> --module=<NAME> [--source-prefix=ehr5/] [--dry-run]",
    );
    process.exit(1);
  }

  return {
    inputDir,
    outputDir,
    module,
    sourcePrefix: get("source-prefix") ?? "",
    dryRun: argv.includes("--dry-run"),
  };
}

const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith("graphify-postprocess.ts") ||
    process.argv[1].endsWith("graphify-postprocess.js"));

if (isMain) {
  const opts = parseArgs(process.argv.slice(2));
  processDirectory(opts).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
