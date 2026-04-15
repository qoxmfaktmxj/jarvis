import { z } from "zod";
import { REVIEW_KINDS } from "../constants/review-kinds.js";

/**
 * packages/shared/validation/wiki.ts
 *
 * Phase-W2 — Wiki editor save / search 입력 검증 스키마.
 */
export const wikiSavePayloadSchema = z.object({
  workspaceId: z.string().uuid(),
  pageSlug: z.string().min(1).max(500),
  markdown: z.string().max(512_000),
  frontmatter: z.record(z.unknown()),
});

export type WikiSavePayload = z.infer<typeof wikiSavePayloadSchema>;

export const wikiSearchQuerySchema = z.object({
  workspaceId: z.string().uuid(),
  q: z.string().max(100),
  limit: z.number().int().min(1).max(20).default(6),
});

export type WikiSearchQuery = z.infer<typeof wikiSearchQuerySchema>;

export const filterKindSchema = z.enum(REVIEW_KINDS).optional();
