import { NextRequest, NextResponse } from "next/server";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { z } from "zod";
import { asc, eq } from "drizzle-orm";
import { db } from "@jarvis/db/client";
import { company } from "@jarvis/db/schema";
import { createProject, listProjects } from "@/lib/queries/projects";
import { requireApiSession } from "@/lib/server/api-auth";

const listProjectsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  connectType: z.enum(["IP", "VPN", "VDI", "RE"]).optional(),
  hasDev: z.coerce.boolean().optional(),
  status: z.enum(["active", "deprecated", "decommissioned"]).optional(),
  q: z.string().trim().min(1).optional()
});

const createProjectBodySchema = z.object({
  companyId: z.string().uuid().optional(),
  name: z.string().min(1).max(300),
  description: z.string().max(4000).optional().or(z.literal("")),
  sensitivity: z.enum(["PUBLIC", "INTERNAL", "RESTRICTED", "SECRET_REF_ONLY"]).optional(),
  status: z.enum(["active", "deprecated", "decommissioned"]).optional(),
  prodDomainUrl: z.string().url().optional().or(z.literal("")),
  prodConnectType: z.enum(["IP", "VPN", "VDI", "RE"]).optional(),
  prodRepositoryUrl: z.string().url().optional().or(z.literal("")),
  prodDbDsn: z.string().max(500).optional().or(z.literal("")),
  prodSrcPath: z.string().optional().or(z.literal("")),
  prodClassPath: z.string().optional().or(z.literal("")),
  prodMemo: z.string().max(4000).optional().or(z.literal("")),
  devDomainUrl: z.string().url().optional().or(z.literal("")),
  devConnectType: z.enum(["IP", "VPN", "VDI", "RE"]).optional(),
  devRepositoryUrl: z.string().url().optional().or(z.literal("")),
  devDbDsn: z.string().max(500).optional().or(z.literal("")),
  devSrcPath: z.string().optional().or(z.literal("")),
  devClassPath: z.string().optional().or(z.literal("")),
  devMemo: z.string().max(4000).optional().or(z.literal(""))
});

export async function GET(request: NextRequest) {
  const auth = await requireApiSession(request, PERMISSIONS.PROJECT_READ);
  if (auth.response) {
    return auth.response;
  }

  const parsed = listProjectsQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams)
  );
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const result = await listProjects({
    workspaceId: auth.session.workspaceId,
    ...parsed.data
  });

  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const auth = await requireApiSession(request, PERMISSIONS.PROJECT_CREATE);
  if (auth.response) {
    return auth.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = createProjectBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  let companyId = parsed.data.companyId;
  if (!companyId) {
    // Derive from session workspace — pick first active company.
    const [firstCompany] = await db
      .select({ id: company.id })
      .from(company)
      .where(eq(company.workspaceId, auth.session.workspaceId))
      .orderBy(asc(company.createdAt))
      .limit(1);
    if (!firstCompany) {
      return NextResponse.json(
        { error: 'No company in workspace — create one first via /admin/companies' },
        { status: 400 },
      );
    }
    companyId = firstCompany.id;
  }

  const created = await createProject({
    workspaceId: auth.session.workspaceId,
    userId: auth.session.userId,
    input: {
      ...parsed.data,
      companyId,
      description: parsed.data.description || undefined,
      prodDomainUrl: parsed.data.prodDomainUrl || undefined,
      prodRepositoryUrl: parsed.data.prodRepositoryUrl || undefined,
      prodDbDsn: parsed.data.prodDbDsn || undefined,
      prodSrcPath: parsed.data.prodSrcPath || undefined,
      prodClassPath: parsed.data.prodClassPath || undefined,
      prodMemo: parsed.data.prodMemo || undefined,
      devDomainUrl: parsed.data.devDomainUrl || undefined,
      devRepositoryUrl: parsed.data.devRepositoryUrl || undefined,
      devDbDsn: parsed.data.devDbDsn || undefined,
      devSrcPath: parsed.data.devSrcPath || undefined,
      devClassPath: parsed.data.devClassPath || undefined,
      devMemo: parsed.data.devMemo || undefined
    }
  });

  return NextResponse.json({ data: created }, { status: 201 });
}
