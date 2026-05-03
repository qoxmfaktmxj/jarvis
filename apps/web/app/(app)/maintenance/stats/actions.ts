"use server";

import { requirePermission } from "@/lib/server/action-auth";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { importIncidentsInput, importIncidentsOutput, statsInput, statsOutput, statsCombinedOutput } from "@jarvis/shared/validation/service-desk";
import { boss } from "@/lib/server/pg-boss-client";
import { getStatsByGroupingSet, getStatsCombined } from "@/lib/queries/maintenance-stats";

export async function importIncidents(raw: unknown) {
  const session = await requirePermission(PERMISSIONS.SERVICE_DESK_IMPORT);
  const input = importIncidentsInput.parse(raw);

  const enterCd = process.env.SERVICE_DESK_DEFAULT_ENTER_CD;
  if (!enterCd) {
    return importIncidentsOutput.parse({
      ok: false,
      inserted: 0,
      deleted: 0,
      errors: [{ higherCd: "*", message: "SERVICE_DESK_DEFAULT_ENTER_CD env not set" }],
    });
  }

  const jobId = await boss.send("service-desk-import", {
    workspaceId: session.workspaceId,
    enterCd,
    ym: input.ym,
    userId: session.userId,
    categories: input.categories,
  });

  // async=true → fire-and-forget
  if (input.async) {
    return importIncidentsOutput.parse({ ok: true, inserted: 0, deleted: 0, errors: [] });
  }

  // jobId can be null if send fails
  if (!jobId) {
    return importIncidentsOutput.parse({
      ok: false,
      inserted: 0,
      deleted: 0,
      errors: [{ higherCd: "*", message: "failed to enqueue job" }],
    });
  }

  // Sync wait with 60s timeout
  const result = await waitForJobCompletion(jobId, 60_000);
  return importIncidentsOutput.parse(result);
}

async function waitForJobCompletion(
  jobId: string,
  timeoutMs: number
): Promise<{
  ok: boolean;
  inserted: number;
  deleted: number;
  errors: { higherCd: string; message: string }[];
}> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const job = await boss.getJobById("service-desk-import", jobId);
    if (job?.state === "completed") {
      const out = job.output as {
        inserted: number;
        deleted: number;
        errors: { higherCd: string; message: string }[];
      };
      return { ok: true, inserted: out.inserted ?? 0, deleted: out.deleted ?? 0, errors: out.errors ?? [] };
    }
    if (job?.state === "failed") {
      return {
        ok: false,
        inserted: 0,
        deleted: 0,
        errors: [{ higherCd: "*", message: (job.output as { message?: string })?.message ?? "failed" }],
      };
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return { ok: false, inserted: 0, deleted: 0, errors: [{ higherCd: "*", message: "timeout" }] };
}

export async function listStatsByCompany(raw: unknown) {
  const session = await requirePermission(PERMISSIONS.MAINTENANCE_STATS_READ);
  const input = statsInput.parse(raw);
  const { byCompany } = await getStatsByGroupingSet({ ...input, workspaceId: session.workspaceId });
  return statsOutput.parse({ rows: byCompany, total: byCompany.length });
}

export async function listStatsByManager(raw: unknown) {
  const session = await requirePermission(PERMISSIONS.MAINTENANCE_STATS_READ);
  const input = statsInput.parse(raw);
  const { byManager } = await getStatsByGroupingSet({ ...input, workspaceId: session.workspaceId });
  return statsOutput.parse({ rows: byManager, total: byManager.length });
}

export async function listStatsCombined(raw: unknown) {
  const session = await requirePermission(PERMISSIONS.MAINTENANCE_STATS_READ);
  const input = statsInput.parse(raw);
  const rows = await getStatsCombined({ ...input, workspaceId: session.workspaceId });
  return statsCombinedOutput.parse({ rows });
}
