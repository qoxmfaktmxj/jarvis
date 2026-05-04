import { z } from "zod";

export const HIGHER_CD_VALUES = ["H008", "H028", "H030", "H010", "H027", "H038"] as const;
export const higherCdEnum = z.enum(HIGHER_CD_VALUES);

export const importIncidentsInput = z.object({
  ym: z.string().regex(/^\d{6}$/, "ym must be YYYYMM"),
  categories: z.array(higherCdEnum).optional(),
  async: z.boolean().optional().default(false),
});

export const importIncidentsOutput = z.object({
  ok: z.boolean(),
  inserted: z.number(),
  deleted: z.number(),
  errors: z.array(z.object({ higherCd: z.string(), message: z.string() })),
});

export const statsInput = z.object({
  yyyymmFrom: z.string().regex(/^\d{6}$/),
  yyyymmTo: z.string().regex(/^\d{6}$/),
  categories: z.array(higherCdEnum).min(1),
  cntRatio: z.number().min(0).max(100).default(50),
});

export const statsRow = z.object({
  label: z.string(),
  cnt: z.number(),
  workTime: z.number(),
  rankingTime: z.number(),
  rankingCnt: z.number(),
  finalRank: z.number(),
});

export const statsOutput = z.object({ rows: z.array(statsRow), total: z.number() });

export const statsCombinedRow = z.object({
  managerNm: z.string().nullable(),
  requestCompanyNm: z.string().nullable(),
  cnt: z.number(),
  workTime: z.number(),
  total: z.number(),
  finalRank: z.number(),
});

export const statsCombinedOutput = z.object({ rows: z.array(statsCombinedRow) });

export type ImportIncidentsInput = z.infer<typeof importIncidentsInput>;
export type StatsInput = z.infer<typeof statsInput>;
export type StatsRow = z.infer<typeof statsRow>;
export type StatsCombinedRow = z.infer<typeof statsCombinedRow>;
