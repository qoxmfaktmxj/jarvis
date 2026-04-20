import { NextRequest, NextResponse } from "next/server";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { canAccessContractorData } from "@jarvis/auth/rbac";
import { getContractorById, terminateContract } from "@/lib/queries/contractors";
import { requireApiSession } from "@/lib/server/api-auth";
import { isValidUuid } from "@jarvis/shared/validation";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, ctx: RouteContext) {
  const auth = await requireApiSession(request, PERMISSIONS.CONTRACTOR_READ);
  if (auth.response) return auth.response;

  const { id } = await ctx.params;
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  if (!canAccessContractorData(auth.session, id)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const detail = await getContractorById({
    workspaceId: auth.session.workspaceId,
    userId: id
  });

  if (!detail) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json(detail);
}

export async function DELETE(request: NextRequest, ctx: RouteContext) {
  const auth = await requireApiSession(request, PERMISSIONS.CONTRACTOR_ADMIN);
  if (auth.response) return auth.response;

  const { id } = await ctx.params;
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const detail = await getContractorById({
    workspaceId: auth.session.workspaceId,
    userId: id
  });

  if (!detail?.activeContract) {
    return NextResponse.json({ error: "no_active_contract" }, { status: 404 });
  }

  const terminated = await terminateContract({
    workspaceId: auth.session.workspaceId,
    contractId: detail.activeContract.id
  });

  return NextResponse.json({ contract: terminated }, { status: 200 });
}
