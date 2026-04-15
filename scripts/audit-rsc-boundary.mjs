#!/usr/bin/env node
/**
 * RSC / Server Action 경계 감사 스크립트
 *
 * 규칙 (계획 W3-X10):
 *   R1 [ERROR] "use client" 파일이 서버 전용 모듈 직접 import
 *   R2 [WARN]  actions.ts — "use server" 디렉티브 누락 / export async fn 반환 타입 누락
 *   R3 [WARN]  Server Action 본문 첫 10줄 내 권한/세션 체크 없음
 *   R4 [WARN]  apps/web/app/(...)/route.ts — db import 있으나 권한 체크 없음
 *   R5 [ERROR] "use client" 파일에서 NEXT_PUBLIC_ 아닌 process.env 직접 접근
 *
 * 사용법:
 *   node scripts/audit-rsc-boundary.mjs           # warn 모드 (exit 0)
 *   node scripts/audit-rsc-boundary.mjs --error   # 위반 1건 이상 시 exit 1
 *
 * AST 금지 — 정규식 + 라인 스캔 기반.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep, posix } from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const SCAN_DIRS = ['apps/web', 'apps/worker'];
const EXCLUDE_DIRS = new Set(['node_modules', '.next', 'dist', '.turbo', 'coverage', 'build']);
const FILE_EXT = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;

const SERVER_ONLY_IMPORT = /^\s*import\b[\s\S]*?from\s+['"](@jarvis\/auth|@jarvis\/db|@jarvis\/secret|packages\/secret|drizzle-orm(?:\/[^'"]+)?|drizzle-kit(?:\/[^'"]+)?)['"]/m;
const USE_CLIENT = /^\s*['"]use client['"]\s*;?\s*$/;
const USE_SERVER = /^\s*['"]use server['"]\s*;?\s*$/;
const AUTH_CHECK = /\b(requirePermission|requireSession|assertSession|getServerSession|auth\s*\(|resolveContext|getSession|requireApiSession)/;
const DB_IMPORT = /^\s*import\b[\s\S]*?from\s+['"](@jarvis\/db|drizzle-orm(?:\/[^'"]+)?)['"]/m;
const ROUTE_HANDLER = /\bexport\s+(?:async\s+)?(?:function|const)\s+(GET|POST|PUT|DELETE|PATCH|OPTIONS|HEAD)\b/;

const violations = [];

function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (EXCLUDE_DIRS.has(e.name)) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...walk(full));
    } else if (e.isFile() && FILE_EXT.test(e.name)) {
      out.push(full);
    }
  }
  return out;
}

function toPosix(p) {
  return p.split(sep).join(posix.sep);
}

function firstEffectiveLineIndex(lines) {
  // 빈줄/주석 제외 첫 유효 라인 인덱스 반환. 블록 주석은 단순화해 시작 토큰만 체크.
  let inBlock = false;
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (!line) continue;
    if (inBlock) {
      if (line.includes('*/')) {
        inBlock = false;
        line = line.slice(line.indexOf('*/') + 2).trim();
        if (!line) continue;
      } else {
        continue;
      }
    }
    if (line.startsWith('//')) continue;
    if (line.startsWith('/*')) {
      if (line.includes('*/')) {
        line = line.slice(line.indexOf('*/') + 2).trim();
        if (!line) continue;
      } else {
        inBlock = true;
        continue;
      }
    }
    return i;
  }
  return -1;
}

function hasUseClient(lines) {
  // 파일 상단 5줄 내 "use client" 디렉티브 탐색 (BOM/빈줄 고려).
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    const t = lines[i].trim();
    if (!t) continue;
    if (USE_CLIENT.test(lines[i])) return true;
    // 디렉티브는 코드 이전에만. 실제 코드 라인 만나면 중단.
    if (!t.startsWith('//') && !t.startsWith('/*')) {
      if (USE_CLIENT.test(lines[i])) return true;
      return false;
    }
  }
  return false;
}

function hasUseServerAtTop(lines) {
  const idx = firstEffectiveLineIndex(lines);
  if (idx < 0) return false;
  return USE_SERVER.test(lines[idx]);
}

function lineOfMatch(content, matchIndex) {
  // 문자열 인덱스 → 1-base 라인 번호
  let line = 1;
  for (let i = 0; i < matchIndex; i++) {
    if (content.charCodeAt(i) === 10) line++;
  }
  return line;
}

function firstImportLine(content, pattern) {
  const m = content.match(pattern);
  if (!m) return -1;
  return lineOfMatch(content, m.index ?? 0);
}

// R2.2 / R3 — export async function 탐색.
// 반환 위치(열린 중괄호) 및 파라미터 끝 ")"의 위치, 반환 타입 여부, 이름을 수집.
function findExportedAsyncFns(content) {
  const results = [];
  // export (default )? async function NAME ( ... ) (: T)? {
  // 간단화: 파라미터 내 중첩 괄호는 깊이 추적.
  const re = /export\s+(?:default\s+)?async\s+function\s+(\*?\s*)?([A-Za-z_$][\w$]*)?\s*\(/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const name = m[2] || '(default)';
    const parenStart = re.lastIndex - 1; // '(' 위치
    // 파라미터 닫는 ')' 찾기
    let depth = 0;
    let i = parenStart;
    for (; i < content.length; i++) {
      const ch = content[i];
      if (ch === '(') depth++;
      else if (ch === ')') {
        depth--;
        if (depth === 0) break;
      }
    }
    if (i >= content.length) continue;
    const afterParen = content.slice(i + 1);
    // 반환 타입: ) : SomeType {  —  "Promise<" 존재 여부로 간주
    // afterParen 앞부분(열린 중괄호 전까지) 내에 ": Promise<" 있는지
    const braceIdx = afterParen.indexOf('{');
    if (braceIdx < 0) continue;
    const between = afterParen.slice(0, braceIdx);
    const hasReturnType = /:\s*Promise\s*</.test(between) || /:\s*[A-Za-z_$][\w$<>\s,|&.\[\]]+$/.test(between.trim());
    // 본문 시작 문자열 인덱스
    const bodyStart = i + 1 + braceIdx + 1;
    // 본문 첫 10줄
    const rest = content.slice(bodyStart);
    const bodyLines = rest.split('\n').slice(0, 10).join('\n');
    results.push({
      name,
      line: lineOfMatch(content, m.index),
      hasReturnType,
      bodyHead: bodyLines,
    });
  }
  return results;
}

function scanFile(abs) {
  const rel = toPosix(relative(ROOT, abs));
  let content;
  try {
    content = readFileSync(abs, 'utf8');
  } catch {
    return;
  }
  const lines = content.split('\n');
  const isClient = hasUseClient(lines);
  const fileBase = rel.split('/').pop() || '';

  // R1 — use client + server-only import
  if (isClient) {
    const m = content.match(SERVER_ONLY_IMPORT);
    if (m) {
      violations.push({
        rule: 'R1',
        severity: 'ERROR',
        file: rel,
        line: lineOfMatch(content, m.index ?? 0),
        msg: `"use client" 파일이 ${m[1]}를 import`,
      });
    }

    // R5 — use client + process.env.NON_PUBLIC
    const envRe = /process\.env\.(?!NEXT_PUBLIC_)([A-Za-z_][\w]*)/g;
    let em;
    while ((em = envRe.exec(content)) !== null) {
      // NODE_ENV는 클라이언트 빌드 상수로 안전 → 허용
      if (em[1] === 'NODE_ENV') continue;
      violations.push({
        rule: 'R5',
        severity: 'ERROR',
        file: rel,
        line: lineOfMatch(content, em.index),
        msg: `"use client" 파일에서 비공개 env(process.env.${em[1]}) 직접 접근`,
      });
    }
  }

  // R2 / R3 — actions.ts
  if (fileBase === 'actions.ts') {
    if (!hasUseServerAtTop(lines)) {
      violations.push({
        rule: 'R2',
        severity: 'WARN',
        file: rel,
        line: 1,
        msg: 'actions.ts 첫 유효 라인이 "use server" 아님',
      });
    }
    const fns = findExportedAsyncFns(content);
    for (const fn of fns) {
      if (!fn.hasReturnType) {
        violations.push({
          rule: 'R2',
          severity: 'WARN',
          file: rel,
          line: fn.line,
          msg: `export async function ${fn.name} 반환 타입 누락`,
        });
      }
      if (!AUTH_CHECK.test(fn.bodyHead)) {
        violations.push({
          rule: 'R3',
          severity: 'WARN',
          file: rel,
          line: fn.line,
          msg: `Server Action ${fn.name} — 본문 첫 10줄에 권한/세션 체크 없음`,
        });
      }
    }
  }

  // R4 — apps/web/app/**/route.ts: db import + 권한 체크 없음
  if (fileBase === 'route.ts' && rel.startsWith('apps/web/app/')) {
    const hasHandler = ROUTE_HANDLER.test(content);
    const dbMatch = content.match(DB_IMPORT);
    if (hasHandler && dbMatch && !AUTH_CHECK.test(content)) {
      violations.push({
        rule: 'R4',
        severity: 'WARN',
        file: rel,
        line: lineOfMatch(content, dbMatch.index ?? 0),
        msg: 'route.ts에 db import 있으나 권한/세션 체크 없음',
      });
    }
  }
}

// --- main ---
const mode = process.argv.includes('--error') ? 'error' : 'warn';

for (const d of SCAN_DIRS) {
  const abs = join(ROOT, d);
  try {
    if (!statSync(abs).isDirectory()) continue;
  } catch {
    continue;
  }
  for (const f of walk(abs)) scanFile(f);
}

// 정렬: 파일명 → 라인
violations.sort((a, b) => {
  if (a.file !== b.file) return a.file.localeCompare(b.file);
  return a.line - b.line;
});

let errCount = 0;
let warnCount = 0;
for (const v of violations) {
  if (v.severity === 'ERROR') errCount++;
  else warnCount++;
  const tag = `[${v.rule} ${v.severity}]`;
  // 열 너비 맞추기
  const tagPad = tag.padEnd(12);
  console.log(`${tagPad} ${v.file}:${v.line} — ${v.msg}`);
}

console.log('');
console.log('--- Summary ---');
console.log(`ERROR: ${errCount}건, WARN: ${warnCount}건`);

if (mode === 'error' && (errCount > 0 || warnCount > 0)) {
  process.exit(1);
}
if (mode === 'warn' && errCount > 0) {
  // 기본 --warn 모드는 exit 0 (계획 명시). 단, 리포트만 남김.
}
process.exit(0);
