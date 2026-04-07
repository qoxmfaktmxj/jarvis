import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { createProjectSchema } from "@jarvis/shared/validation/project";
import { requireApiSession } from "@/lib/server/api-auth";
import { createProject, listProjects } from "@/lib/queries/projects";

const listProjectsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["active", "on-hold", "completed", "archived"]).optional(),
  q: z.string().trim().min(1).optional()
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

  const body = await request.json();
  const parsed = createProjectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const created = await createProject({
    workspaceId: auth.session.workspaceId,
    userId: auth.session.userId,
    input: parsed.data
  });

  return NextResponse.json({ data: created }, { status: 201 });
}
