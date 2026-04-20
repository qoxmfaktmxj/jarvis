import { db } from "@jarvis/db/client";
import {
  contractorContract,
  leaveRequest,
  user,
  organization
} from "@jarvis/db/schema";
import {
  and, asc, desc, eq, gte, ilike, inArray, lte, or, sql
} from "drizzle-orm";
import {
  computeGeneratedLeaveHours,
  computeLeaveHours,
  type LeaveType
} from "@jarvis/shared/leave-compute";

type DbLike = typeof db;
type DbOrTx = DbLike | Parameters<Parameters<DbLike["transaction"]>[0]>[0];

function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, "\\$&");
}

// ─── Types ─────────────────────────────────────────
export interface ContractorTableRow {
  userId: string;
  employeeId: string;
  name: string;
  orgName: string | null;
  contractId: string | null;
  startDate: string | null;
  endDate: string | null;
  issuedHours: number;
  usedHours: number;
  remainingHours: number;
  contractStatus: string | null;
  updatedAt: Date;
}

// ─── listContractors ─────────────────────────────
type ListContractorsParams = {
  workspaceId: string;
  q?: string;
  status?: "active" | "expired" | "terminated";
  orgId?: string;
  userIdFilter?: string;
  page?: number;
  pageSize?: number;
  database?: DbOrTx;
};

export async function listContractors({
  workspaceId, q, status = "active", orgId, userIdFilter,
  page = 1, pageSize = 50, database = db
}: ListContractorsParams) {
  const safePage = Math.max(1, page);
  const safeSize = Math.min(100, Math.max(1, pageSize));
  const conds = [
    eq(user.workspaceId, workspaceId),
    eq(user.employmentType, "contractor")
  ];
  if (q) {
    const escaped = escapeLike(q);
    conds.push(or(ilike(user.name, `%${escaped}%`), ilike(user.employeeId, `%${escaped}%`))!);
  }
  if (orgId) conds.push(eq(user.orgId, orgId));
  if (userIdFilter) conds.push(eq(user.id, userIdFilter));

  // When status filter is set, also add it to WHERE so users with no matching
  // contract do not appear in the result (leftJoin alone would show them with null contract).
  const contractJoinCond = and(
    eq(contractorContract.userId, user.id),
    eq(contractorContract.status, status),
  );
  if (status) conds.push(eq(contractorContract.status, status));

  const rows = await database
    .select({
      userId: user.id,
      employeeId: user.employeeId,
      name: user.name,
      orgName: organization.name,
      contractId: contractorContract.id,
      startDate: contractorContract.startDate,
      endDate: contractorContract.endDate,
      generatedLeaveHours: contractorContract.generatedLeaveHours,
      additionalLeaveHours: contractorContract.additionalLeaveHours,
      contractStatus: contractorContract.status,
      userUpdatedAt: user.updatedAt
    })
    .from(user)
    .leftJoin(contractorContract, contractJoinCond)
    .leftJoin(organization, eq(user.orgId, organization.id))
    .where(and(...conds))
    .orderBy(desc(contractorContract.startDate), asc(user.name))
    .limit(safeSize)
    .offset((safePage - 1) * safeSize);

  const contractIds = rows.map(r => r.contractId).filter((x): x is string => !!x);
  const usedMap = new Map<string, number>();
  if (contractIds.length > 0) {
    const usedRows = await database
      .select({
        contractId: leaveRequest.contractId,
        used: sql<string>`COALESCE(SUM(${leaveRequest.hours}), 0)::text`
      })
      .from(leaveRequest)
      .where(and(
        inArray(leaveRequest.contractId, contractIds),
        eq(leaveRequest.status, "approved")
      ))
      .groupBy(leaveRequest.contractId);
    for (const r of usedRows) usedMap.set(r.contractId, Number(r.used));
  }

  // count 쿼리에 contract 상태 JOIN 포함 (I-9)
  const [totals] = await database
    .select({ total: sql<number>`count(distinct ${user.id})` })
    .from(user)
    .leftJoin(contractorContract, and(
      eq(contractorContract.userId, user.id),
      contractJoinCond
    ))
    .where(and(...conds));
  const total = Number(totals?.total ?? 0);

  const data: ContractorTableRow[] = rows.map(r => {
    const issued = Number(r.generatedLeaveHours ?? 0) + Number(r.additionalLeaveHours ?? 0);
    const used = usedMap.get(r.contractId ?? "") ?? 0;
    return {
      userId: r.userId,
      employeeId: r.employeeId,
      name: r.name,
      orgName: r.orgName,
      contractId: r.contractId,
      startDate: r.startDate,
      endDate: r.endDate,
      issuedHours: issued,
      usedHours: used,
      remainingHours: issued - used,
      contractStatus: r.contractStatus,
      updatedAt: r.userUpdatedAt
    };
  });

  return {
    data,
    pagination: {
      page: safePage,
      pageSize: safeSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / safeSize))
    }
  };
}

// ─── getContractorById ──────────────────────────
export async function getContractorById({
  workspaceId, userId, database = db
}: { workspaceId: string; userId: string; database?: DbOrTx }) {
  const [u] = await database.select().from(user)
    .where(and(eq(user.id, userId), eq(user.workspaceId, workspaceId)));
  if (!u) return null;
  const contracts = await database.select().from(contractorContract)
    .where(and(eq(contractorContract.userId, userId), eq(contractorContract.workspaceId, workspaceId)))
    .orderBy(desc(contractorContract.startDate));
  const activeContract = contracts.find(c => c.status === "active") ?? null;
  const leaves = activeContract
    ? await listLeaveRequests({ workspaceId, userId, database })
    : [];
  let summary = null;
  if (activeContract) {
    const remaining = await computeRemainingHours({ contractId: activeContract.id, database });
    const issued = Number(activeContract.generatedLeaveHours) + Number(activeContract.additionalLeaveHours);
    summary = { issuedHours: issued, usedHours: issued - remaining, remainingHours: remaining };
  }
  return { user: u, contracts, activeContract, leaves, summary };
}

// ─── createContractor ────────────────────────────
type CreateContractorInput = {
  name: string;
  employeeId: string;
  email?: string;
  phone?: string;
  orgId?: string;
  position?: string;
  enterCd?: string;
  startDate: string;
  endDate: string;
  additionalLeaveHours?: number;
  note?: string;
};

export async function createContractor({
  workspaceId, input, actorId, database = db
}: { workspaceId: string; input: CreateContractorInput; actorId: string; database?: DbOrTx }) {
  return database.transaction(async (tx) => {
    const [createdUser] = await tx.insert(user).values({
      workspaceId,
      employeeId: input.employeeId,
      name: input.name,
      email: input.email ?? null,
      phone: input.phone ?? null,
      orgId: input.orgId ?? null,
      position: input.position ?? null,
      employmentType: "contractor",
      preferences: {}
    }).returning();
    if (!createdUser) throw new Error("failed to create user");

    const generatedHours = computeGeneratedLeaveHours(
      new Date(input.startDate + "T00:00:00Z"),
      new Date(input.endDate + "T00:00:00Z")
    );

    const [createdContract] = await tx.insert(contractorContract).values({
      workspaceId,
      userId: createdUser.id,
      enterCd: input.enterCd ?? null,
      startDate: input.startDate,
      endDate: input.endDate,
      generatedLeaveHours: String(generatedHours),
      additionalLeaveHours: String(input.additionalLeaveHours ?? 0),
      note: input.note ?? null,
      status: "active"
    }).returning();
    if (!createdContract) throw new Error("failed to create contract");

    return { user: createdUser, contract: createdContract };
  });
}

// ─── updateContract ──────────────────────────────
export async function updateContract({
  workspaceId, contractId, patch, database = db
}: {
  workspaceId: string; contractId: string;
  patch: Partial<{
    enterCd: string | null; startDate: string; endDate: string;
    generatedLeaveHours: number; additionalLeaveHours: number; note: string | null;
  }>;
  database?: DbOrTx;
}) {
  const values: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.enterCd !== undefined) values.enterCd = patch.enterCd;
  if (patch.startDate) values.startDate = patch.startDate;
  if (patch.endDate) values.endDate = patch.endDate;
  if (patch.generatedLeaveHours !== undefined) values.generatedLeaveHours = String(patch.generatedLeaveHours);
  if (patch.additionalLeaveHours !== undefined) values.additionalLeaveHours = String(patch.additionalLeaveHours);
  if (patch.note !== undefined) values.note = patch.note;
  const [updated] = await database.update(contractorContract)
    .set(values)
    .where(and(eq(contractorContract.id, contractId), eq(contractorContract.workspaceId, workspaceId)))
    .returning();
  return updated ?? null;
}

// ─── computeRemainingHours ────────────────────────
export async function computeRemainingHours({
  contractId, database = db
}: { contractId: string; database?: DbOrTx }) {
  const [c] = await database.select().from(contractorContract).where(eq(contractorContract.id, contractId));
  if (!c) return 0;
  const [sumRow] = await database
    .select({ s: sql<string>`COALESCE(SUM(${leaveRequest.hours}), 0)::text` })
    .from(leaveRequest)
    .where(and(
      eq(leaveRequest.contractId, contractId),
      eq(leaveRequest.status, "approved")
    ));
  const total = Number(c.generatedLeaveHours) + Number(c.additionalLeaveHours);
  return total - Number(sumRow?.s ?? 0);
}

// ─── renewContract ───────────────────────────────
export async function renewContract({
  workspaceId, prevContractId, input, database = db
}: {
  workspaceId: string; prevContractId: string;
  input: { userId: string; startDate: Date; endDate: Date; note?: string };
  database?: DbOrTx;
}) {
  return (database as DbLike).transaction(async (tx) => {
    const [prev] = await tx.select().from(contractorContract)
      .where(and(eq(contractorContract.id, prevContractId), eq(contractorContract.workspaceId, workspaceId)));
    if (!prev) throw new Error("prev contract not found");
    if (prev.status !== "active") throw new Error("prev contract must be active");

    const remaining = await computeRemainingHours({ contractId: prev.id, database: tx });
    const carryOver = Math.max(0, remaining);

    await tx.update(contractorContract)
      .set({ status: "expired", updatedAt: new Date() })
      .where(eq(contractorContract.id, prev.id));

    const startIso = input.startDate.toISOString().slice(0, 10);
    const endIso = input.endDate.toISOString().slice(0, 10);
    const [created] = await tx.insert(contractorContract).values({
      workspaceId,
      userId: input.userId,
      enterCd: prev.enterCd,
      startDate: startIso,
      endDate: endIso,
      generatedLeaveHours: String(computeGeneratedLeaveHours(input.startDate, input.endDate)),
      additionalLeaveHours: String(carryOver),
      note: [input.note, carryOver > 0 ? `직전계약 잔여 ${carryOver}h 이월` : null]
        .filter(Boolean).join("\n") || null,
      status: "active"
    }).returning();
    if (!created) throw new Error("failed to create renewed contract");
    return created;
  });
}

// ─── terminateContract ────────────────────────────
export async function terminateContract({
  workspaceId, contractId, database = db
}: { workspaceId: string; contractId: string; database?: DbOrTx }) {
  const [updated] = await database.update(contractorContract)
    .set({ status: "terminated", updatedAt: new Date() })
    .where(and(
      eq(contractorContract.id, contractId),
      eq(contractorContract.workspaceId, workspaceId),
      eq(contractorContract.status, "active")
    ))
    .returning();
  return updated ?? null;
}

// ─── leave_request ────────────────────────────────
type CreateLeaveInput = {
  type: LeaveType;
  startDate: string;
  endDate: string;
  timeFrom?: string;
  timeTo?: string;
  reason?: string;
};

/**
 * leave request 생성. 자동 승인(status='approved').
 *
 * NOTE: 잔여 시간 초과 시 서버 측 강제 차단 **없음**.
 * 스펙 §Q10 결정 "C안 — 누구나 허용 + 경고" 준수.
 * UI는 미리보기로 "신청 후 잔여 -N시간" 경고를 보여주되 신청 자체는 허용.
 * 마이너스 잔여는 `computeRemainingHours` 결과로 노출되며, 관리자 감사 대상.
 */
export async function createLeaveRequest({
  workspaceId, userId, input, actorId, holidays, database = db
}: {
  workspaceId: string; userId: string;
  input: CreateLeaveInput; actorId: string;
  holidays: Set<string>;
  database?: DbOrTx;
}) {
  const [contract] = await database.select().from(contractorContract).where(and(
    eq(contractorContract.workspaceId, workspaceId),
    eq(contractorContract.userId, userId),
    eq(contractorContract.status, "active")
  )).limit(1);
  if (!contract) {
    const err = new Error("NO_ACTIVE_CONTRACT");
    (err as Error & { code: string }).code = "NO_ACTIVE_CONTRACT";
    throw err;
  }
  const hours = computeLeaveHours({
    type: input.type,
    startDate: new Date(input.startDate + "T00:00:00Z"),
    endDate: new Date(input.endDate + "T00:00:00Z"),
    timeFrom: input.timeFrom ? new Date(input.timeFrom) : undefined,
    timeTo: input.timeTo ? new Date(input.timeTo) : undefined,
    holidays
  });

  const [created] = await database.insert(leaveRequest).values({
    workspaceId,
    userId,
    contractId: contract.id,
    type: input.type,
    startDate: input.startDate,
    endDate: input.endDate,
    timeFrom: input.timeFrom ? new Date(input.timeFrom) : null,
    timeTo: input.timeTo ? new Date(input.timeTo) : null,
    hours: String(hours),
    reason: input.reason ?? null,
    status: "approved",
    createdBy: actorId
  }).returning();
  if (!created) throw new Error("failed to create leave request");
  return created;
}

type LeavePatch = Partial<CreateLeaveInput>;

export async function updateLeaveRequest({
  workspaceId, id, patch, holidays, database = db
}: {
  workspaceId: string; id: string;
  patch: LeavePatch; holidays: Set<string>;
  database?: DbOrTx;
}) {
  const [existing] = await database.select().from(leaveRequest)
    .where(and(eq(leaveRequest.id, id), eq(leaveRequest.workspaceId, workspaceId)));
  if (!existing) return null;
  const hours = computeLeaveHours({
    type: (patch.type ?? existing.type) as LeaveType,
    startDate: new Date(String(patch.startDate ?? existing.startDate) + "T00:00:00Z"),
    endDate: new Date(String(patch.endDate ?? existing.endDate) + "T00:00:00Z"),
    timeFrom: patch.timeFrom ? new Date(patch.timeFrom) : (existing.timeFrom ?? undefined),
    timeTo: patch.timeTo ? new Date(patch.timeTo) : (existing.timeTo ?? undefined),
    holidays
  });
  const values: Record<string, unknown> = { updatedAt: new Date(), hours: String(hours) };
  if (patch.type) values.type = patch.type;
  if (patch.startDate) values.startDate = patch.startDate;
  if (patch.endDate) values.endDate = patch.endDate;
  if (patch.timeFrom !== undefined) values.timeFrom = patch.timeFrom ? new Date(patch.timeFrom) : null;
  if (patch.timeTo !== undefined) values.timeTo = patch.timeTo ? new Date(patch.timeTo) : null;
  if (patch.reason !== undefined) values.reason = patch.reason;
  const [updated] = await database.update(leaveRequest)
    .set(values)
    .where(eq(leaveRequest.id, id))
    .returning();
  return updated ?? null;
}

export async function cancelLeaveRequest({
  workspaceId, id, database = db
}: { workspaceId: string; id: string; database?: DbOrTx }) {
  const [updated] = await database.update(leaveRequest)
    .set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() })
    .where(and(
      eq(leaveRequest.id, id),
      eq(leaveRequest.workspaceId, workspaceId),
      eq(leaveRequest.status, "approved")
    ))
    .returning();
  return updated ?? null;
}

export async function deleteLeaveRequest({
  workspaceId, id, database = db
}: { workspaceId: string; id: string; database?: DbOrTx }) {
  const [deleted] = await database.delete(leaveRequest)
    .where(and(eq(leaveRequest.id, id), eq(leaveRequest.workspaceId, workspaceId)))
    .returning({ id: leaveRequest.id });
  return deleted ?? null;
}

export async function listLeaveRequests({
  workspaceId, userId, from, to, status = "approved", database = db
}: {
  workspaceId: string; userId?: string; from?: string; to?: string;
  status?: "approved" | "cancelled"; database?: DbOrTx;
}) {
  const conds = [eq(leaveRequest.workspaceId, workspaceId), eq(leaveRequest.status, status)];
  if (userId) conds.push(eq(leaveRequest.userId, userId));
  if (from) conds.push(gte(leaveRequest.startDate, from));
  if (to) conds.push(lte(leaveRequest.endDate, to));
  return database.select().from(leaveRequest)
    .where(and(...conds))
    .orderBy(desc(leaveRequest.startDate));
}
