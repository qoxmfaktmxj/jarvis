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
export const activityMemoListInput = z.object({ activityId: z.string().uuid() });
export const activityMemoListOutput = z.object({
  rows: z.array(memoTreeNodeSchema),
});

export const activityMemoCreateInput = z.object({
  activityId: z.string().uuid(),
  priorComtSeq: z.number().int().min(0), // 0 = 마스터 의견, >0 = reply
  memo: z.string().min(1).max(4000),
});
export const activityMemoCreateOutput = z.object({
  ok: z.boolean(),
  comtSeq: z.number().int().nullable(),
});

export const activityMemoDeleteInput = z.object({
  activityId: z.string().uuid(),
  comtSeq: z.number().int(),
});
export const activityMemoDeleteOutput = z.object({ ok: z.boolean() });
