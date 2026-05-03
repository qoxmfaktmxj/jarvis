import { z } from "zod";

export const createAdditionalDevSchema = z.object({
  projectId: z.string().uuid(),
  projectName: z.string().max(500).optional(),
  requestYearMonth: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  requestSequence: z.coerce.number().int().min(1).optional(),
  requesterName: z.string().max(100).optional(),
  requestContent: z.string().optional(),
  part: z.enum(["Saas", "외부", "모바일", "채용"]).optional(),
  status: z.enum(["협의중", "진행중", "완료", "보류"]).optional(),
  contractNumber: z.string().max(50).optional(),
  contractStartMonth: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  contractEndMonth: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  contractAmount: z.string().optional(),
  isPaid: z.boolean().optional(),
  invoiceIssued: z.boolean().optional(),
  inspectionConfirmed: z.boolean().optional(),
  estimateProgress: z.string().optional(),
  devStartDate: z.string().optional(),
  devEndDate: z.string().optional(),
  pmId: z.string().uuid().optional(),
  developerId: z.string().uuid().optional(),
  vendorContactNote: z.string().optional(),
  paidEffort: z.string().optional(),
  actualEffort: z.string().optional(),
  attachmentFileRef: z.string().max(500).optional(),
  customerCompanyId: z.string().uuid().optional(),
  isOnsite: z.boolean().optional(),
  remark: z.string().optional(),
});

export const updateAdditionalDevSchema = createAdditionalDevSchema
  .omit({ projectId: true })
  .partial();

export const upsertEffortSchema = z.object({
  yearMonth: z.string().regex(/^\d{4}-\d{2}$/),
  effort: z.string().regex(/^\d+(\.\d{1,2})?$/),
});

export const upsertRevenueSchema = z.object({
  yearMonth: z.string().regex(/^\d{4}-\d{2}$/),
  amount: z.string().regex(/^\d+$/),
});

export const addStaffSchema = z.object({
  userId: z.string().uuid().optional(),
  role: z.string().max(50).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});
