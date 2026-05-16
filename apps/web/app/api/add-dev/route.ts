import { NextRequest, NextResponse } from "next/server";
import { db } from "@jarvis/db/client";
import { auditLog } from "@jarvis/db/schema";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { writeAuditLog } from "@jarvis/shared/audit-log";
import { createAdditionalDevSchema } from "@jarvis/shared/validation/additional-dev";
import { z } from "zod";
import { createAdditionalDev, listAdditionalDev } from "@/lib/queries/additional-dev";
import { requireApiSession } from "@/lib/server/api-auth";
import { extractRequestAudit } from "@/lib/server/request-audit";

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  projectId: z.string().uuid().optional(),
  status: z.enum(["협의중", "진행중", "완료", "보류"]).optional(),
  part: z.enum(["Saas", "외부", "모바일"]).optional(),
  q: z.string().trim().min(1).optional(),
});

export async function GET(request: NextRequest) {
  const auth = await requireApiSession(request, PERMISSIONS.PROJECT_READ);
  if (auth.response) {
    return auth.response;
  }

  const parsed = listQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const result = await listAdditionalDev({
    workspaceId: auth.session.workspaceId,
    ...parsed.data,
  });

  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const auth = await requireApiSession(request, PERMISSIONS.PROJECT_ADMIN);
  if (auth.response) {
    return auth.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = createAdditionalDevSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const created = await createAdditionalDev({
    workspaceId: auth.session.workspaceId,
    input: parsed.data,
  });

  const { ipAddress, userAgent } = extractRequestAudit(request);
  await writeAuditLog(db, auditLog, {
    workspaceId: auth.session.workspaceId,
    userId: auth.session.userId,
    action: "additional_development.create",
    resourceType: "additional_development",
    resourceId: created.id,
    ipAddress,
    userAgent,
    details: { after: parsed.data },
  });

  return NextResponse.json({ data: created }, { status: 201 });
}
