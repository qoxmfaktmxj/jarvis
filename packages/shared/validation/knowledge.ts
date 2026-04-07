import { z } from "zod";
import { PAGE_TYPES, SENSITIVITY_LEVELS } from "../types/page.js";

export const createKnowledgePageSchema = z.object({
  pageType: z.enum(PAGE_TYPES),
  title: z.string().min(1).max(500),
  slug: z.string().min(1).max(500).regex(/^[a-z0-9-]+$/),
  body: z.string().default(""),
  summary: z.string().max(2000).optional(),
  sensitivity: z.enum(SENSITIVITY_LEVELS).default("INTERNAL"),
  freshnessSLADays: z.number().int().min(0).default(90),
  tags: z.array(z.string().max(100)).default([]),
  secretRefs: z.array(z.string()).default([]),
  changeNote: z.string().max(500).optional()
});

export const updateKnowledgePageSchema = createKnowledgePageSchema.partial();
export type CreateKnowledgePage = z.infer<typeof createKnowledgePageSchema>;
export type UpdateKnowledgePage = z.infer<typeof updateKnowledgePageSchema>;
