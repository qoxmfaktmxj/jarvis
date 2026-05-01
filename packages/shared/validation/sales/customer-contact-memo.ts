import { z } from "zod";

// MemoTreeNode 타입은 customer-memo에서 공유
export type { MemoTreeNode } from "./customer-memo";
import { memoTreeNodeSchema } from "./customer-memo";

// 입출력
export const customerContactMemoListInput = z.object({ contactId: z.string().uuid() });
export const customerContactMemoListOutput = z.object({
  rows: z.array(memoTreeNodeSchema),
});

export const customerContactMemoCreateInput = z.object({
  contactId: z.string().uuid(),
  priorComtSeq: z.number().int().min(0), // 0 = 마스터 의견, >0 = reply
  memo: z.string().min(1).max(4000),
});
export const customerContactMemoCreateOutput = z.object({
  ok: z.boolean(),
  comtSeq: z.number().int().nullable(),
});

export const customerContactMemoDeleteInput = z.object({
  contactId: z.string().uuid(),
  comtSeq: z.number().int(),
});
export const customerContactMemoDeleteOutput = z.object({ ok: z.boolean() });

// 카운트
export const customerContactTabCountsInput = z.object({ contactId: z.string().uuid() });
export const customerContactTabCountsOutput = z.object({
  custCompanyCnt: z.number().int(),
  opCnt: z.number().int(),
  actCnt: z.number().int(),
  comtCnt: z.number().int(),
});
