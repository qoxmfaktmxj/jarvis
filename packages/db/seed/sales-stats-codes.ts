/**
 * packages/db/seed/sales-stats-codes.ts
 *
 * Sales Group 6 (Statistics) — 4 code groups:
 *   B30010 계획/실적/전망 구분 (PLAN | ACTUAL | FORECAST)
 *   B30030 값 구분 (SALES | GROSS_PROFIT | OP_INCOME)
 *   B10026 성공확률 등급 (A/B/C/D)
 *   B10027 성공확률 합산 (HIGH/MED/LOW)
 *
 * Idempotent — safe to re-run.
 */
import { sql } from "drizzle-orm";
import { db } from "../client.js";
import { codeGroup, codeItem } from "../schema/code.js";

interface CodeGroupSeed {
  code: string;
  name: string;
  items: { code: string; name: string }[];
}

const SEEDS: CodeGroupSeed[] = [
  {
    code: "B30010",
    name: "계획/실적/전망 구분",
    items: [
      { code: "PLAN", name: "계획" },
      { code: "ACTUAL", name: "실적" },
      { code: "FORECAST", name: "전망" },
    ],
  },
  {
    code: "B30030",
    name: "값 구분",
    items: [
      { code: "SALES", name: "매출" },
      { code: "GROSS_PROFIT", name: "매출총이익" },
      { code: "OP_INCOME", name: "영업이익" },
    ],
  },
  {
    code: "B10026",
    name: "성공확률 등급",
    items: [
      { code: "A", name: "A등급(90%↑)" },
      { code: "B", name: "B등급(70~89%)" },
      { code: "C", name: "C등급(50~69%)" },
      { code: "D", name: "D등급(50%↓)" },
    ],
  },
  {
    code: "B10027",
    name: "성공확률 합산",
    items: [
      { code: "HIGH", name: "고확률" },
      { code: "MED", name: "중확률" },
      { code: "LOW", name: "저확률" },
    ],
  },
];

async function upsertGroup(workspaceId: string, seed: CodeGroupSeed): Promise<string> {
  const result = await db
    .insert(codeGroup)
    .values({ workspaceId, code: seed.code, name: seed.name })
    .onConflictDoUpdate({
      target: [codeGroup.workspaceId, codeGroup.code],
      set: { name: sql`excluded.name` },
    })
    .returning({ id: codeGroup.id });
  if (result[0]) return result[0].id;
  const [existing] = await db
    .select({ id: codeGroup.id })
    .from(codeGroup)
    .where(sql`${codeGroup.workspaceId} = ${workspaceId} AND ${codeGroup.code} = ${seed.code}`)
    .limit(1);
  if (!existing) throw new Error(`code_group (${seed.code}) not found after upsert`);
  return existing.id;
}

export async function seedSalesStatsCodes(workspaceId: string): Promise<void> {
  for (const seed of SEEDS) {
    const groupId = await upsertGroup(workspaceId, seed);
    if (seed.items.length === 0) continue;
    await db
      .insert(codeItem)
      .values(seed.items.map((item, idx) => ({
        groupId, code: item.code, name: item.name, sortOrder: idx,
      })))
      .onConflictDoUpdate({
        target: [codeItem.groupId, codeItem.code],
        set: { name: sql`excluded.name`, sortOrder: sql`excluded.sort_order` },
      });
  }
  console.log(`✓ seeded ${SEEDS.length} sales stats code groups`);
}
