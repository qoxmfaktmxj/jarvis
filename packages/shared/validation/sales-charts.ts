import { z } from "zod";

export const TrendGbEnum = z.enum(["SALES", "GROSS_PROFIT", "OP_INCOME"]);
export type TrendGb = z.infer<typeof TrendGbEnum>;

export const ViewEnum = z.enum(["year", "quarter"]);
export type View = z.infer<typeof ViewEnum>;

const Ym = z.string().regex(/^\d{6}$/, "ym must be YYYYMM");
const Year = z.number().int().min(2000).max(2100);
const OrgCd = z.string().max(20).optional();

export const MarketingByActivityInput = z.object({ ym: Ym });
export const MarketingByProductInput  = z.object({ ym: Ym });

export const AdminPerfInput = z.object({
  year: Year,
  view: ViewEnum.default("year"),
  metric: TrendGbEnum.default("SALES"),
  orgCd: OrgCd,
});

export const TrendInput = z.object({
  years: z.array(Year).min(1).max(5),
  orgCd: OrgCd,
  metric: TrendGbEnum,
});

export const PlanPerfChartInput = z.object({
  year: Year,
  orgCd: OrgCd,
});

export const DashboardSalesTrendInput = z.object({
  years: z.array(Year).min(1).max(5),
});
export const DashboardSucProbInput = z.object({ ym: Ym });
export const DashboardOpIncomeInput = z.object({ year: Year });
export const DashboardBAInput = z.object({ ym: Ym });
