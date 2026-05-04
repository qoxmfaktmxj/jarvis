import { db } from "@jarvis/db/client";
import {
  monthReportMaster,
  monthReportDetailMonth,
  monthReportDetailOther,
  company,
} from "@jarvis/db/schema";
import { and, asc, eq, ilike } from "drizzle-orm";

export async function listMastersWithCompany(
  workspaceId: string,
  companyNameLike?: string,
) {
  return db
    .select({
      enterCd: monthReportMaster.enterCd,
      companyCd: monthReportMaster.companyCd,
      companyName: company.name,
      signatureYn: monthReportMaster.signatureYn,
      userCntYn: monthReportMaster.userCntYn,
      cpnCntYn: monthReportMaster.cpnCntYn,
      workTypeYn: monthReportMaster.workTypeYn,
      treatTypeYn: monthReportMaster.treatTypeYn,
      solvedYn: monthReportMaster.solvedYn,
      unsolvedYn: monthReportMaster.unsolvedYn,
      chargerYn: monthReportMaster.chargerYn,
      infraYn: monthReportMaster.infraYn,
      replyYn: monthReportMaster.replyYn,
      chargerSabun1: monthReportMaster.chargerSabun1,
      chargerSabun2: monthReportMaster.chargerSabun2,
      senderSabun: monthReportMaster.senderSabun,
      updatedAt: monthReportMaster.updatedAt,
      updatedByName: monthReportMaster.updatedByName,
    })
    .from(monthReportMaster)
    .innerJoin(
      company,
      and(
        eq(company.workspaceId, monthReportMaster.workspaceId),
        eq(company.code, monthReportMaster.companyCd),
      ),
    )
    .where(
      and(
        eq(monthReportMaster.workspaceId, workspaceId),
        companyNameLike ? ilike(company.name, `%${companyNameLike}%`) : undefined,
      ),
    )
    .orderBy(asc(company.name));
}

export async function getDetail(workspaceId: string, companyCd: string, ym: string) {
  // Inline single-row query for performance (avoids loading all masters)
  const [masterRow] = await db
    .select({
      enterCd: monthReportMaster.enterCd,
      companyCd: monthReportMaster.companyCd,
      companyName: company.name,
      signatureYn: monthReportMaster.signatureYn,
      userCntYn: monthReportMaster.userCntYn,
      cpnCntYn: monthReportMaster.cpnCntYn,
      workTypeYn: monthReportMaster.workTypeYn,
      treatTypeYn: monthReportMaster.treatTypeYn,
      solvedYn: monthReportMaster.solvedYn,
      unsolvedYn: monthReportMaster.unsolvedYn,
      chargerYn: monthReportMaster.chargerYn,
      infraYn: monthReportMaster.infraYn,
      replyYn: monthReportMaster.replyYn,
      chargerSabun1: monthReportMaster.chargerSabun1,
      chargerSabun2: monthReportMaster.chargerSabun2,
      senderSabun: monthReportMaster.senderSabun,
      updatedAt: monthReportMaster.updatedAt,
      updatedByName: monthReportMaster.updatedByName,
    })
    .from(monthReportMaster)
    .innerJoin(
      company,
      and(
        eq(company.workspaceId, monthReportMaster.workspaceId),
        eq(company.code, monthReportMaster.companyCd),
      ),
    )
    .where(
      and(
        eq(monthReportMaster.workspaceId, workspaceId),
        eq(monthReportMaster.companyCd, companyCd),
      ),
    )
    .limit(1);

  if (!masterRow) {
    throw new Error(`month_report_master not found for company ${companyCd}`);
  }

  const [monthRow] = await db
    .select()
    .from(monthReportDetailMonth)
    .where(
      and(
        eq(monthReportDetailMonth.workspaceId, workspaceId),
        eq(monthReportDetailMonth.enterCd, masterRow.enterCd),
        eq(monthReportDetailMonth.companyCd, companyCd),
        eq(monthReportDetailMonth.ym, ym),
      ),
    )
    .limit(1);

  const otherRows = await db
    .select()
    .from(monthReportDetailOther)
    .where(
      and(
        eq(monthReportDetailOther.workspaceId, workspaceId),
        eq(monthReportDetailOther.enterCd, masterRow.enterCd),
        eq(monthReportDetailOther.companyCd, companyCd),
        eq(monthReportDetailOther.ym, ym),
      ),
    )
    .orderBy(asc(monthReportDetailOther.seq));

  return {
    master: {
      ...masterRow,
      updatedAt: masterRow.updatedAt.toISOString(),
    },
    monthDetail: monthRow
      ? {
          enterCd: monthRow.enterCd,
          companyCd: monthRow.companyCd,
          ym: monthRow.ym,
          aaCnt: monthRow.aaCnt,
          raCnt: monthRow.raCnt,
          newCnt: monthRow.newCnt,
          cpnCnt: monthRow.cpnCnt,
          attr1: monthRow.attr1,
          attr2: monthRow.attr2,
          attr3: monthRow.attr3,
          attr4: monthRow.attr4,
          updatedAt: monthRow.updatedAt.toISOString(),
          updatedByName: monthRow.updatedByName,
        }
      : null,
    otherDetail: otherRows.map((r) => ({
      enterCd: r.enterCd,
      companyCd: r.companyCd,
      ym: r.ym,
      seq: r.seq,
      etcBizCd: r.etcBizCd,
      etcTitle: r.etcTitle,
      etcMemo: r.etcMemo,
      updatedAt: r.updatedAt.toISOString(),
      updatedByName: r.updatedByName,
    })),
  };
}
