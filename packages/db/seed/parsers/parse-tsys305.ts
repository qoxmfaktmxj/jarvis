/**
 * packages/db/seed/parsers/parse-tsys305.ts
 *
 * Oracle export SQL (TSYS305 사용자) 파서. 순수 함수 — I/O 없음.
 * 실행: node --test --import tsx packages/db/seed/parsers/__tests__/parse-tsys305.test.ts
 */

export type Tsys305Record = {
  enterCd: string;
  employeeId: string;       // SABUN
  loginId: string | null;   // ID (사번과 다른 경우 있음 — preferences.loginId로 흡수)
  passwordHash: string;     // PASSWORD (이미 hash)
  status: "active" | "inactive" | "locked"; // USE_YN + ROCKING_YN
  name: string;             // NAME
  email: string | null;     // MAIL_ID
  phone: string | null;     // HAND_PHONE
  position: string | null;  // JIKWEE_NM
  jobTitle: string | null;  // JIKCHAK_NM
  isOutsourced: boolean;    // OUT_SOURCED_YN
  orgCode: string | null;   // ORG_CD (워크스페이스 organization.code 매칭은 seeder에서)
  orgName: string | null;   // ORG_NM (legacy 텍스트 — 매핑 실패 시 fallback)
  updatedAt: Date;          // CHKDATE
};

const COLUMN_COUNT = 23;

export function parseTsys305(sqlText: string): Tsys305Record[] {
  const rows: Tsys305Record[] = [];
  const lines = sqlText.split(/\r?\n/);
  for (const line of lines) {
    if (!line.startsWith("Insert into TSYS305")) continue;
    const valuesStart = line.indexOf("values (");
    if (valuesStart < 0) continue;
    const valuesEnd = line.lastIndexOf(");");
    if (valuesEnd < 0) continue;
    const valuesRaw = line.slice(valuesStart + "values (".length, valuesEnd);
    const fields = splitOracleValues(valuesRaw);
    if (fields.length !== COLUMN_COUNT) continue;

    const [
      enterCd, sabun, id, password, _passwordRmk, _mainpageType,
      _searchType, rockingYn, chkdate, _chkid, _skinType, _fontType,
      orgNm, mailId, name, jikweeNm, _jikgubNm, jikchakNm, useYn,
      handPhone, outSourcedYn, orgCd, _requestNote,
    ] = fields;

    rows.push({
      enterCd: unquote(enterCd),
      employeeId: unquote(sabun),
      loginId: nullable(id),
      passwordHash: unquote(password),
      status: rockingYn === "'Y'" ? "locked" : useYn === "'Y'" ? "active" : "inactive",
      name: unquote(name),
      email: nullable(mailId),
      phone: nullable(handPhone),
      position: nullable(jikweeNm),
      jobTitle: nullable(jikchakNm),
      isOutsourced: outSourcedYn === "'Y'",
      orgCode: nullable(orgCd),
      orgName: nullable(orgNm),
      updatedAt: parseToDate(chkdate),
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
function splitOracleValues(raw: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let inStr = false;
  let buf = "";

  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];

    if (inStr) {
      buf += c;
      if (c === "'") {
        // 연속 '' 는 이스케이프된 작은따옴표
        if (raw[i + 1] === "'") {
          buf += raw[++i];
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

function unquote(v: string): string {
  if (v === "null") return "";
  const m = v.match(/^'(.*)'$/s);
  if (!m) return v;
  return (m[1] ?? "").replace(/''/g, "'");
}

function nullable(v: string): string | null {
  if (v === "null" || v === "") return null;
  const m = v.match(/^'(.*)'$/s);
  if (!m) return null;
  return (m[1] ?? "").replace(/''/g, "'");
}

function parseToDate(v: string): Date {
  // to_date('2026-01-09 16:36:06','YYYY-MM-DD HH24:MI:SS')
  const m = v.match(/to_date\('([^']+)'\s*,/i);
  if (!m) return new Date();
  return new Date((m[1] ?? "").replace(" ", "T") + "Z");
}
