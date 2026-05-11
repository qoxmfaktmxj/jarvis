import { z } from "zod";

/**
 * Manual raw_source creation (수동 입력)
 * — File upload 없이 markdown 본문을 직접 붙여넣어 ingest 파이프라인에 전달한다.
 * — parsedContent 200KB 상한 (UI에서 선제적으로 거부)
 *
 * Step 2D (2026-05-11): raw_source.sensitivity 컬럼 제거 (D2=B) — sensitivity
 * 입력 필드 삭제. 호출자(UI / API) 모두 이미 sensitivity 를 전송하지 않는다.
 */
export const createManualRawSourceSchema = z.object({
  title: z.string().min(1).max(500),
  content: z.string().min(1).max(200_000),
  authorNote: z.string().max(2000).optional(),
});

export type CreateManualRawSourceInput = z.infer<
  typeof createManualRawSourceSchema
>;
