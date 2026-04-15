import { z } from "zod";
import { SENSITIVITY_LEVELS } from "../types/page.js";

/**
 * Manual raw_source creation (수동 입력)
 * — File upload 없이 markdown 본문을 직접 붙여넣어 ingest 파이프라인에 전달한다.
 * — parsedContent 200KB 상한 (UI에서 선제적으로 거부)
 */
export const createManualRawSourceSchema = z.object({
  title: z.string().min(1).max(500),
  content: z.string().min(1).max(200_000),
  sensitivity: z.enum(SENSITIVITY_LEVELS).default("INTERNAL"),
  authorNote: z.string().max(2000).optional(),
});

export type CreateManualRawSourceInput = z.infer<
  typeof createManualRawSourceSchema
>;
