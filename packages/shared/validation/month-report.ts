import { z } from "zod";

const yn = z.enum(["Y", "N"]);
const ymRegex = /^\d{6}$/;

export const monthReportMasterRow = z.object({
  enterCd: z.string(),
  companyCd: z.string(),
  companyName: z.string(),
  signatureYn: yn.nullable(),
  userCntYn: yn.nullable(),
  cpnCntYn: yn.nullable(),
  workTypeYn: yn.nullable(),
  treatTypeYn: yn.nullable(),
  solvedYn: yn.nullable(),
  unsolvedYn: yn.nullable(),
  chargerYn: yn.nullable(),
  infraYn: yn.nullable(),
  replyYn: yn.nullable(),
  chargerSabun1: z.string().nullable(),
  chargerSabun2: z.string().nullable(),
  senderSabun: z.string().nullable(),
  updatedAt: z.string().datetime(),
  updatedByName: z.string().nullable(),
});

export const monthReportDetailMonthRow = z.object({
  enterCd: z.string(),
  companyCd: z.string(),
  ym: z.string().regex(ymRegex),
  aaCnt: z.number().int().nullable(),
  raCnt: z.number().int().nullable(),
  newCnt: z.number().int().nullable(),
  cpnCnt: z.number().int().nullable(),
  attr1: z.string().nullable(),
  attr2: z.string().nullable(),
  attr3: z.string().nullable(),
  attr4: z.string().nullable(),
  updatedAt: z.string().datetime(),
  updatedByName: z.string().nullable(),
});

export const monthReportDetailOtherRow = z.object({
  enterCd: z.string(),
  companyCd: z.string(),
  ym: z.string().regex(ymRegex),
  seq: z.number().int(),
  etcBizCd: z.string().nullable(),
  etcTitle: z.string().nullable(),
  etcMemo: z.string().nullable(),
  updatedAt: z.string().datetime(),
  updatedByName: z.string().nullable(),
});

export const listMonthReportInput = z.object({
  companyNameLike: z.string().optional(),
});

export const listMonthReportOutput = z.object({
  rows: z.array(monthReportMasterRow),
});

export const getMonthReportDetailInput = z.object({
  companyCd: z.string(),
  ym: z.string().regex(ymRegex),
});

export const getMonthReportDetailOutput = z.object({
  master: monthReportMasterRow,
  monthDetail: monthReportDetailMonthRow.nullable(),
  otherDetail: z.array(monthReportDetailOtherRow),
});

export const saveMonthReportMasterInput = monthReportMasterRow
  .omit({ companyName: true, updatedAt: true, updatedByName: true });

export const saveMonthReportDetailMonthInput = monthReportDetailMonthRow
  .omit({ updatedAt: true, updatedByName: true });

export const saveMonthReportDetailOtherInput = z.object({
  companyCd: z.string(),
  ym: z.string().regex(ymRegex),
  creates: z.array(monthReportDetailOtherRow.omit({ enterCd: true, companyCd: true, ym: true, updatedAt: true, updatedByName: true })),
  updates: z.array(monthReportDetailOtherRow.omit({ enterCd: true, companyCd: true, ym: true, updatedAt: true, updatedByName: true })),
  deletes: z.array(z.number().int()),
});

export const saveResult = z.object({
  ok: z.boolean(),
  inserted: z.number().optional(),
  updated: z.number().optional(),
  deleted: z.number().optional(),
  error: z.string().optional(),
});

export type MonthReportMasterRow = z.infer<typeof monthReportMasterRow>;
export type MonthReportDetailMonthRow = z.infer<typeof monthReportDetailMonthRow>;
export type MonthReportDetailOtherRow = z.infer<typeof monthReportDetailOtherRow>;
