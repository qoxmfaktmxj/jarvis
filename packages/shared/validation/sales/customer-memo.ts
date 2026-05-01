import { z } from "zod";

// 메모 트리 노드 (server에서 build 후 client에 그대로 전달)
export const memoTreeNodeSchema: z.ZodType<MemoTreeNode> = z.lazy(() =>
  z.object({
    comtSeq: z.number().int(),
    memo: z.string(),
    authorName: z.string().nullable(),
    insdate: z.string(),
    isOwn: z.boolean(),
    replies: z.array(memoTreeNodeSchema),
  }),
);

export type MemoTreeNode = {
  comtSeq: number;
  memo: string;
  authorName: string | null;
  insdate: string;
  isOwn: boolean;
  replies: MemoTreeNode[];
};

// 입출력
export const customerMemoListInput = z.object({ customerId: z.string().uuid() });
export const customerMemoListOutput = z.object({
  rows: z.array(memoTreeNodeSchema),
});

export const customerMemoCreateInput = z.object({
  customerId: z.string().uuid(),
  priorComtSeq: z.number().int().min(0), // 0 = 마스터 의견, >0 = reply
  memo: z.string().min(1).max(4000),
});
export const customerMemoCreateOutput = z.object({
  ok: z.boolean(),
  comtSeq: z.number().int().nullable(),
});

export const customerMemoDeleteInput = z.object({
  customerId: z.string().uuid(),
  comtSeq: z.number().int(),
});
export const customerMemoDeleteOutput = z.object({ ok: z.boolean() });

// 카운트
export const customerTabCountsInput = z.object({ customerId: z.string().uuid() });
export const customerTabCountsOutput = z.object({
  customerCnt: z.number().int(),
  opCnt: z.number().int(),
  actCnt: z.number().int(),
  comtCnt: z.number().int(),
});
