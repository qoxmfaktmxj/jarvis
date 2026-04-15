import { z } from "zod";

export const approveCommentSchema = z.object({
  id: z.string().uuid(),
  comment: z.string().max(5000).optional(),
});

export const rejectReasonSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().trim().min(1).max(5000),
});

export const deferSchema = z.object({
  id: z.string().uuid(),
});
