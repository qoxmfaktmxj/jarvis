"use server";

import { requirePermission } from "@/lib/server/action-auth";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { importIncidentsInput, importIncidentsOutput } from "@jarvis/shared/validation/service-desk";
import { boss } from "@/lib/server/pg-boss-client";

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
