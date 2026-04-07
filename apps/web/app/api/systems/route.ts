import { NextRequest, NextResponse } from "next/server";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { createSystemSchema } from "@jarvis/shared/validation/system";
import { z } from "zod";
import { createSystem, listSystems } from "@/lib/queries/systems";
import { requireApiSession } from "@/lib/server/api-auth";

const listSystemsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  category: z.enum(["web", "db", "server", "network", "middleware"]).optional(),
  environment: z.enum(["dev", "staging", "prod"]).optional(),
  status: z.enum(["active", "deprecated", "decommissioned"]).optional(),
  q: z.string().trim().min(1).optional()
});

function normalizeSystemInput(input: z.infer<typeof createSystemSchema>) {
  return {
    ...input,
    category: input.category || undefined,
    description: input.description || undefined,
    techStack: input.techStack || undefined,
    repositoryUrl: input.repositoryUrl || undefined,
    dashboardUrl: input.dashboardUrl || undefined
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireApiSession(request, PERMISSIONS.SYSTEM_READ);
  if (auth.response) {
    return auth.response;
  }

  const parsed = listSystemsQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams)
  );
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const result = await listSystems({
    workspaceId: auth.session.workspaceId,
    ...parsed.data
  });

  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const auth = await requireApiSession(request, PERMISSIONS.SYSTEM_CREATE);
  if (auth.response) {
    return auth.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = createSystemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const created = await createSystem({
    workspaceId: auth.session.workspaceId,
    userId: auth.session.userId,
    input: normalizeSystemInput(parsed.data)
  });

  return NextResponse.json({ data: created }, { status: 201 });
}
