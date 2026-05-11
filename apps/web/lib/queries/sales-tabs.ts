/**
 * sales_opportunity / sales_activity counts are live as of 2026-05-11 (A2 audit P0-1).
 * Both schemas are merged in main (packages/db/schema/sales-opportunity.ts,
 * packages/db/schema/sales-activity.ts). getCustomerTabCounts / getContactTabCounts
 * return real opCnt / actCnt for the customer and contact respectively.
 */
import type { MemoTreeNode } from "@jarvis/shared/validation/sales/customer-memo";
import { db } from "@jarvis/db/client";
import {
  salesCustomerContact,
  salesCustomerMemo,
  salesCustomerContactMemo,
  salesOpportunity,
  salesActivity,
} from "@jarvis/db/schema";
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
  const [customerCnt, comtCnt, opCnt, actCnt] = await Promise.all([
    db.select({ c: count() }).from(salesCustomerContact)
      .where(and(eq(salesCustomerContact.workspaceId, workspaceId),
                 eq(salesCustomerContact.customerId, customerId)))
      .then(r => Number(r[0]?.c ?? 0)),
    db.select({ c: count() }).from(salesCustomerMemo)
      .where(and(eq(salesCustomerMemo.workspaceId, workspaceId),
                 eq(salesCustomerMemo.customerId, customerId)))
      .then(r => Number(r[0]?.c ?? 0)),
    db.select({ c: count() }).from(salesOpportunity)
      .where(and(eq(salesOpportunity.workspaceId, workspaceId),
                 eq(salesOpportunity.customerId, customerId)))
      .then(r => Number(r[0]?.c ?? 0)),
    db.select({ c: count() }).from(salesActivity)
      .where(and(eq(salesActivity.workspaceId, workspaceId),
                 eq(salesActivity.customerId, customerId)))
      .then(r => Number(r[0]?.c ?? 0)),
  ]);

  return { customerCnt, opCnt, actCnt, comtCnt };
}

export async function getContactTabCounts(workspaceId: string, contactId: string) {
  const [contact] = await db.select({ customerId: salesCustomerContact.customerId })
    .from(salesCustomerContact)
    .where(and(eq(salesCustomerContact.workspaceId, workspaceId),
               eq(salesCustomerContact.id, contactId)));
  const custCompanyCnt = contact?.customerId ? 1 : 0;

  const [comtCnt, opCnt, actCnt] = await Promise.all([
    db.select({ c: count() }).from(salesCustomerContactMemo)
      .where(and(eq(salesCustomerContactMemo.workspaceId, workspaceId),
                 eq(salesCustomerContactMemo.contactId, contactId)))
      .then(r => Number(r[0]?.c ?? 0)),
    db.select({ c: count() }).from(salesOpportunity)
      .where(and(eq(salesOpportunity.workspaceId, workspaceId),
                 eq(salesOpportunity.contactId, contactId)))
      .then(r => Number(r[0]?.c ?? 0)),
    db.select({ c: count() }).from(salesActivity)
      .where(and(eq(salesActivity.workspaceId, workspaceId),
                 eq(salesActivity.contactId, contactId)))
      .then(r => Number(r[0]?.c ?? 0)),
  ]);

  return { custCompanyCnt, opCnt, actCnt, comtCnt };
}
