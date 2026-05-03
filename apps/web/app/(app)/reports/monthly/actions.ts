"use server";

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@jarvis/db/client";
import {
  monthReportMaster,
  monthReportDetailMonth,
  monthReportDetailOther,
  auditLog,
} from "@jarvis/db/schema";
import { requirePermission } from "@/lib/server/action-auth";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import {
  listMonthReportInput,
  listMonthReportOutput,
  getMonthReportDetailInput,
  getMonthReportDetailOutput,
  saveMonthReportMasterInput,
  saveMonthReportDetailMonthInput,
  saveMonthReportDetailOtherInput,
  saveResult,
} from "@jarvis/shared/validation/month-report";
import { listMastersWithCompany, getDetail } from "@/lib/queries/month-report";

export async function listMonthReportMasters(raw: unknown) {
  const session = await requirePermission(PERMISSIONS.MONTH_REPORT_READ);
  const input = listMonthReportInput.parse(raw);
  const rows = await listMastersWithCompany(session.workspaceId, input.companyNameLike);
  return listMonthReportOutput.parse({
    rows: rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() })),
  });
}

export async function getMonthReportDetail(raw: unknown) {
  const session = await requirePermission(PERMISSIONS.MONTH_REPORT_READ);
  const input = getMonthReportDetailInput.parse(raw);
  const result = await getDetail(session.workspaceId, input.companyCd, input.ym);
  return getMonthReportDetailOutput.parse(result);
}

export async function saveMaster(raw: unknown) {
  const session = await requirePermission(PERMISSIONS.MONTH_REPORT_WRITE);
  const input = saveMonthReportMasterInput.parse(raw);

  await db.transaction(async (tx) => {
    await tx
      .update(monthReportMaster)
      .set({
        signatureYn: input.signatureYn,
        userCntYn: input.userCntYn,
        cpnCntYn: input.cpnCntYn,
        workTypeYn: input.workTypeYn,
        treatTypeYn: input.treatTypeYn,
        solvedYn: input.solvedYn,
        unsolvedYn: input.unsolvedYn,
        chargerYn: input.chargerYn,
        infraYn: input.infraYn,
        replyYn: input.replyYn,
        chargerSabun1: input.chargerSabun1,
        chargerSabun2: input.chargerSabun2,
        senderSabun: input.senderSabun,
        updatedBy: session.userId,
        updatedByName: session.name ?? null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(monthReportMaster.workspaceId, session.workspaceId),
          eq(monthReportMaster.enterCd, input.enterCd),
          eq(monthReportMaster.companyCd, input.companyCd),
        ),
      );

    await tx.insert(auditLog).values({
      workspaceId: session.workspaceId,
      userId: session.userId,
      action: "month_report.master.update",
      resourceType: "month_report_master",
      resourceId: null,
      details: { enterCd: input.enterCd, companyCd: input.companyCd, changed: input } as Record<string, unknown>,
      success: true,
    });
  });

  return saveResult.parse({ ok: true, updated: 1 });
}

export async function saveDetailMonth(raw: unknown) {
  const session = await requirePermission(PERMISSIONS.MONTH_REPORT_WRITE);
  const input = saveMonthReportDetailMonthInput.parse(raw);

  await db.transaction(async (tx) => {
    await tx
      .insert(monthReportDetailMonth)
      .values({
        workspaceId: session.workspaceId,
        enterCd: input.enterCd,
        companyCd: input.companyCd,
        ym: input.ym,
        aaCnt: input.aaCnt,
        raCnt: input.raCnt,
        newCnt: input.newCnt,
        cpnCnt: input.cpnCnt,
        attr1: input.attr1,
        attr2: input.attr2,
        attr3: input.attr3,
        attr4: input.attr4,
        updatedBy: session.userId,
        updatedByName: session.name ?? null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          monthReportDetailMonth.workspaceId,
          monthReportDetailMonth.enterCd,
          monthReportDetailMonth.companyCd,
          monthReportDetailMonth.ym,
        ],
        set: {
          aaCnt: input.aaCnt,
          raCnt: input.raCnt,
          newCnt: input.newCnt,
          cpnCnt: input.cpnCnt,
          attr1: input.attr1,
          attr2: input.attr2,
          attr3: input.attr3,
          attr4: input.attr4,
          updatedBy: session.userId,
          updatedByName: session.name ?? null,
          updatedAt: new Date(),
        },
      });

    await tx.insert(auditLog).values({
      workspaceId: session.workspaceId,
      userId: session.userId,
      action: "month_report.detail_month.upsert",
      resourceType: "month_report_detail_month",
      resourceId: null,
      details: {
        enterCd: input.enterCd,
        companyCd: input.companyCd,
        ym: input.ym,
        changed: input,
      } as Record<string, unknown>,
      success: true,
    });
  });

  return saveResult.parse({ ok: true, updated: 1 });
}

export async function saveDetailOther(raw: unknown) {
  const session = await requirePermission(PERMISSIONS.MONTH_REPORT_WRITE);
  const input = saveMonthReportDetailOtherInput.parse(raw);

  let inserted = 0,
    updated = 0,
    deleted = 0;

  // Resolve enterCd from master (per-row input doesn't include it)
  const masters = await listMastersWithCompany(session.workspaceId);
  const masterFor = masters.find((m) => m.companyCd === input.companyCd);
  if (!masterFor) {
    return saveResult.parse({ ok: false, error: `master not found for ${input.companyCd}` });
  }
  const enterCd = masterFor.enterCd;

  await db.transaction(async (tx) => {
    if (input.creates.length) {
      await tx.insert(monthReportDetailOther).values(
        input.creates.map((c) => ({
          workspaceId: session.workspaceId,
          enterCd,
          companyCd: input.companyCd,
          ym: input.ym,
          seq: c.seq,
          etcBizCd: c.etcBizCd,
          etcTitle: c.etcTitle,
          etcMemo: c.etcMemo,
          updatedBy: session.userId,
          updatedByName: session.name ?? null,
          updatedAt: new Date(),
        })),
      );
      inserted = input.creates.length;
    }

    for (const u of input.updates) {
      await tx
        .update(monthReportDetailOther)
        .set({
          etcBizCd: u.etcBizCd,
          etcTitle: u.etcTitle,
          etcMemo: u.etcMemo,
          updatedBy: session.userId,
          updatedByName: session.name ?? null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(monthReportDetailOther.workspaceId, session.workspaceId),
            eq(monthReportDetailOther.companyCd, input.companyCd),
            eq(monthReportDetailOther.ym, input.ym),
            eq(monthReportDetailOther.seq, u.seq),
          ),
        );
      updated++;
    }

    if (input.deletes.length) {
      await tx
        .delete(monthReportDetailOther)
        .where(
          and(
            eq(monthReportDetailOther.workspaceId, session.workspaceId),
            eq(monthReportDetailOther.companyCd, input.companyCd),
            eq(monthReportDetailOther.ym, input.ym),
            inArray(monthReportDetailOther.seq, input.deletes),
          ),
        );
      deleted = input.deletes.length;
    }

    await tx.insert(auditLog).values({
      workspaceId: session.workspaceId,
      userId: session.userId,
      action: "month_report.detail_other.batch",
      resourceType: "month_report_detail_other",
      resourceId: null,
      details: {
        companyCd: input.companyCd,
        ym: input.ym,
        inserted,
        updated,
        deleted,
      } as Record<string, unknown>,
      success: true,
    });
  });

  return saveResult.parse({ ok: true, inserted, updated, deleted });
}
