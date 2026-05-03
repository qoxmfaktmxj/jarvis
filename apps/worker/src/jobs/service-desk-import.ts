import { db } from "@jarvis/db";
import { serviceDeskIncident, auditLog } from "@jarvis/db/schema";
import { and, eq } from "drizzle-orm";
import { fetchIncidents } from "./lib/sd-api-client.js";
import { stripHtml, splitByBytes } from "./lib/incident-text.js";

const FIVE_CATEGORIES = ["H008", "H028", "H030", "H010", "H027"] as const;
const G80_CATEGORIES = ["H038"] as const;

export interface ServiceDeskImportInput {
  workspaceId: string;
  enterCd: string;
  ym: string;         // YYYYMM
  ssnGrpCd?: string;  // "80" → H038, else 5 categories
  userId?: string;    // for audit_log
}

export interface ServiceDeskImportResult {
  inserted: number;
  deleted: number;
  errors: Array<{ higherCd: string; message: string }>;
}

export async function serviceDeskImport(
  input: ServiceDeskImportInput
): Promise<ServiceDeskImportResult> {
  const { workspaceId, enterCd, ym } = input;
  const yyyy = ym.substring(0, 4);
  const mm = ym.substring(4, 6);
  const categories =
    input.ssnGrpCd === "80" ? G80_CATEGORIES : FIVE_CATEGORIES;

  let totalInserted = 0;
  let totalDeleted = 0;
  const errors: Array<{ higherCd: string; message: string }> = [];

  for (const higherCd of categories) {
    try {
      const items = await fetchIncidents({ higherCd, yyyy, mm });

      await db.transaction(async (tx) => {
        const del = await tx
          .delete(serviceDeskIncident)
          .where(
            and(
              eq(serviceDeskIncident.workspaceId, workspaceId),
              eq(serviceDeskIncident.enterCd, enterCd),
              eq(serviceDeskIncident.yyyy, yyyy),
              eq(serviceDeskIncident.mm, mm),
              eq(serviceDeskIncident.higherCd, higherCd)
            )
          );
        totalDeleted += (del as unknown as { rowCount?: number }).rowCount ?? 0;

        for (let i = 0; i < items.length; i++) {
          const item = items[i]!;
          const cleanedComplete = stripHtml(item["complete_content"] ?? "");
          const cleanedContent = stripHtml(item["content"] ?? "");

          await tx.insert(serviceDeskIncident).values({
            workspaceId,
            enterCd,
            yyyy,
            mm,
            seq: i,
            higherCd,
            higherNm: item["higher_nm"] ?? null,
            lowerCd: item["lower_cd"] ?? null,
            lowerNm: item["lower_nm"] ?? null,
            statusCd: item["status_cd"] ?? null,
            statusNm: item["status_nm"] ?? null,
            processSpeed: item["process_speed"] ?? null,
            title: item["title"] ?? null,
            requestCompanyCd: item["request_company_cd"] ?? null,
            requestCompanyNm: item["request_company_nm"] ?? null,
            requestDeptCd: item["request_dept_cd"] ?? null,
            requestDeptNm: item["request_dept_nm"] ?? null,
            requestEmail: item["request_email"] ?? null,
            requestId: item["request_id"] ?? null,
            requestNm: item["request_nm"] ?? null,
            requestCompleteDate: item["request_complete_date"] ?? null,
            registerCompanyCd: item["register_company_cd"] ?? null,
            registerCompanyNm: item["register_company_nm"] ?? null,
            registerSabun: item["register_sabun"] ?? null,
            registerNm: item["register_nm"] ?? null,
            registerDate: item["register_date"] ?? null,
            registerYyyy: item["register_yyyy"] ?? null,
            registerMm: item["register_mm"] ?? null,
            registerDd: item["register_dd"] ?? null,
            registerNum: item["register_num"] ?? null,
            appMenu: item["app_menu"] ?? null,
            receiptContent: item["receipt_content"] ?? null,
            managerCompanyCd: item["manager_company_cd"] ?? null,
            managerCompanyNm: item["manager_company_nm"] ?? null,
            managerNm: item["manager_nm"] ?? null,
            managerDeptCd: item["manager_dept_cd"] ?? null,
            managerDeptNm: item["manager_dept_nm"] ?? null,
            managerPosition: item["manager_position"] ?? null,
            managerEmail: item["manager_email"] ?? null,
            managerPhone: item["manager_phone"] ?? null,
            receiptDate: item["receipt_date"] ?? null,
            businessLevel: item["business_level"] ?? null,
            completeReserveDate: item["complete_reserve_date"] ?? null,
            solutionFlag: item["solution_flag"] ?? null,
            completeContent1: splitByBytes(cleanedComplete, 0, 3999),
            completeContent2: splitByBytes(cleanedComplete, 4000, 7999),
            completeContent3: splitByBytes(cleanedComplete, 8000, 11999),
            completeContent4: splitByBytes(cleanedComplete, 12000, 15999),
            delayReason: item["delay_reason"] ?? null,
            workTime: item["work_time"] ?? null,
            completeDate: item["complete_date"] ?? null,
            completeOpenFlag: item["complete_open_flag"] ?? null,
            processCd: item["process_cd"] ?? null,
            processNm: item["process_nm"] ?? null,
            valuation: item["valuation"] ?? null,
            valuationContent: item["valuation_content"] ?? null,
            // createdAt in schema is varchar — passthrough raw string
            createdAt: item["created_at"] ?? null,
            // chkdate is timestamp — incoming string, set null (raw passthrough plan)
            chkdate: null,
            chkid: item["chkid"] ?? null,
            gubunCd: item["gubun_cd"] ?? null,
            deleteFlag: item["delete_flag"] ?? null,
            sharingContents: item["sharing_contents"] ?? null,
            completeContent: cleanedComplete,
            content: cleanedContent,
          });
          totalInserted++;
        }

        // audit_log: schema uses resourceType/resourceId (not targetType/targetId).
        // resourceId is a uuid column — composite key goes into details instead.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (tx.insert(auditLog) as any).values({
          workspaceId,
          userId: input.userId ?? null,
          action: "service_desk.import",
          resourceType: "service_desk_incident",
          resourceId: null,
          details: {
            ym,
            higherCd,
            inserted: items.length,
            deleted: (del as unknown as { rowCount?: number }).rowCount ?? 0,
            enterCd,
          },
        });
      });
    } catch (err) {
      errors.push({
        higherCd,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { inserted: totalInserted, deleted: totalDeleted, errors };
}
