import type { MemoTreeNode } from "@jarvis/shared/validation/sales/customer-memo";

export type FlatMemoRow = {
  comtSeq: number;
  priorComtSeq: number | null;
  memo: string;
  authorName: string | null;
  insdate: string;
  createdBy: string | null;
};

/**
 * 메모 flat list → 2-level tree.
 * 마스터 의견(priorComtSeq=0 또는 null)은 top-level, reply(priorComtSeq>0)는 해당 master.replies에.
 * orphan reply(부모 master 없음)는 silently 드롭.
 * isOwn = (createdBy === sessionUserId).
 */
export function buildMemoTree(rows: FlatMemoRow[], sessionUserId: string | null): MemoTreeNode[] {
  const masters = new Map<number, MemoTreeNode>();
  const masterOrder: number[] = [];
  const replies: FlatMemoRow[] = [];

  for (const r of rows) {
    if (!r.priorComtSeq || r.priorComtSeq === 0) {
      masters.set(r.comtSeq, {
        comtSeq: r.comtSeq,
        memo: r.memo,
        authorName: r.authorName,
        insdate: r.insdate,
        isOwn: r.createdBy != null && r.createdBy === sessionUserId,
        replies: [],
      });
      masterOrder.push(r.comtSeq);
    } else {
      replies.push(r);
    }
  }
  for (const r of replies) {
    const parent = masters.get(r.priorComtSeq!);
    if (!parent) continue;
    parent.replies.push({
      comtSeq: r.comtSeq,
      memo: r.memo,
      authorName: r.authorName,
      insdate: r.insdate,
      isOwn: r.createdBy != null && r.createdBy === sessionUserId,
      replies: [],
    });
  }
  return masterOrder.map((seq) => masters.get(seq)!).filter(Boolean);
}
