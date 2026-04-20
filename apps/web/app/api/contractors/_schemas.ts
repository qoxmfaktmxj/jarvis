import { z } from "zod";

export const listContractorsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  q: z.string().trim().min(1).optional(),
  status: z.enum(["active", "expired", "terminated"]).optional(),
  orgId: z.string().uuid().optional()
});

export const createContractorBodySchema = z.object({
  name: z.string().min(1).max(100),
  employeeId: z.string().min(1).max(50),
  email: z.string().email().optional(),
  phone: z.string().max(50).optional(),
  orgId: z.string().uuid().optional(),
  position: z.string().max(100).optional(),
  enterCd: z.string().max(30).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  additionalLeaveHours: z.number().min(0).optional(),
  note: z.string().max(2000).optional()
});

export const updateContractBodySchema = z.object({
  enterCd: z.string().max(30).nullable().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  generatedLeaveHours: z.number().min(0).optional(),
  additionalLeaveHours: z.number().min(0).optional(),
  note: z.string().max(2000).nullable().optional()
});

export const renewContractBodySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().max(2000).optional()
});

export const createLeaveBodySchema = z.object({
  type: z.enum(["day_off", "half_am", "half_pm", "hourly", "sick", "public"]),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timeFrom: z.string().datetime().optional(),
  timeTo: z.string().datetime().optional(),
  reason: z.string().max(1000).optional()
});

export const updateLeaveBodySchema = createLeaveBodySchema.partial();
