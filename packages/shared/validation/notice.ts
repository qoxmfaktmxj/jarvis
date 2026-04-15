import { z } from "zod";

export const NOTICE_SENSITIVITY_VALUES = ["PUBLIC", "INTERNAL"] as const;
export const noticeSensitivitySchema = z.enum(NOTICE_SENSITIVITY_VALUES);
export type NoticeSensitivity = z.infer<typeof noticeSensitivitySchema>;

export const createNoticeSchema = z.object({
  title: z.string().trim().min(1).max(500),
  bodyMd: z.string().min(1).max(200_000),
  sensitivity: noticeSensitivitySchema.default("INTERNAL"),
  pinned: z.boolean().default(false),
  publishedAt: z.string().datetime().nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

export const updateNoticeSchema = createNoticeSchema.partial();

export type CreateNoticeInput = z.infer<typeof createNoticeSchema>;
export type UpdateNoticeInput = z.infer<typeof updateNoticeSchema>;
