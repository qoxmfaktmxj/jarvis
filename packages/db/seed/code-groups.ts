/**
 * packages/db/seed/code-groups.ts
 *
 * C10100 대상구분, C10005 업종, C10002 그룹사 코드 그룹 시드.
 * TSMT001 데이터에서 실제 등장하는 코드를 동적으로 추출하여 삽입.
 */
import path from "node:path";
import url from "node:url";
import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { db } from "../client.js";
import { codeGroup, codeItem } from "../schema/code.js";
import { workspace } from "../schema/tenant.js";
import { eq } from "drizzle-orm";
import { parseTsmt001 } from "./parsers/parse-tsmt001.js";

const here = path.dirname(url.fileURLToPath(import.meta.url));
const TSMT001_PATH = path.resolve(here, "../../../.local/TSMT001_회사마스터.sql");

// C10100 대상구분 — 알려진 코드 라벨
const OBJECT_DIV_LABELS: Record<string, string> = {
  "001": "고객사",
  "003": "개인",
  "005": "외부",
  "007": "인프라",
  "009": "기타",
};

// C10005 업종 — 알려진 코드 라벨
const INDUSTRY_LABELS: Record<string, string> = {
  "001": "제조/건설/유통",
  "002": "기타",
  "003": "금융",
  "999": "해당 없음",
};

async function upsertCodeGroup(
  wsId: string,
  code: string,
  name: string,
): Promise<string> {
  // unique index: (workspace_id, code)
  const result = await db
    .insert(codeGroup)
    .values({ workspaceId: wsId, code, name })
    .onConflictDoUpdate({
      target: [codeGroup.workspaceId, codeGroup.code],
      set: { name: sql`excluded.name` },
    })
    .returning({ id: codeGroup.id });

  if (result[0]) return result[0].id;

  // Drizzle onConflictDoUpdate returning이 빈 배열을 반환하는 경우 대비
  const [existing] = await db
    .select({ id: codeGroup.id })
    .from(codeGroup)
    .where(sql`${codeGroup.workspaceId} = ${wsId} AND ${codeGroup.code} = ${code}`)
    .limit(1);

  if (!existing) throw new Error(`code_group (${code}) not found after upsert`);
  return existing.id;
}

async function upsertCodeItems(
  groupId: string,
  items: { code: string; name: string }[],
): Promise<void> {
  if (items.length === 0) return;
  // unique index: (group_id, code)
  await db
    .insert(codeItem)
    .values(
      items.map((item, idx) => ({
        groupId,
        code: item.code,
        name: item.name,
        sortOrder: idx,
      })),
    )
    .onConflictDoUpdate({
      target: [codeItem.groupId, codeItem.code],
      set: { name: sql`excluded.name`, sortOrder: sql`excluded.sort_order` },
    });
}

export async function seedCodeGroups(
  wsId: string,
  sqlPath = TSMT001_PATH,
): Promise<{ objectDiv: number; industry: number; groupCode: number }> {
  const raw = readFileSync(sqlPath, "utf8");
  const rows = parseTsmt001(raw);

  // 1. C10100 대상구분: 데이터에서 발견된 모든 코드 + 알려진 라벨 우선
  const objectDivCodes = Array.from(
    new Set(rows.map((r) => r.objectDiv).filter((c): c is string => Boolean(c))),
  ).sort();
  const objectDivItems = objectDivCodes.map((code) => ({
    code,
    name: OBJECT_DIV_LABELS[code] ?? code,
  }));
  const grpObjId = await upsertCodeGroup(wsId, "C10100", "대상구분");
  await upsertCodeItems(grpObjId, objectDivItems);

  // 2. C10005 업종: 데이터에서 발견된 모든 코드 + 알려진 라벨 우선
  const industryCodes = Array.from(
    new Set(
      rows
        .map((r) => r.industryCode)
        .filter((c): c is string => Boolean(c)),
    ),
  ).sort();
  const industryItems = industryCodes.map((code) => ({
    code,
    name: INDUSTRY_LABELS[code] ?? code,
  }));
  const grpIndId = await upsertCodeGroup(wsId, "C10005", "업종");
  await upsertCodeItems(grpIndId, industryItems);

  // 3. C10002 그룹사: 동적 추출, 라벨 = 코드값 (사용자가 추후 편집)
  const groupCodes = Array.from(
    new Set(
      rows
        .map((r) => r.groupCode)
        .filter((c): c is string => Boolean(c)),
    ),
  ).sort();
  const groupItems = groupCodes.map((code) => ({ code, name: code }));
  const grpGrpId = await upsertCodeGroup(wsId, "C10002", "그룹사");
  await upsertCodeItems(grpGrpId, groupItems);

  console.log(
    `[seed/codes] C10100(대상구분): ${objectDivItems.length}, C10005(업종): ${industryItems.length}, C10002(그룹사): ${groupItems.length}`,
  );

  return {
    objectDiv: objectDivItems.length,
    industry: industryItems.length,
    groupCode: groupItems.length,
  };
}
