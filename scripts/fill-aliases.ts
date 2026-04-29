/**
 * scripts/fill-aliases.ts
 *
 * Task 4.5 — LLM으로 wiki/jarvis/manual/** 58개 페이지에 aliases frontmatter 생성.
 *
 * Usage:
 *   pnpm exec tsx scripts/fill-aliases.ts \
 *     [--dir=wiki/jarvis/manual/policies] \
 *     [--limit=N] [--dry-run] [--model=gpt-5.4-mini]
 *
 * Provider 우선순위:
 *   1. FEATURE_SUBSCRIPTION_QUERY=true → CLIProxy gateway (http://127.0.0.1:8317/v1)
 *   2. fallback → OPENAI_API_KEY 직결
 *
 * Idempotent: aliases가 이미 채워진 페이지는 건너뜀.
 */
import "dotenv/config";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import OpenAI from "openai";

// ─────────────────────────────────────────────────────────────
// Pure functions (exported for tests)
// ─────────────────────────────────────────────────────────────

/**
 * frontmatter에 aliases 키를 추가하거나 교체한다.
 * frontmatter가 없으면 throw.
 */
export function upsertAliasesInFrontmatter(
  content: string,
  aliases: string[],
): string {
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/);
  if (!fmMatch) throw new Error("No frontmatter found");

  const fmBody = fmMatch[1]!;
  const afterFm = content.slice(fmMatch[0].length);

  // 기존 aliases 블록 제거 (multi-line list 포함)
  // aliases: 로 시작하는 줄 + 이어지는 공백-대시 행들을 모두 제거
  const aliasesRegex = /^aliases:[ \t]*(?:\r?\n[ \t]+-[^\r\n]*)*/m;
  let cleanedFm = fmBody.replace(aliasesRegex, "").replace(/\n{2,}/g, "\n").trimEnd();

  // 새 aliases 블록 추가
  const aliasLines = aliases.map((a) => `  - ${JSON.stringify(a)}`).join("\n");
  const newFm = `${cleanedFm}\naliases:\n${aliasLines}`;

  // afterFm이 \n으로 시작하면 그대로 이어붙임, 아니면 \n 추가
  const separator = afterFm.startsWith("\n") ? "" : "\n";
  return `---\n${newFm}\n---${separator}${afterFm}`;
}

/**
 * frontmatter 이후 본문에서 최대 limit 글자를 잘라 반환한다.
 */
export function extractBodySnippet(content: string, limit: number): string {
  const fmMatch = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  const body = fmMatch ? content.slice(fmMatch[0].length) : content;
  return body.slice(0, limit).trim();
}

// ─────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────

function extractTitle(content: string): string {
  // title: "..." 또는 title: ... 형식 모두 처리
  const m = content.match(/^title:\s*"?([^"\n]+)"?/m);
  return m?.[1]?.trim() ?? "";
}

function hasPopulatedAliases(content: string): boolean {
  // aliases: 키가 있고, 그 아래에 - 항목이 하나라도 있으면 true
  return /^aliases:\s*\r?\n\s+-\s/m.test(content);
}

interface LlmOpts {
  title: string;
  snippet: string;
  model: string;
}

async function generateAliasesOnce(client: OpenAI, opts: LlmOpts): Promise<string[]> {
  const prompt = `다음 사내 위키 페이지의 검색용 한국어 별칭(aliases) 3~5개를 생성하세요.

제목: ${opts.title}
내용 일부:
${opts.snippet}

규칙:
- 제목 자체는 **포함하지 말 것** (검색 시 중복)
- 동의어/약어/구어체/영문 표기 포함 (예: "휴가 규정" → ["연차", "휴일", "leave policy", "빙부상", "경조사"])
- 사내 비즈니스 용어가 있으면 반드시 포함 (예: 비과세, 통상임금, 성과급 등)
- 각 alias는 1~20자 한국어 또는 영문
- 반드시 JSON object 형식으로만 응답: { "aliases": ["alias1", "alias2", ...] }

예시 응답: { "aliases": ["연차", "빙부상", "경조사", "leave policy"] }`;

  const res = await client.chat.completions.create({
    model: opts.model,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.3,
    max_completion_tokens: 200,
    response_format: { type: "json_object" },
  });

  const raw = res.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw);
  // { aliases: [...] } 또는 bare array 모두 수용
  const arr: unknown[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed.aliases)
      ? parsed.aliases
      : [];

  return arr
    .filter((a): a is string => typeof a === "string" && a.length > 0 && a.length <= 30)
    .slice(0, 5);
}

async function generateAliases(client: OpenAI, opts: LlmOpts): Promise<string[]> {
  // retry 1회
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await generateAliasesOnce(client, opts);
      if (result.length >= 2) return result;
      // 결과 수 부족이면 재시도
      console.warn(`[fill-aliases] retry ${attempt + 1} (too few: ${result.length}) for "${opts.title}"`);
    } catch (err) {
      if (attempt === 1) throw err;
      console.warn(`[fill-aliases] retry ${attempt + 1} after error: ${err}`);
    }
  }
  return [];
}

async function walk(dir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      const sub = await walk(full);
      files.push(...sub);
    } else if (e.isFile() && e.name.endsWith(".md") && e.name !== "index.md") {
      files.push(full);
    }
  }
  return files;
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const getArg = (name: string): string | undefined => {
    const prefix = `--${name}=`;
    return args.find((a) => a.startsWith(prefix))?.slice(prefix.length);
  };

  // cwd 기준 상대경로 → 절대경로
  const rawDir = getArg("dir") ?? "wiki/jarvis/manual";
  const dir = path.isAbsolute(rawDir) ? rawDir : path.join(process.cwd(), rawDir);
  const limit = parseInt(getArg("limit") ?? "9999", 10);
  const model = getArg("model") ?? "gpt-5.4-mini";

  // Provider 선택: gateway 우선, fallback → direct
  const useGateway = process.env["FEATURE_SUBSCRIPTION_QUERY"] === "true";
  let client: OpenAI;
  if (useGateway) {
    const baseURL = process.env["LLM_GATEWAY_URL"] ?? "http://127.0.0.1:8317/v1";
    const apiKey =
      process.env["LLM_GATEWAY_KEY"] ?? process.env["CLIPROXY_API_KEY"];
    if (!apiKey) {
      throw new Error(
        "LLM_GATEWAY_KEY or CLIPROXY_API_KEY env var is required when FEATURE_SUBSCRIPTION_QUERY=true",
      );
    }
    client = new OpenAI({ baseURL, apiKey });
    console.log(`[fill-aliases] provider=gateway baseURL=${baseURL} model=${model} dir=${dir} limit=${limit} dryRun=${dryRun}`);
  } else {
    client = new OpenAI({ apiKey: process.env["OPENAI_API_KEY"]! });
    console.log(`[fill-aliases] provider=direct model=${model} dir=${dir} limit=${limit} dryRun=${dryRun}`);
  }

  // .md 파일 수집
  const allFiles = await walk(dir);
  console.log(`[fill-aliases] found ${allFiles.length} .md files (excluding index.md)`);

  let processed = 0;
  let skipped = 0;
  let failed = 0;
  const failedFiles: string[] = [];

  for (const f of allFiles.slice(0, limit)) {
    let raw: string;
    try {
      raw = await fs.readFile(f, "utf8");
    } catch {
      failed++;
      failedFiles.push(f);
      console.error(`[fill-aliases] FAILED read ${f}`);
      continue;
    }

    // 타이틀 없으면 skip
    const title = extractTitle(raw);
    if (!title) {
      skipped++;
      console.log(`[fill-aliases] SKIP (no title) ${f}`);
      continue;
    }

    // 이미 aliases 채워진 경우 idempotent skip
    if (hasPopulatedAliases(raw)) {
      skipped++;
      console.log(`[fill-aliases] SKIP (aliases exist) ${path.relative(process.cwd(), f)}`);
      continue;
    }

    const snippet = extractBodySnippet(raw, 1500);

    let aliases: string[];
    try {
      aliases = await generateAliases(client, { title, snippet, model });
    } catch (err) {
      // gateway 실패 시 direct fallback 시도
      if (useGateway) {
        console.warn(`[fill-aliases] gateway failed, trying direct fallback: ${err}`);
        try {
          const fallbackClient = new OpenAI({ apiKey: process.env["OPENAI_API_KEY"]! });
          aliases = await generateAliases(fallbackClient, { title, snippet, model });
        } catch (err2) {
          failed++;
          failedFiles.push(f);
          console.error(`[fill-aliases] FAILED ${path.relative(process.cwd(), f)}: ${err2}`);
          continue;
        }
      } else {
        failed++;
        failedFiles.push(f);
        console.error(`[fill-aliases] FAILED ${path.relative(process.cwd(), f)}: ${err}`);
        continue;
      }
    }

    if (aliases.length < 2) {
      failed++;
      failedFiles.push(f);
      console.error(`[fill-aliases] FAILED (too few aliases: ${aliases.length}) ${path.relative(process.cwd(), f)}`);
      continue;
    }

    let patched: string;
    try {
      patched = upsertAliasesInFrontmatter(raw, aliases);
    } catch (err) {
      failed++;
      failedFiles.push(f);
      console.error(`[fill-aliases] FAILED (frontmatter) ${path.relative(process.cwd(), f)}: ${err}`);
      continue;
    }

    if (dryRun) {
      console.log(`[fill-aliases] DRY ${path.relative(process.cwd(), f)} → ${JSON.stringify(aliases)}`);
    } else {
      await fs.writeFile(f, patched, "utf8");
      console.log(`[fill-aliases] WROTE ${path.relative(process.cwd(), f)} → ${JSON.stringify(aliases)}`);
    }
    processed++;
  }

  console.log(`\n[fill-aliases] done: processed=${processed} skipped=${skipped} failed=${failed}`);
  if (failedFiles.length > 0) {
    console.log("[fill-aliases] failed files:");
    for (const f of failedFiles) console.log(`  - ${path.relative(process.cwd(), f)}`);
  }

  if (failed > 0) process.exit(1);
}

// ESM entry point guard
const isMain =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));

if (isMain) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
