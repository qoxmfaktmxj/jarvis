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
