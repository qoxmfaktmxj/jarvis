import { NextRequest, NextResponse } from "next/server";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import {
  getContractorById,
  renewContract,
  updateContract
} from "@/lib/queries/contractors";
import { requireApiSession } from "@/lib/server/api-auth";
import { renewContractBodySchema, updateContractBodySchema } from "../../_schemas";
import { isValidUuid } from "@jarvis/shared/validation";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, ctx: RouteContext) {
  const auth = await requireApiSession(request, PERMISSIONS.CONTRACTOR_ADMIN);
  if (auth.response) return auth.response;

  const { id } = await ctx.params;
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }
  const body = await request.json().catch(() => null);
  const parsed = renewContractBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const detail = await getContractorById({
    workspaceId: auth.session.workspaceId,
    userId: id
  });

  if (!detail?.activeContract) {
    return NextResponse.json({ error: "no_active_contract" }, { status: 404 });
  }

  try {
    const created = await renewContract({
      workspaceId: auth.session.workspaceId,
      prevContractId: detail.activeContract.id,
      input: {
        userId: id,
        startDate: new Date(parsed.data.startDate + "T00:00:00Z"),
        endDate: new Date(parsed.data.endDate + "T00:00:00Z"),
        note: parsed.data.note
      }
    });
    return NextResponse.json(created, { status: 201 });
  } catch (e: unknown) {
    const msg = String((e as { message?: string })?.message ?? "");
    if (msg.includes("idx_contract_one_active") || msg.toLowerCase().includes("unique")) {
      return NextResponse.json({ error: "active_contract_conflict" }, { status: 409 });
    }
    throw e;
  }
}

export async function PATCH(request: NextRequest, ctx: RouteContext) {
  const auth = await requireApiSession(request, PERMISSIONS.CONTRACTOR_ADMIN);
  if (auth.response) return auth.response;

  const { id } = await ctx.params;
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }
  const body = await request.json().catch(() => null);
  const parsed = updateContractBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const detail = await getContractorById({
    workspaceId: auth.session.workspaceId,
    userId: id
  });

  if (!detail?.activeContract) {
    return NextResponse.json({ error: "no_active_contract" }, { status: 404 });
  }

  const updated = await updateContract({
    workspaceId: auth.session.workspaceId,
    contractId: detail.activeContract.id,
    patch: parsed.data
  });

  return NextResponse.json(updated);
}
