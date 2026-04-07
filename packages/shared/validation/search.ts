import { z } from "zod";
import { PAGE_TYPES, SENSITIVITY_LEVELS } from "../types/page.js";

export const searchQuerySchema = z.object({
  query: z.string().min(1).max(500),
  filters: z
    .object({
      pageType: z.array(z.enum(PAGE_TYPES)).optional(),
      sensitivity: z.array(z.enum(SENSITIVITY_LEVELS)).optional(),
      dateFrom: z.string().datetime().optional(),
      dateTo: z.string().datetime().optional()
    })
    .optional(),
  sort: z.enum(["relevance", "newest", "freshness", "hybrid"]).default("hybrid"),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
  explain: z.boolean().default(false),
  highlight: z.boolean().default(true)
});

export type SearchQuery = z.infer<typeof searchQuerySchema>;
