/**
 * packages/db/seed/parsers/parse-tsmt001.ts
 *
 * Oracle export SQL(TSMT001 회사마스터) 파서.
 * 순수 함수 — I/O 없음. 입력: SQL 텍스트, 출력: Tsmt001Record 배열.
 */

export type Tsmt001Record = {
  enterCd: string;
  code: string;
  name: string;
  groupCode: string | null;
  objectDiv: string;
  manageDiv: string | null;
  representCompany: boolean;
  startDate: string | null; // ISO yyyy-MM-dd
  industryCode: string | null;
  zip: string | null;
  address: string | null;
  homepage: string | null;
  updatedBy: string | null;
  updatedAt: Date;
};

const COLUMN_COUNT = 25; // ENTER_CD ~ CHKDATE

export function parseTsmt001(sql: string): Tsmt001Record[] {
  const rows: Tsmt001Record[] = [];

  // Insert into ... values (...); 를 한 줄씩 매칭. 멀티라인 불필요 (각 행이 한 줄).
  const insertRe = /^Insert into\s+\w+\s*\([^)]*\)\s*values\s*\((.*)\);\s*$/gim;
  let match: RegExpExecArray | null;

  while ((match = insertRe.exec(sql)) !== null) {
    const valuesStr = match[1] ?? "";
    const values = splitOracleValues(valuesStr);
    if (values.length !== COLUMN_COUNT) continue;

    const v = (i: number): string => values[i] ?? "";

    rows.push({
      enterCd: requireString(v(0)),
      code: requireString(v(1)),
      name: requireString(v(2)),
      groupCode: nullableString(v(3)),
      objectDiv: requireString(v(4)),
      manageDiv: nullableString(v(5)),
      representCompany: v(6) === "'1'",
      startDate: parseSdate(v(7)),
      industryCode: nullableString(v(8)),
      zip: nullableString(v(9)),
      address: nullableString(v(10)),
      homepage: nullableString(v(11)),
      // v(12)~v(22): COMPANY_FILE_SEQ, ETC1~ETC10 (skip)
      updatedBy: nullableString(v(23)), // CHKID
      updatedAt: parseToDate(v(24)),    // CHKDATE
    });
  }

  return rows;
}

/**
 * Oracle values 문자열을 개별 토큰 배열로 분리.
 * - 따옴표 안 콤마 보존
 * - to_date('...','...') 같은 괄호 중첩 보존
 * - '' 이스케이프 처리
 */
function splitOracleValues(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let inStr = false;
  let buf = "";

  for (let i = 0; i < s.length; i++) {
    const c = s[i];

    if (inStr) {
      buf += c;
      if (c === "'") {
        // 연속 '' 는 이스케이프된 작은따옴표
        if (s[i + 1] === "'") {
          buf += s[++i];
          continue;
        }
        inStr = false;
      }
      continue;
    }

    if (c === "'") {
      inStr = true;
      buf += c;
      continue;
    }

    if (c === "(") {
      depth++;
      buf += c;
      continue;
    }

    if (c === ")") {
      depth--;
      buf += c;
      continue;
    }

    if (c === "," && depth === 0) {
      out.push(buf.trim());
      buf = "";
      continue;
    }

    buf += c;
  }

  if (buf.trim()) out.push(buf.trim());
  return out;
}

function requireString(token: string): string {
  return unquote(token) ?? "";
}

function nullableString(token: string): string | null {
  return token === "null" ? null : unquote(token);
}

function unquote(token: string): string | null {
  if (token === "null") return null;
  const m = token.match(/^'(.*)'$/s);
  if (!m) return null;
  return (m[1] ?? "").replace(/''/g, "'");
}

function parseSdate(token: string): string | null {
  const raw = unquote(token);
  if (!raw || !/^\d{8}$/.test(raw)) return null;
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
}

function parseToDate(token: string): Date {
  // to_date('2018-02-14 09:43:00','YYYY-MM-DD HH24:MI:SS')
  const m = token.match(/to_date\('([^']+)'\s*,/i);
  if (!m) throw new Error(`parseToDate: invalid token: ${token}`);
  return new Date((m[1] ?? "").replace(" ", "T") + "Z");
}
