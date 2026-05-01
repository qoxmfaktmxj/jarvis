/**
 * [P2-BLOCKED] sales_opportunity / sales_activity 의존성:
 * P2 plan(bold-noether-742a91)이 main에 머지된 직후 본 파일의 주석 처리된 import + count
 * SQL을 활성화하라. 활성화 위치: getCustomerTabCounts 내 opCnt/actCnt 계산, getContactTabCounts
 * 동상. e2e 테스트(`sales-customers-tabs.spec.ts`)도 op/act > 0 케이스로 갱신 필요.
 */
import type { MemoTreeNode } from "@jarvis/shared/validation/sales/customer-memo";
import { db } from "@jarvis/db/client";
import { salesCustomerContact, salesCustomerMemo, salesCustomerContactMemo } from "@jarvis/db/schema";
// [P2-BLOCKED] uncomment after P2 (bold-noether-742a91) merges:
// import { salesOpportunity, salesActivity } from "@jarvis/db/schema";
import { and, count, eq } from "drizzle-orm";

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

export async function getCustomerTabCounts(workspaceId: string, customerId: string) {
  const [customerCnt, comtCnt] = await Promise.all([
    db.select({ c: count() }).from(salesCustomerContact)
      .where(and(eq(salesCustomerContact.workspaceId, workspaceId),
                 eq(salesCustomerContact.customerId, customerId)))
      .then(r => Number(r[0]?.c ?? 0)),
    db.select({ c: count() }).from(salesCustomerMemo)
      .where(and(eq(salesCustomerMemo.workspaceId, workspaceId),
                 eq(salesCustomerMemo.customerId, customerId)))
      .then(r => Number(r[0]?.c ?? 0)),
  ]);

  // [P2-BLOCKED] activate after P2 schema merges. See file header for details.
  // const [opCnt, actCnt] = await Promise.all([
  //   db.select({ c: count() }).from(salesOpportunity)
  //     .where(and(eq(salesOpportunity.workspaceId, workspaceId),
  //                eq(salesOpportunity.customerId, customerId)))
  //     .then(r => Number(r[0]?.c ?? 0)),
  //   db.select({ c: count() }).from(salesActivity)
  //     .where(and(eq(salesActivity.workspaceId, workspaceId),
  //                eq(salesActivity.customerId, customerId)))
  //     .then(r => Number(r[0]?.c ?? 0)),
  // ]);
  const opCnt = 0;
  const actCnt = 0;

  return { customerCnt, opCnt, actCnt, comtCnt };
}

export async function getContactTabCounts(workspaceId: string, contactId: string) {
  const [contact] = await db.select({ customerId: salesCustomerContact.customerId })
    .from(salesCustomerContact)
    .where(and(eq(salesCustomerContact.workspaceId, workspaceId),
               eq(salesCustomerContact.id, contactId)));
  const custCompanyCnt = contact?.customerId ? 1 : 0;

  const comtCnt = await db.select({ c: count() }).from(salesCustomerContactMemo)
    .where(and(eq(salesCustomerContactMemo.workspaceId, workspaceId),
               eq(salesCustomerContactMemo.contactId, contactId)))
    .then(r => Number(r[0]?.c ?? 0));

  // [P2-BLOCKED] activate after P2 schema merges.
  const opCnt = 0;
  const actCnt = 0;

  return { custCompanyCnt, opCnt, actCnt, comtCnt };
}
