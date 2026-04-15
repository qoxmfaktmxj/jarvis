#!/usr/bin/env node
/**
 * scripts/wiki-check.mjs
 *
 * G8 Wiki 무결성 검증 스크립트.
 *
 * 용도: Karpathy-first Wiki FS 환경이 올바르게 구성되어 있고,
 *       DB(`wiki_commit_log`)와 실제 git HEAD가 동기화되어 있는지 확인한다.
 *
 * 실행 모드:
 *
 *   1) 로컬 모드 (기본)
 *      $ node scripts/wiki-check.mjs
 *      - 결과를 PASS / WARN / FAIL로 출력
 *      - FAIL 항목이 1개라도 있으면 exit 1, 아니면 exit 0
 *      - WARN은 경고만 출력하고 통과
 *
 *   2) CI 모드 (blocking)
 *      $ node scripts/wiki-check.mjs --ci
 *      - FAIL 또는 WARN 항목이 1개라도 있으면 exit 1
 *
 * 검증 항목:
 *   1. WIKI_ROOT 환경변수 존재 여부
 *   2. WIKI_ROOT 경로 존재 여부 (fs.existsSync)
 *   3. WIKI_ROOT가 git 레포인지 (.git 폴더 존재)
 *   4. DB의 wiki_commit_log 최신 commitSha == `git log HEAD -1 --format=%H`
 *      (DB 접근 실패 시 skip + warning)
 *
 * 의존성 최소화: psql CLI를 우선 사용하고, 없으면 skip + warning.
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const CI_MODE = process.argv.includes("--ci");

/** @type {Array<{ name: string, status: "PASS" | "WARN" | "FAIL", detail: string }>} */
const results = [];

function record(name, status, detail) {
  results.push({ name, status, detail });
}

function hasCommand(bin) {
  try {
    const probe = process.platform === "win32" ? `where ${bin}` : `command -v ${bin}`;
    execSync(probe, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────
// Check 1: WIKI_ROOT 환경변수
// ─────────────────────────────────────────────────────────────
const wikiRoot = process.env.WIKI_ROOT;
if (!wikiRoot) {
  record(
    "WIKI_ROOT env var",
    "FAIL",
    "환경변수 WIKI_ROOT가 설정되지 않았습니다. .env 또는 shell에서 설정하세요."
  );
} else {
  record("WIKI_ROOT env var", "PASS", `WIKI_ROOT=${wikiRoot}`);
}

// ─────────────────────────────────────────────────────────────
// Check 2: WIKI_ROOT 경로 존재
// ─────────────────────────────────────────────────────────────
let wikiRootExists = false;
if (wikiRoot) {
  wikiRootExists = fs.existsSync(wikiRoot);
  if (!wikiRootExists) {
    record(
      "WIKI_ROOT path exists",
      "FAIL",
      `경로 "${wikiRoot}"가 존재하지 않습니다. 볼륨 마운트 또는 bootstrap 스크립트 확인 필요.`
    );
  } else {
    record("WIKI_ROOT path exists", "PASS", `path resolved`);
  }
} else {
  record("WIKI_ROOT path exists", "WARN", "WIKI_ROOT 미설정으로 skip");
}

// ─────────────────────────────────────────────────────────────
// Check 3: WIKI_ROOT가 git 레포인지
// ─────────────────────────────────────────────────────────────
let isGitRepo = false;
if (wikiRoot && wikiRootExists) {
  const gitDir = path.join(wikiRoot, ".git");
  isGitRepo = fs.existsSync(gitDir);
  if (!isGitRepo) {
    record(
      "WIKI_ROOT is a git repo",
      "WARN",
      `.git 폴더가 없습니다. 'git init'으로 초기화하거나 FEATURE_WIKI_FS_MODE=mock을 사용하세요.`
    );
  } else {
    record("WIKI_ROOT is a git repo", "PASS", ".git found");
  }
} else {
  record("WIKI_ROOT is a git repo", "WARN", "선행 체크 실패로 skip");
}

// ─────────────────────────────────────────────────────────────
// Check 4: DB wiki_commit_log 최신 commitSha == git HEAD
// ─────────────────────────────────────────────────────────────
function dbHeadCheck() {
  if (!wikiRoot || !wikiRootExists || !isGitRepo) {
    record("wiki_commit_log vs git HEAD", "WARN", "선행 체크 실패로 skip");
    return;
  }

  // git HEAD sha
  let gitHead;
  try {
    gitHead = execSync("git log HEAD -1 --format=%H", {
      cwd: wikiRoot,
      encoding: "utf8",
    }).trim();
  } catch (err) {
    record(
      "wiki_commit_log vs git HEAD",
      "WARN",
      `git log 실패: ${err instanceof Error ? err.message : String(err)} (빈 레포일 수 있음, skip)`
    );
    return;
  }

  if (!gitHead) {
    record(
      "wiki_commit_log vs git HEAD",
      "WARN",
      "git HEAD가 비어 있습니다 (커밋 없음), skip"
    );
    return;
  }

  // DATABASE_URL 확인
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    record(
      "wiki_commit_log vs git HEAD",
      "WARN",
      "DATABASE_URL 미설정으로 DB 체크 skip"
    );
    return;
  }

  // psql CLI 우선
  if (!hasCommand("psql")) {
    record(
      "wiki_commit_log vs git HEAD",
      "WARN",
      "psql CLI가 설치되어 있지 않아 DB 체크 skip (pg 모듈 대체는 의존성 최소화를 위해 생략)"
    );
    return;
  }

  let dbSha;
  try {
    const sql =
      "SELECT commit_sha FROM wiki_commit_log ORDER BY committed_at DESC LIMIT 1;";
    const out = execSync(`psql "${databaseUrl}" -At -c "${sql}"`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    dbSha = out.split("\n")[0]?.trim() || "";
  } catch (err) {
    record(
      "wiki_commit_log vs git HEAD",
      "WARN",
      `psql 쿼리 실패: ${err instanceof Error ? err.message : String(err)} (테이블 미존재 가능, skip)`
    );
    return;
  }

  if (!dbSha) {
    record(
      "wiki_commit_log vs git HEAD",
      "WARN",
      `wiki_commit_log 테이블이 비어 있습니다. git HEAD=${gitHead.slice(0, 8)}`
    );
    return;
  }

  if (dbSha === gitHead) {
    record(
      "wiki_commit_log vs git HEAD",
      "PASS",
      `동기화됨 (sha=${gitHead.slice(0, 8)})`
    );
  } else {
    record(
      "wiki_commit_log vs git HEAD",
      "FAIL",
      `불일치: DB=${dbSha.slice(0, 8)} vs git HEAD=${gitHead.slice(0, 8)}. ingest 워커 재실행 필요.`
    );
  }
}

dbHeadCheck();

// ─────────────────────────────────────────────────────────────
// 결과 출력
// ─────────────────────────────────────────────────────────────
const statusIcon = { PASS: "[PASS]", WARN: "[WARN]", FAIL: "[FAIL]" };

console.log("");
console.log("Wiki integrity check");
console.log("====================");
for (const r of results) {
  console.log(`${statusIcon[r.status]} ${r.name}`);
  console.log(`        ${r.detail}`);
}
console.log("");

const failCount = results.filter((r) => r.status === "FAIL").length;
const warnCount = results.filter((r) => r.status === "WARN").length;
const passCount = results.filter((r) => r.status === "PASS").length;

console.log(`Summary: ${passCount} pass, ${warnCount} warn, ${failCount} fail`);

if (CI_MODE) {
  if (failCount > 0 || warnCount > 0) {
    console.error(
      `\n[ci] wiki-check 실패: WARN/FAIL 항목이 존재합니다 (warn=${warnCount}, fail=${failCount}).`
    );
    process.exit(1);
  }
  process.exit(0);
}

// 로컬 모드: FAIL만 exit 1
if (failCount > 0) {
  console.error(`\nwiki-check 실패: FAIL 항목 ${failCount}개.`);
  process.exit(1);
}
process.exit(0);
