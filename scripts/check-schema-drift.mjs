#!/usr/bin/env node
/**
 * scripts/check-schema-drift.mjs
 *
 * Drizzle schema drift detector.
 *
 * 용도: packages/db/schema/*.ts의 최신 수정 시각이
 *       packages/db/drizzle/meta/_journal.json의 최신 수정 시각보다
 *       앞서 있으면 "마이그레이션을 재생성하지 않았다"라고 판단한다.
 *
 * 세 가지 실행 모드를 지원한다:
 *
 *   1) Claude Code hook 모드
 *      $ node scripts/check-schema-drift.mjs --hook
 *      - stdin으로 Claude Code가 넘긴 PostToolUse JSON payload를 읽는다
 *      - payload.tool_input.file_path가 스키마 파일이 아니면 조용히 종료
 *      - drift가 있으면 stderr에 경고만 출력하고 exit 0 (advisory only, 차단 아님)
 *      - 오류가 나도 Claude의 작업 흐름을 막지 않기 위해 항상 exit 0
 *
 *   2) 수동 / CI 모드
 *      $ node scripts/check-schema-drift.mjs
 *      - 현재 drift 상태를 출력
 *      - drift면 exit 1 (CI 실패 가능)
 *      - drift 없으면 exit 0
 *
 *   3) Codex / 다른 에이전트
 *      (2)와 동일. 수동 모드로 호출하면 사람이 읽기 좋은 형태의 결과를 받는다.
 *
 * 이 스크립트는 Claude Code, Codex CLI, pre-commit, CI에서 모두 재사용된다.
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SCHEMA_DIR = path.resolve(ROOT, "packages/db/schema");
const JOURNAL = path.resolve(ROOT, "packages/db/drizzle/meta/_journal.json");
const HOOK_MODE = process.argv.includes("--hook");
const TOLERANCE_MS = 500; // 거의 동시 편집에 대한 허용 오차

/** packages/db/schema/ 하위의 모든 .ts 파일 중 최신 mtime. */
function latestSchemaMtime() {
  if (!fs.existsSync(SCHEMA_DIR)) return 0;
  let latest = 0;
  const entries = fs.readdirSync(SCHEMA_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(".ts")) {
      const m = fs.statSync(path.join(SCHEMA_DIR, entry.name)).mtimeMs;
      if (m > latest) latest = m;
    }
  }
  return latest;
}

function checkDrift() {
  if (!fs.existsSync(JOURNAL)) {
    return { drift: false, reason: "no-journal" };
  }
  const schemaMtime = latestSchemaMtime();
  const journalMtime = fs.statSync(JOURNAL).mtimeMs;
  if (schemaMtime > journalMtime + TOLERANCE_MS) {
    return {
      drift: true,
      ageSeconds: Math.round((schemaMtime - journalMtime) / 1000),
    };
  }
  return { drift: false };
}

function isSchemaFile(filePath) {
  if (!filePath) return false;
  const abs = path.resolve(filePath);
  // 스키마 디렉토리 하위 + .ts 확장자
  return abs.startsWith(SCHEMA_DIR + path.sep) && abs.endsWith(".ts");
}

// ----- Hook mode ----------------------------------------------------------
if (HOOK_MODE) {
  let payload = null;
  try {
    const raw = fs.readFileSync(0, "utf8");
    payload = raw.trim() ? JSON.parse(raw) : null;
  } catch {
    // stdin 읽기 실패 → 조용히 종료. Claude의 흐름을 막지 않는다.
    process.exit(0);
  }

  const file = payload?.tool_input?.file_path ?? "";
  if (!isSchemaFile(file)) {
    process.exit(0); // 스키마 파일 편집이 아니면 관심 없음
  }

  const result = checkDrift();
  if (result.drift) {
    const rel = path.relative(ROOT, file);
    process.stderr.write(
      `⚠️  Drizzle schema drift\n` +
      `    ${rel}가 마이그레이션보다 ${result.ageSeconds}초 앞서 있습니다.\n` +
      `    packages/db/schema/*.ts 편집을 모두 끝낸 뒤 ` +
      `'pnpm db:generate'를 실행하세요.\n`
    );
  }
  // Advisory: 차단하지 않는다.
  process.exit(0);
}

// ----- Manual / CI mode ---------------------------------------------------
const result = checkDrift();

if (result.reason === "no-journal") {
  console.log(
    "ℹ️  drizzle/meta/_journal.json이 없습니다. " +
    "첫 마이그레이션 전으로 가정하고 통과합니다."
  );
  process.exit(0);
}

if (result.drift) {
  console.error(
    `❌ Schema drift detected.\n` +
    `   packages/db/schema/*.ts가 마이그레이션보다 ${result.ageSeconds}초 앞서 있습니다.\n` +
    `   'pnpm db:generate'를 실행해 동기화하세요.`
  );
  process.exit(1);
}

console.log("✅ No schema drift. (스키마와 마이그레이션이 동기화되어 있습니다.)");
process.exit(0);
