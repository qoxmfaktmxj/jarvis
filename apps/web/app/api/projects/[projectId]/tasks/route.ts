import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { createTaskSchema } from "@jarvis/shared/validation/project";
import { requireApiSession } from "@/lib/server/api-auth";
import { createProjectTask, listProjectTasks } from "@/lib/queries/projects";

type RouteContext = {
  params: Promise<{
    projectId: string;
  }>;
};

const listTasksQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["todo", "in-progress", "review", "done"]).optional()
});

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireApiSession(request, PERMISSIONS.PROJECT_READ);
  if (auth.response) {
    return auth.response;
  }

  const parsed = listTasksQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams)
  );
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { projectId } = await context.params;
  const result = await listProjectTasks({
    workspaceId: auth.session.workspaceId,
    projectId,
    ...parsed.data
  });

  if (!result) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(result);
}

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireApiSession(request, PERMISSIONS.PROJECT_UPDATE);
  if (auth.response) {
    return auth.response;
  }

  const body = await request.json();
  const parsed = createTaskSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { projectId } = await context.params;
  const created = await createProjectTask({
    workspaceId: auth.session.workspaceId,
    projectId,
    input: parsed.data
  });

  if (!created) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ data: created }, { status: 201 });
}
