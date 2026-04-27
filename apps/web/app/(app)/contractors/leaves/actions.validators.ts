import { z } from "zod";

const LEAVE_TYPES = ["annual", "halfAm", "halfPm", "sick", "family"] as const;

const insertSchema = z.object({
  type: z.enum(LEAVE_TYPES),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hours: z.number().positive(),
  reason: z.string().max(500).optional().nullable()
});

export const leaveBatchInputSchema = z.object({
  contractId: z.string().uuid(),
  inserts: z.array(insertSchema),
  cancels: z.array(z.string().uuid())
});

export type LeaveBatchInput = z.infer<typeof leaveBatchInputSchema>;

export function validateBatchBusinessRules(input: LeaveBatchInput): void {
  for (const ins of input.inserts) {
    if (ins.startDate > ins.endDate) throw new Error("invalid-range");
    if (ins.hours <= 0) throw new Error("invalid-hours");
  }
}
