import { z } from "zod";

export interface ChatMessage {
  role: "system" | "user";
  content: string;
}

export interface ExistingPage {
  path: string;
  title: string;
  summary?: string;
}

export const evidenceFindingSchema = z.object({
  claim: z.string().min(1),
  sourceRevisionId: z.string().uuid(),
  locator: z.string().min(1).max(300),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  confidence: z.number().min(0).max(1),
});

export const analysisResultSchema = z.object({
  title: z.string().min(1),
  pageType: z.enum(["source", "concept", "case", "guide"]),
  findings: z.array(evidenceFindingSchema),
  contradictions: z.array(
    z.object({
      claim: z.string().min(1),
      revisionIds: z.array(z.string().uuid()).min(1),
      reason: z.string().min(1),
    }),
  ),
  proposedLinks: z.array(z.string().min(1)),
});

export const fileBlockSchema = z.object({
  path: z.string().min(1),
  content: z.string().min(1),
  mode: z.literal("overwrite"),
});

export const reviewBlockSchema = z.object({
  type: z.string().min(1),
  title: z.string().min(1),
  body: z.string(),
  options: z.array(z.string()).optional(),
  pages: z.array(z.string()).optional(),
  search: z.array(z.string()).optional(),
});

export const generationOutputSchema = z.object({
  files: z.array(fileBlockSchema).min(1),
  reviews: z.array(reviewBlockSchema),
});

export type EvidenceFinding = z.infer<typeof evidenceFindingSchema>;
export type AnalysisResult = z.infer<typeof analysisResultSchema>;
export type FileBlock = z.infer<typeof fileBlockSchema>;
export type ReviewBlock = z.infer<typeof reviewBlockSchema>;
export type GenerationOutput = z.infer<typeof generationOutputSchema>;
