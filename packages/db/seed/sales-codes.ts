/**
 * packages/db/seed/sales-codes.ts
 *
 * 영업관리모듈 Phase 1 — 10개 코드 그룹 시드.
 * TBIZ100(고객사 마스터) 기준 코드 컬럼에서 사용되는 그룹.
 * 실제 Oracle 덤프 추출 전 placeholder 값 포함 — 운영 데이터 확보 후 갱신.
 */
import { sql } from "drizzle-orm";
import { db } from "../client.js";
import { codeGroup, codeItem } from "../schema/code.js";

type SeedItem = { code: string; name: string };
type SeedGroup = { code: string; name: string; items: SeedItem[] };

const SALES_CODE_GROUPS: SeedGroup[] = [
  {
    code: "SALES_CUST_KIND",
    name: "고객 종류",
    items: [
      { code: "01", name: "일반" },
      { code: "02", name: "VIP" },
      { code: "03", name: "파트너" },
      { code: "04", name: "잠재고객" },
      { code: "99", name: "기타" },
    ],
  },
  {
    code: "SALES_CUST_DIV",
    name: "고객 구분",
    items: [
      { code: "01", name: "법인" },
      { code: "02", name: "개인사업자" },
      { code: "03", name: "공공기관" },
      { code: "04", name: "기관" },
      { code: "99", name: "기타" },
    ],
  },
  {
    code: "SALES_EXCHANGE_TYPE",
    name: "거래 유형",
    items: [
      { code: "01", name: "직거래" },
      { code: "02", name: "채널" },
      { code: "03", name: "대리점" },
      { code: "04", name: "온라인" },
      { code: "99", name: "기타" },
    ],
  },
  {
    code: "SALES_CUST_SOURCE",
    name: "고객 소스",
    items: [
      { code: "01", name: "인바운드" },
      { code: "02", name: "아웃바운드" },
      { code: "03", name: "소개" },
      { code: "04", name: "전시/행사" },
      { code: "99", name: "기타" },
    ],
  },
  {
    code: "SALES_CUST_IMPR",
    name: "고객 인상",
    items: [
      { code: "01", name: "좋음" },
      { code: "02", name: "보통" },
      { code: "03", name: "나쁨" },
      { code: "04", name: "미확인" },
    ],
  },
  {
    code: "SALES_BUY_INFO",
    name: "구매 정보",
    items: [
      { code: "01", name: "구매확정" },
      { code: "02", name: "검토중" },
      { code: "03", name: "보류" },
      { code: "04", name: "미정" },
    ],
  },
  {
    code: "SALES_BUY_INFO_DT",
    name: "구매 정보 일자",
    items: [
      { code: "01", name: "1개월내" },
      { code: "02", name: "3개월내" },
      { code: "03", name: "6개월내" },
      { code: "04", name: "1년내" },
      { code: "99", name: "미정" },
    ],
  },
  {
    code: "SALES_BUSINESS_KIND",
    name: "업종",
    items: [
      { code: "01", name: "제조" },
      { code: "02", name: "IT/SW" },
      { code: "03", name: "유통/물류" },
      { code: "04", name: "금융" },
      { code: "05", name: "공공기관" },
      { code: "06", name: "의료/제약" },
      { code: "07", name: "건설/부동산" },
      { code: "08", name: "서비스" },
      { code: "99", name: "기타" },
    ],
  },
  {
    code: "SALES_PRODUCT_TYPE",
    name: "제품 유형",
    items: [
      { code: "01", name: "ERP" },
      { code: "02", name: "HRM" },
      { code: "03", name: "SCM" },
      { code: "04", name: "CRM" },
      { code: "05", name: "BI/분석" },
      { code: "99", name: "기타" },
    ],
  },
  {
    code: "SALES_LICENSE_KIND",
    name: "라이센스 종류",
    items: [
      { code: "01", name: "영구" },
      { code: "02", name: "연간구독" },
      { code: "03", name: "월구독" },
      { code: "04", name: "사용자당" },
      { code: "05", name: "CPU당" },
      { code: "99", name: "기타" },
    ],
  },
];

async function upsertCodeGroup(
  wsId: string,
  code: string,
  name: string,
): Promise<string> {
  const result = await db
    .insert(codeGroup)
    .values({ workspaceId: wsId, code, name })
    .onConflictDoUpdate({
      target: [codeGroup.workspaceId, codeGroup.code],
      set: { name: sql`excluded.name` },
    })
    .returning({ id: codeGroup.id });

  if (result[0]) return result[0].id;

  // Fallback: fetch existing id
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
  items: SeedItem[],
): Promise<void> {
  if (items.length === 0) return;
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

export async function seedSalesCodes(wsId: string): Promise<void> {
  for (const group of SALES_CODE_GROUPS) {
    const groupId = await upsertCodeGroup(wsId, group.code, group.name);
    await upsertCodeItems(groupId, group.items);
    console.log(`[seed/sales-codes] ${group.code} (${group.name}): ${group.items.length}건`);
  }
  console.log(`[seed/sales-codes] ${SALES_CODE_GROUPS.length}개 그룹 완료`);
}
