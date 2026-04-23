#!/usr/bin/env node
/**
 * scripts/check-llm-models.mjs
 *
 * LLM 모델 정책 lint.
 * SSoT: docs/policies/llm-models.md
 *
 * 허용 모델:
 *   - OpenAI 생성:   gpt-5.4, gpt-5.4-mini
 *   - CLIProxy 내부: gpt-5, gpt-5-codex, gpt-5-codex-mini, gpt-5-pro
 *                    (infra/cliproxy/config.yaml 매핑 전용)
 *
 * 금지 모델:
 *   - OpenAI 생성: gpt-4*, gpt-3*, o1/o3/o4
 *   - OpenAI 임베딩 전체 금지 (2026-04-23 Harness-first 전환):
 *       text-embedding-3-small, text-embedding-3-large, text-embedding-ada-*
 *   - Anthropic: claude-* (서비스 런타임에서 금지)
 *   - 로컬:   ollama, bge-m3, nomic-embed, embeddinggemma, Qwen-Embedding, llama.cpp
 *
 * 네 가지 실행 모드:
 *
 *   1) Hook 모드 (advisory)
 *      $ node scripts/check-llm-models.mjs --hook
 *      - stdin으로 Claude Code PostToolUse payload 읽음
 *      - 편집된 파일 하나만 스캔 → 경고만 출력, exit 0
 *
 *   2) CI 모드 (blocking)
 *      $ node scripts/check-llm-models.mjs --ci
 *      - 전체 스캔, drift면 exit 1
 *
 *   3) pre-commit 모드 (blocking)
 *      $ node scripts/check-llm-models.mjs --precommit
 *      - CI와 동일 로직, 안내 메시지만 다름
 *
 *   4) 수동 모드
 *      $ node scripts/check-llm-models.mjs
 *      - 전체 스캔, drift면 exit 1
 *
 * 예외: 라인에 "policy-exempt" 또는 "llm-models.md" 문자열이 있으면 스킵.
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const HOOK_MODE = process.argv.includes("--hook");
const CI_MODE = process.argv.includes("--ci");
const PRECOMMIT_MODE = process.argv.includes("--precommit");
const BLOCKING = CI_MODE || PRECOMMIT_MODE;

// ============================================================================
// 금지 패턴
// ============================================================================
const FORBIDDEN = [
  { pattern: /\bgpt-4o(?:-mini|-preview)?\b/gi, reason: "gpt-4o 계열 (OpenAI 금지)" },
  { pattern: /\bgpt-4\.1(?:-mini|-nano)?\b/gi, reason: "gpt-4.1 계열 (OpenAI 금지)" },
  { pattern: /\bgpt-4(?:-turbo|-vision|-0\d+)?\b/gi, reason: "gpt-4 계열 (OpenAI 금지)" },
  { pattern: /\bgpt-3\.5(?:-turbo)?\b/gi, reason: "gpt-3.5 계열 (OpenAI 금지)" },
  { pattern: /\bgpt-3(?:-turbo)?\b/gi, reason: "gpt-3 계열 (OpenAI 금지)" },
  { pattern: /\bo1(?:-mini|-preview)?\b/gi, reason: "o1 reasoning (OpenAI 금지)" },
  { pattern: /\bo3(?:-mini)?\b/gi, reason: "o3 reasoning (OpenAI 금지)" },
  { pattern: /\bo4-mini\b/gi, reason: "o4 reasoning (OpenAI 금지)" },
  { pattern: /\bclaude-(?:3|2|instant)[\w.-]*/gi, reason: "Claude (Anthropic) — 서비스 런타임 금지" },
  { pattern: /\bollama\b/gi, reason: "Ollama 로컬 모델 (금지)" },
  { pattern: /\bnomic-embed[\w-]*/gi, reason: "Nomic 로컬 임베딩 (금지)" },
  { pattern: /\bbge-(?:m3|small|base|large)\b/gi, reason: "BGE 로컬 임베딩 (금지)" },
  { pattern: /\bembeddinggemma\b/gi, reason: "embeddinggemma 로컬 임베딩 (금지)" },
  { pattern: /\btext-embedding-ada(?:-\d+)?\b/gi, reason: "text-embedding-ada-* (허용 안 됨)" },
  { pattern: /\btext-embedding-3-large\b/gi, reason: "text-embedding-3-large (Harness-first 전환 후 embedding 전면 금지)" },
  { pattern: /\btext-embedding-3-small\b/gi, reason: "text-embedding-3-small (2026-04-23 Harness-first 전환 후 FORBIDDEN)" },
];

// ============================================================================
// 스캔 대상
// ============================================================================
const INCLUDE_EXT = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".py", ".yaml", ".yml"]);
const ENV_FILES = new Set([
  ".env",
  ".env.example",
  ".env.local",
  ".env.production",
  ".env.development",
  ".env.test",
]);
const INCLUDE_DIRS = ["apps", "packages", "scripts", "infra"];
const EXCLUDE_DIR_PATTERNS = [
  /^node_modules$/,
  /^\.next/, // .next, .next-dev, .next-prod 등 모든 Next.js 빌드 산출물
  /^\.turbo$/,
  /^\.git$/,
  /^\.vercel$/,
  /^dist$/,
  /^build$/,
  /^coverage$/,
  /^out$/,
  /^docs$/,
  /^reference_only$/,
  /^wiki$/, // workspace별 위키 저장소 (SSoT는 코드 바깥)
];
const EXCLUDE_FILES = new Set([
  path.join("scripts", "check-llm-models.mjs"), // 자기 자신 (금지 패턴 정의)
  path.join("apps", "web", "next-env.d.ts"), // Next.js 자동 생성
]);

function isExcludedDir(name) {
  return EXCLUDE_DIR_PATTERNS.some((re) => re.test(name));
}

function shouldScanFile(filePath) {
  const rel = path.relative(ROOT, filePath);
  if (rel.startsWith("..")) return false;
  if (EXCLUDE_FILES.has(rel)) return false;
  const base = path.basename(rel);
  if (ENV_FILES.has(base)) return true;
  const parts = rel.split(/[\\/]/);
  if (!INCLUDE_DIRS.includes(parts[0])) return false;
  for (const part of parts) {
    if (isExcludedDir(part)) return false;
  }
  const ext = path.extname(filePath);
  return INCLUDE_EXT.has(ext);
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (isExcludedDir(entry.name)) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(abs, out);
    } else if (entry.isFile()) {
      out.push(abs);
    }
  }
  return out;
}

function collectFiles() {
  const files = [];
  for (const name of ENV_FILES) {
    const abs = path.join(ROOT, name);
    if (fs.existsSync(abs)) files.push(abs);
  }
  for (const dir of INCLUDE_DIRS) {
    walk(path.join(ROOT, dir), files);
  }
  return files.filter(shouldScanFile);
}

function scanFile(filePath) {
  let content;
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch {
    return [];
  }
  const violations = [];
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes("policy-exempt") || line.includes("llm-models.md")) continue;
    for (const { pattern, reason } of FORBIDDEN) {
      pattern.lastIndex = 0;
      const match = pattern.exec(line);
      if (match) {
        violations.push({
          line: i + 1,
          match: match[0],
          reason,
          content: line.trim().slice(0, 160),
        });
        break;
      }
    }
  }
  return violations;
}

function printViolations(violations, header) {
  console.error(header);
  console.error(
    `   ${violations.length}건. 허용: gpt-5.4, gpt-5.4-mini (embedding 전체 금지)`,
  );
  console.error(`   상세 정책: docs/policies/llm-models.md\n`);
  const byFile = new Map();
  for (const v of violations) {
    if (!byFile.has(v.file)) byFile.set(v.file, []);
    byFile.get(v.file).push(v);
  }
  for (const [file, list] of byFile) {
    console.error(`   ${file}`);
    for (const v of list) {
      console.error(`     L${v.line}: ${v.match}  — ${v.reason}`);
      console.error(`        ${v.content}`);
    }
  }
}

// ============================================================================
// Hook 모드
// ============================================================================
if (HOOK_MODE) {
  let payload = null;
  try {
    const raw = fs.readFileSync(0, "utf8");
    payload = raw.trim() ? JSON.parse(raw) : null;
  } catch {
    process.exit(0);
  }
  const file = payload?.tool_input?.file_path;
  if (!file) process.exit(0);
  const abs = path.resolve(file);
  if (!shouldScanFile(abs)) process.exit(0);
  const viols = scanFile(abs);
  if (viols.length > 0) {
    const rel = path.relative(ROOT, abs);
    process.stderr.write(`⚠️  LLM 모델 정책 위반 (advisory)\n    ${rel}:\n`);
    for (const v of viols) {
      process.stderr.write(`      L${v.line}: ${v.match} — ${v.reason}\n`);
    }
    process.stderr.write(
      `    허용 모델: gpt-5.4, gpt-5.4-mini (embedding 전체 금지 — Harness-first)\n` +
        `    상세: docs/policies/llm-models.md\n`,
    );
  }
  process.exit(0);
}

// ============================================================================
// CI / pre-commit / 수동 모드
// ============================================================================
const files = collectFiles();
const allViolations = [];
for (const file of files) {
  const viols = scanFile(file);
  for (const v of viols) {
    allViolations.push({ file: path.relative(ROOT, file), ...v });
  }
}

if (allViolations.length === 0) {
  console.log("✅ LLM 모델 정책 위반 없음.");
  console.log(`   스캔 파일: ${files.length}개`);
  console.log("   허용: gpt-5.4, gpt-5.4-mini (embedding 전체 금지 — Harness-first)");
  process.exit(0);
}

const prefix = PRECOMMIT_MODE
  ? "❌ [pre-commit] LLM 모델 정책 위반"
  : CI_MODE
    ? "❌ [CI] LLM 모델 정책 위반"
    : "❌ LLM 모델 정책 위반";
printViolations(allViolations, prefix);
process.exit(1);
