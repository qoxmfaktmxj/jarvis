#!/usr/bin/env node
/**
 * import-grid-coords.mjs — 기상청 격자 위경도 xlsx → seed/grid-coords.json 변환.
 *
 * Source: .local/기상청41_..._격자_위경도(2510).xlsx (3행 헤더, 약 3,800 row).
 * Output: packages/db/seed/grid-coords.json
 *
 * 그리고 같은 데이터로 packages/db/drizzle/0044_seed_region_grid.sql 도 생성해서
 * `pnpm db:migrate`로 자동 적재되게 만든다 (idempotent: ON CONFLICT DO NOTHING).
 *
 * Usage:
 *   node scripts/import-grid-coords.mjs
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

const XLSX_PATH = resolve(
  REPO_ROOT,
  ".local/기상청41_단기예보 조회서비스_오픈API활용가이드_2510/기상청41_단기예보 조회서비스_오픈API활용가이드_격자_위경도(2510).xlsx"
);
const JSON_OUT = resolve(REPO_ROOT, "packages/db/seed/grid-coords.json");
const SQL_OUT = resolve(
  REPO_ROOT,
  "packages/db/drizzle/0044_seed_region_grid.sql"
);

function findHeaderRow(rows) {
  // 2510 파일 기준: row0이 헤더 ('구분', '행정구역코드', '1단계', '2단계', '3단계', '격자 X', '격자 Y', ...).
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const row = rows[i] ?? [];
    const joined = row.map((v) => String(v ?? "")).join("|");
    if (
      joined.includes("1단계") &&
      joined.includes("2단계") &&
      joined.includes("격자")
    ) {
      return i;
    }
  }
  return 0;
}

function pickColumn(header, ...keywords) {
  for (let i = 0; i < header.length; i++) {
    const cell = String(header[i] ?? "").trim();
    if (keywords.some((k) => cell.includes(k))) return i;
  }
  return -1;
}

function escapeSqlString(s) {
  return String(s).replace(/'/g, "''");
}

function main() {
  console.log(`[import-grid-coords] reading: ${XLSX_PATH}`);
  const buf = readFileSync(XLSX_PATH);
  const wb = XLSX.read(buf, { type: "buffer" });
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    blankrows: false,
    raw: true
  });

  const headerIdx = findHeaderRow(rows);
  const header = rows[headerIdx] ?? [];
  console.log(
    `[import-grid-coords] header at row ${headerIdx + 1}:`,
    header
  );

  const sidoCol = pickColumn(header, "1단계", "시도");
  const sigunguCol = pickColumn(header, "2단계", "시군구");
  const dongCol = pickColumn(header, "3단계", "읍면동");
  const nxCol = pickColumn(header, "격자 X", "격자X", "예보지점 X");
  const nyCol = pickColumn(header, "격자 Y", "격자Y", "예보지점 Y");
  // 2510 파일은 "경도(초/100)" / "위도(초/100)" 컬럼이 WGS84 decimal degree 값이다.
  // (이름과 다르게 시·분·초가 아니라 full decimal — 첫 데이터 행에 126.98... / 37.56... 확인됨)
  const lngDecCol = pickColumn(header, "경도(초/100)", "경도(degree)", "경도(도)");
  const latDecCol = pickColumn(header, "위도(초/100)", "위도(degree)", "위도(도)");

  if (
    sidoCol < 0 ||
    sigunguCol < 0 ||
    nxCol < 0 ||
    nyCol < 0 ||
    latDecCol < 0 ||
    lngDecCol < 0
  ) {
    console.error(
      "[import-grid-coords] 헤더에서 필수 컬럼을 못 찾음:",
      JSON.stringify({
        sidoCol,
        sigunguCol,
        dongCol,
        nxCol,
        nyCol,
        latDecCol,
        lngDecCol
      })
    );
    console.error("Header dump:", header);
    process.exit(1);
  }

  const records = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    const sido = String(row[sidoCol] ?? "").trim();
    const sigungu = String(row[sigunguCol] ?? "").trim();
    if (!sido || !sigungu) continue;
    const dongRaw = dongCol >= 0 ? row[dongCol] : null;
    const dong =
      dongRaw === null || dongRaw === undefined || dongRaw === ""
        ? null
        : String(dongRaw).trim();
    const nx = Number(row[nxCol]);
    const ny = Number(row[nyCol]);
    const lat = Number(row[latDecCol]);
    const lng = Number(row[lngDecCol]);
    if (
      !Number.isFinite(nx) ||
      !Number.isFinite(ny) ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng)
    ) {
      continue;
    }
    records.push({ sido, sigungu, dong, nx, ny, lat, lng });
  }

  console.log(`[import-grid-coords] parsed ${records.length} rows`);

  // --- JSON ---
  mkdirSync(dirname(JSON_OUT), { recursive: true });
  writeFileSync(JSON_OUT, JSON.stringify(records, null, 2), "utf8");
  console.log(`[import-grid-coords] wrote: ${JSON_OUT}`);

  // --- SQL migration (idempotent via NOT EXISTS) ---
  // Drizzle의 `--> statement-breakpoint`로 chunk 단위 분할 (PG max statement size 회피).
  const lines = [];
  lines.push(
    "-- Phase-Dashboard 0 (2026-04-30) — 기상청 격자좌표 seed."
  );
  lines.push(
    "-- Source: .local/기상청41_*_격자_위경도(2510).xlsx (자동 생성, scripts/import-grid-coords.mjs)."
  );
  lines.push(
    "-- Idempotent: NOT EXISTS sub-query로 중복 삽입 방지. 격자좌표는 기상청이 변경할 일 거의 없음."
  );
  lines.push("");
  const CHUNK = 500;
  for (let i = 0; i < records.length; i += CHUNK) {
    const chunk = records.slice(i, i + CHUNK);
    const valueRows = chunk
      .map((r) => {
        const dongSql = r.dong === null ? "NULL" : `'${escapeSqlString(r.dong)}'`;
        return `  ('${escapeSqlString(r.sido)}', '${escapeSqlString(r.sigungu)}', ${dongSql}, ${r.nx}, ${r.ny}, ${r.lat}, ${r.lng})`;
      })
      .join(",\n");
    lines.push("INSERT INTO \"region_grid\" (sido, sigungu, dong, nx, ny, lat, lng)");
    lines.push("SELECT v.sido, v.sigungu, v.dong, v.nx, v.ny, v.lat, v.lng FROM (VALUES");
    lines.push(valueRows);
    lines.push(") AS v(sido, sigungu, dong, nx, ny, lat, lng)");
    lines.push(
      "WHERE NOT EXISTS (SELECT 1 FROM \"region_grid\" g WHERE g.sido=v.sido AND g.sigungu=v.sigungu AND COALESCE(g.dong,'') = COALESCE(v.dong,'') AND g.nx=v.nx AND g.ny=v.ny);"
    );
    if (i + CHUNK < records.length) {
      lines.push("--> statement-breakpoint");
    }
  }
  lines.push("");

  writeFileSync(SQL_OUT, lines.join("\n"), "utf8");
  console.log(`[import-grid-coords] wrote: ${SQL_OUT}`);

  // sample 출력
  const sample = records.slice(0, 5);
  console.log("[import-grid-coords] sample rows:");
  for (const r of sample) console.log("  ", r);
}

main();
