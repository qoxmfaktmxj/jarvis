import { z } from "zod";

/**
 * Group 6 통계 — 차트 read-only Zod 입력 스키마.
 *
 * 데이터 모델:
 *   - sales_plan_perf.gubun_cd  ∈ B30010 = ["PLAN" | "ACTUAL" | "FORECAST"]
 *   - sales_plan_perf.trend_gb_cd ∈ B30030 = ["SALES" | "GROSS_PROFIT" | "OP_INCOME"]
 */

export const TrendGbEnum = z.enum(["SALES", "GROSS_PROFIT", "OP_INCOME"]);
export type TrendGb = z.infer<typeof TrendGbEnum>;

export const GubunEnum = z.enum(["PLAN", "ACTUAL", "FORECAST"]);
export type Gubun = z.infer<typeof GubunEnum>;

export const ViewEnum = z.enum(["year", "quarter"]);
export type View = z.infer<typeof ViewEnum>;

const Ym = z.string().regex(/^\d{6}$/, "ym must be YYYYMM");
const Year = z.number().int().min(2000).max(2100);
const OrgCd = z.string().max(20).optional();

// chartMar — 영업마케팅
export const MarketingByActivityInput = z.object({ ym: Ym });
export type MarketingByActivityInput = z.infer<typeof MarketingByActivityInput>;
export const MarketingByProductInput = z.object({ ym: Ym });
export type MarketingByProductInput = z.infer<typeof MarketingByProductInput>;

// chartAdminMgr — 관리자 실적 (연/분기 × SALES/GP/OI × 조직)
export const AdminPerfInput = z.object({
  year: Year,
  view: ViewEnum.default("year"),
  metric: TrendGbEnum.default("SALES"),
  orgCd: OrgCd,
});
export type AdminPerfInput = z.infer<typeof AdminPerfInput>;

// chartPds/saleTrend + profitTrend — 다년 추이 (탭 공유)
export const TrendInput = z.object({
  years: z.array(Year).min(1).max(5),
  orgCd: OrgCd,
  metric: TrendGbEnum,
});
export type TrendInput = z.infer<typeof TrendInput>;

// chartPds/planPerfChart — 계획대비 실적 (단년)
export const PlanPerfChartInput = z.object({
  year: Year,
  orgCd: OrgCd,
  metric: TrendGbEnum.default("SALES"),
});
export type PlanPerfChartInput = z.infer<typeof PlanPerfChartInput>;

// pdsDashBoard — 영업본부 대시보드 4 sub-charts
export const DashboardSalesTrendInput = z.object({ years: z.array(Year).min(1).max(5) });
export type DashboardSalesTrendInput = z.infer<typeof DashboardSalesTrendInput>;
export const DashboardSucProbInput = z.object({ ym: Ym });
export type DashboardSucProbInput = z.infer<typeof DashboardSucProbInput>;
export const DashboardOpIncomeInput = z.object({ year: Year });
export type DashboardOpIncomeInput = z.infer<typeof DashboardOpIncomeInput>;
export const DashboardBAInput = z.object({ ym: Ym });
export type DashboardBAInput = z.infer<typeof DashboardBAInput>;

// chartUpload — sales_plan_perf raw 데이터 입력/Excel 업로드 (Group 6 follow-up)
export const SalesPlanPerfRow = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  ym: Ym,
  orgCd: z.string().min(1).max(20),
  orgNm: z.string().min(1).max(100),
  gubunCd: GubunEnum,
  trendGbCd: TrendGbEnum,
  amt: z.number().int(),
  note: z.string().nullable(),
  createdAt: z.string().datetime().nullable(),
  updatedAt: z.string().datetime().nullable(),
  createdBy: z.string().uuid().nullable(),
  updatedBy: z.string().uuid().nullable(),
});
export type SalesPlanPerfRow = z.infer<typeof SalesPlanPerfRow>;

export const ListPlanPerfUploadInput = z.object({
  q: z.string().optional(),
  ym: Ym.optional(),
  orgCd: z.string().optional(),
  gubunCd: GubunEnum.optional(),
  trendGbCd: TrendGbEnum.optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(500).default(50),
});
export type ListPlanPerfUploadInput = z.infer<typeof ListPlanPerfUploadInput>;

export const SavePlanPerfUploadInput = z.object({
  creates: z.array(SalesPlanPerfRow.omit({ id: true, workspaceId: true, createdAt: true, updatedAt: true, createdBy: true, updatedBy: true }).extend({
    id: z.string(),
  })).default([]),
  updates: z.array(z.object({
    id: z.string().uuid(),
    patch: SalesPlanPerfRow.partial().omit({ id: true, workspaceId: true, createdAt: true, createdBy: true }),
  })).default([]),
  deletes: z.array(z.string().uuid()).default([]),
});
export type SavePlanPerfUploadInput = z.infer<typeof SavePlanPerfUploadInput>;
