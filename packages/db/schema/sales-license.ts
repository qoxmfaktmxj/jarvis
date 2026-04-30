/**
 * packages/db/schema/sales-license.ts
 *
 * 영업관리 라이센스 관련 테이블 (TBIZ110~TBIZ112).
 *
 * - salesLicense     (TBIZ110): 라이센스 마스터
 * - salesLicenseCode (TBIZ112): 라이센스 종류 코드
 */
import {
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const salesLicense = pgTable(
  "sales_license",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    licenseNo: text("license_no").notNull(),
    customerId: uuid("customer_id"),
    productCd: text("product_cd"),
    licenseKindCd: text("license_kind_cd"),
    sdate: date("sdate"),
    edate: date("edate"),
    qty: integer("qty"),
    remark: text("remark"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    createdBy: uuid("created_by"),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
    updatedBy: uuid("updated_by"),
  },
  (t) => ({
    uniq: uniqueIndex("sales_license_uniq").on(t.workspaceId, t.licenseNo),
    custIdx: index("sales_license_cust_idx").on(t.workspaceId, t.customerId),
  }),
);

export const salesLicenseCode = pgTable(
  "sales_license_code",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    uniq: uniqueIndex("sales_license_code_uniq").on(t.workspaceId, t.code),
  }),
);
