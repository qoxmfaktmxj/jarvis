import { db } from "@jarvis/db/client";
import {
  additionalDevelopment,
  additionalDevelopmentEffort,
  additionalDevelopmentRevenue,
  additionalDevelopmentStaff,
  company,
  project,
  user,
} from "@jarvis/db/schema";
import { aliasedTable, and, count, desc, eq, ilike, or } from "drizzle-orm";

type ListParams = {
  workspaceId: string;
  projectId?: string;
  status?: string;
  part?: string;
  q?: string;
  page?: number;
  pageSize?: number;
  database?: typeof db;
};

export async function listAdditionalDev({
  workspaceId,
  projectId,
  status,
  part,
  q,
  page = 1,
  pageSize = 20,
  database = db,
}: ListParams) {
  const safePage = Math.max(1, page);
  const safeSize = Math.min(100, Math.max(1, pageSize));
  const conds = [eq(additionalDevelopment.workspaceId, workspaceId)];
  if (projectId) conds.push(eq(additionalDevelopment.projectId, projectId));
  if (status) conds.push(eq(additionalDevelopment.status, status));
  if (part) conds.push(eq(additionalDevelopment.part, part));
  if (q) {
    conds.push(
      or(
        ilike(additionalDevelopment.projectName, `%${q}%`),
        ilike(additionalDevelopment.requestContent, `%${q}%`),
      )!,
    );
  }
  const where = and(...conds);

  const pmAlias = aliasedTable(user, "pm");
  const devAlias = aliasedTable(user, "dev");

  const [rowsRaw, totals] = await Promise.all([
    database
      .select({
        row: additionalDevelopment,
        pmName: pmAlias.name,
        pmSabun: pmAlias.employeeId,
        devName: devAlias.name,
        devSabun: devAlias.employeeId,
        customerCompanyName: company.name,
      })
      .from(additionalDevelopment)
      .leftJoin(pmAlias, eq(additionalDevelopment.pmId, pmAlias.id))
      .leftJoin(devAlias, eq(additionalDevelopment.developerId, devAlias.id))
      .leftJoin(company, eq(additionalDevelopment.customerCompanyId, company.id))
      .where(where)
      .orderBy(desc(additionalDevelopment.createdAt))
      .limit(safeSize)
      .offset((safePage - 1) * safeSize),
    database
      .select({ total: count() })
      .from(additionalDevelopment)
      .where(where),
  ]);

  const rows = rowsRaw.map((r) => ({
    ...r.row,
    pmName: r.pmName,
    pmSabun: r.pmSabun,
    devName: r.devName,
    devSabun: r.devSabun,
    customerCompanyName: r.customerCompanyName,
  }));

  const total = Number(totals[0]?.total ?? 0);
  return {
    data: rows,
    pagination: {
      page: safePage,
      pageSize: safeSize,
      total,
      totalPages: total === 0 ? 1 : Math.ceil(total / safeSize),
    },
  };
}

export async function getAdditionalDev({
  workspaceId,
  id,
  database = db,
}: {
  workspaceId: string;
  id: string;
  database?: typeof db;
}) {
  const pmAlias = aliasedTable(user, "pm");
  const devAlias = aliasedTable(user, "dev");

  const [rowRaw] = await database
    .select({
      row: additionalDevelopment,
      pmName: pmAlias.name,
      pmSabun: pmAlias.employeeId,
      devName: devAlias.name,
      devSabun: devAlias.employeeId,
      customerCompanyName: company.name,
    })
    .from(additionalDevelopment)
    .leftJoin(pmAlias, eq(additionalDevelopment.pmId, pmAlias.id))
    .leftJoin(devAlias, eq(additionalDevelopment.developerId, devAlias.id))
    .leftJoin(company, eq(additionalDevelopment.customerCompanyId, company.id))
    .where(
      and(
        eq(additionalDevelopment.id, id),
        eq(additionalDevelopment.workspaceId, workspaceId),
      ),
    )
    .limit(1);
  if (!rowRaw) return null;
  return {
    ...rowRaw.row,
    pmName: rowRaw.pmName,
    pmSabun: rowRaw.pmSabun,
    devName: rowRaw.devName,
    devSabun: rowRaw.devSabun,
    customerCompanyName: rowRaw.customerCompanyName,
  };
}

export type CreateAdditionalDevInput = {
  projectId: string;
  projectName?: string;
  requestYearMonth?: string;
  requestSequence?: number;
  requesterName?: string;
  requestContent?: string;
  part?: string;
  status?: string;
  contractNumber?: string;
  contractStartMonth?: string;
  contractEndMonth?: string;
  contractAmount?: string;
  isPaid?: boolean;
  invoiceIssued?: boolean;
  inspectionConfirmed?: boolean;
  estimateProgress?: string;
  devStartDate?: string;
  devEndDate?: string;
  pmId?: string;
  developerId?: string;
  customerCompanyId?: string;
  isOnsite?: boolean;
  vendorContactNote?: string;
  paidEffort?: string;
  actualEffort?: string;
  attachmentFileRef?: string;
  remark?: string;
};

export async function createAdditionalDev({
  workspaceId,
  input,
  database = db,
}: {
  workspaceId: string;
  input: CreateAdditionalDevInput;
  database?: typeof db;
}) {
  // Verify cross-tenant FKs before inserting.
  const [p] = await database
    .select({ id: project.id })
    .from(project)
    .where(and(eq(project.id, input.projectId), eq(project.workspaceId, workspaceId)))
    .limit(1);
  if (!p) throw new Error('projectId not in workspace');

  if (input.pmId) {
    const [pm] = await database
      .select({ id: user.id })
      .from(user)
      .where(and(eq(user.id, input.pmId), eq(user.workspaceId, workspaceId)))
      .limit(1);
    if (!pm) throw new Error('pmId not in workspace');
  }

  if (input.customerCompanyId) {
    const [c] = await database
      .select({ id: company.id })
      .from(company)
      .where(and(
        eq(company.id, input.customerCompanyId),
        eq(company.workspaceId, workspaceId),
      ))
      .limit(1);
    if (!c) throw new Error('customerCompanyId not in workspace');
  }

  if (input.developerId) {
    const [dev] = await database
      .select({ id: user.id })
      .from(user)
      .where(and(eq(user.id, input.developerId), eq(user.workspaceId, workspaceId)))
      .limit(1);
    if (!dev) throw new Error('developerId not in workspace');
  }

  const [created] = await database
    .insert(additionalDevelopment)
    .values({
      workspaceId,
      ...input,
      status: input.status ?? "협의중",
    })
    .returning();
  return created!;
}

export async function updateAdditionalDev({
  workspaceId,
  id,
  input,
  database = db,
}: {
  workspaceId: string;
  id: string;
  input: Partial<CreateAdditionalDevInput>;
  database?: typeof db;
}) {
  // Verify cross-tenant FKs for any provided foreign key fields.
  if (input.projectId) {
    const [p] = await database
      .select({ id: project.id })
      .from(project)
      .where(and(eq(project.id, input.projectId), eq(project.workspaceId, workspaceId)))
      .limit(1);
    if (!p) throw new Error('projectId not in workspace');
  }

  if (input.pmId) {
    const [pm] = await database
      .select({ id: user.id })
      .from(user)
      .where(and(eq(user.id, input.pmId), eq(user.workspaceId, workspaceId)))
      .limit(1);
    if (!pm) throw new Error('pmId not in workspace');
  }

  if (input.customerCompanyId) {
    const [c] = await database
      .select({ id: company.id })
      .from(company)
      .where(and(
        eq(company.id, input.customerCompanyId),
        eq(company.workspaceId, workspaceId),
      ))
      .limit(1);
    if (!c) throw new Error('customerCompanyId not in workspace');
  }

  if (input.developerId) {
    const [dev] = await database
      .select({ id: user.id })
      .from(user)
      .where(and(eq(user.id, input.developerId), eq(user.workspaceId, workspaceId)))
      .limit(1);
    if (!dev) throw new Error('developerId not in workspace');
  }

  const [updated] = await database
    .update(additionalDevelopment)
    .set({ ...input, updatedAt: new Date() })
    .where(
      and(
        eq(additionalDevelopment.id, id),
        eq(additionalDevelopment.workspaceId, workspaceId),
      ),
    )
    .returning();
  return updated ?? null;
}

export async function deleteAdditionalDev({
  workspaceId,
  id,
  database = db,
}: {
  workspaceId: string;
  id: string;
  database?: typeof db;
}) {
  const [deleted] = await database
    .delete(additionalDevelopment)
    .where(
      and(
        eq(additionalDevelopment.id, id),
        eq(additionalDevelopment.workspaceId, workspaceId),
      ),
    )
    .returning({ id: additionalDevelopment.id });
  return deleted ?? null;
}

async function assertAddDevInWorkspace(
  database: typeof db,
  addDevId: string,
  workspaceId: string,
): Promise<void> {
  const [row] = await database
    .select({ id: additionalDevelopment.id })
    .from(additionalDevelopment)
    .where(and(
      eq(additionalDevelopment.id, addDevId),
      eq(additionalDevelopment.workspaceId, workspaceId),
    ))
    .limit(1);
  if (!row) throw new Error('additional_development not found in workspace');
}

export async function upsertEffort({
  addDevId,
  workspaceId,
  yearMonth,
  effort,
  database = db,
}: {
  addDevId: string;
  workspaceId: string;
  yearMonth: string;
  effort: string;
  database?: typeof db;
}) {
  await assertAddDevInWorkspace(database, addDevId, workspaceId);
  await database
    .insert(additionalDevelopmentEffort)
    .values({ addDevId, yearMonth, effort })
    .onConflictDoUpdate({
      target: [
        additionalDevelopmentEffort.addDevId,
        additionalDevelopmentEffort.yearMonth,
      ],
      set: { effort },
    });
}

export async function listEfforts({
  addDevId,
  workspaceId,
  database = db,
}: {
  addDevId: string;
  workspaceId: string;
  database?: typeof db;
}) {
  await assertAddDevInWorkspace(database, addDevId, workspaceId);
  return database
    .select()
    .from(additionalDevelopmentEffort)
    .where(eq(additionalDevelopmentEffort.addDevId, addDevId));
}

export async function upsertRevenue({
  addDevId,
  workspaceId,
  yearMonth,
  amount,
  database = db,
}: {
  addDevId: string;
  workspaceId: string;
  yearMonth: string;
  amount: string;
  database?: typeof db;
}) {
  await assertAddDevInWorkspace(database, addDevId, workspaceId);
  await database
    .insert(additionalDevelopmentRevenue)
    .values({ addDevId, yearMonth, amount })
    .onConflictDoUpdate({
      target: [
        additionalDevelopmentRevenue.addDevId,
        additionalDevelopmentRevenue.yearMonth,
      ],
      set: { amount },
    });
}

export async function listRevenues({
  addDevId,
  workspaceId,
  database = db,
}: {
  addDevId: string;
  workspaceId: string;
  database?: typeof db;
}) {
  await assertAddDevInWorkspace(database, addDevId, workspaceId);
  return database
    .select()
    .from(additionalDevelopmentRevenue)
    .where(eq(additionalDevelopmentRevenue.addDevId, addDevId));
}

export async function addStaff({
  addDevId,
  workspaceId,
  userId,
  role,
  startDate,
  endDate,
  database = db,
}: {
  addDevId: string;
  workspaceId: string;
  userId?: string;
  role?: string;
  startDate?: string;
  endDate?: string;
  database?: typeof db;
}) {
  await assertAddDevInWorkspace(database, addDevId, workspaceId);
  const [created] = await database
    .insert(additionalDevelopmentStaff)
    .values({ addDevId, userId, role, startDate, endDate })
    .returning();
  return created!;
}

export async function listStaff({
  addDevId,
  workspaceId,
  database = db,
}: {
  addDevId: string;
  workspaceId: string;
  database?: typeof db;
}) {
  await assertAddDevInWorkspace(database, addDevId, workspaceId);
  return database
    .select()
    .from(additionalDevelopmentStaff)
    .where(eq(additionalDevelopmentStaff.addDevId, addDevId));
}
