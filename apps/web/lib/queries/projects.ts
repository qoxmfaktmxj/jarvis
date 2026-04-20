import { db } from "@jarvis/db/client";
import { company, project, projectAccess, user } from "@jarvis/db/schema";
import {
  createEnvSecretResolver,
  isSecretRef,
  type SecretResolver
} from "@jarvis/secret";
import {
  canAccessProjectAccessEntry,
  canResolveProjectSecrets
} from "@jarvis/auth/rbac";
import { and, count, desc, eq, ilike, isNotNull, or } from "drizzle-orm";

type ProjectsDb = typeof db;
type ProjectAccessRow = typeof projectAccess.$inferSelect;

export interface ProjectTableRow {
  id: string;
  companyCode: string | null;
  companyName: string | null;
  name: string;
  prodDomainUrl: string | null;
  devDomainUrl: string | null;
  status: string;
  sensitivity: string;
  ownerName: string | null;
  updatedAt: Date;
}

export interface PaginatedProjects {
  data: ProjectTableRow[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface ResolvedSecretField {
  ref: string | null;
  resolved: string | null;
  canView: boolean;
}

export interface ResolvedAccessEntry {
  id: string;
  accessType: string;
  label: string;
  host: string | null;
  port: number | null;
  notes: string | null;
  requiredRole: string | null;
  createdAt: Date;
  usernameRef: ResolvedSecretField;
  passwordRef: ResolvedSecretField;
  connectionStringRef: ResolvedSecretField;
  vpnFileRef: ResolvedSecretField;
}

type ListProjectsParams = {
  workspaceId: string;
  status?: string;
  connectType?: "IP" | "VPN" | "VDI" | "RE";
  hasDev?: boolean;
  q?: string;
  page?: number;
  pageSize?: number;
  database?: ProjectsDb;
};

type CreateProjectInput = {
  companyId: string;
  name: string;
  description?: string;
  sensitivity?: "PUBLIC" | "INTERNAL" | "RESTRICTED" | "SECRET_REF_ONLY";
  status?: "active" | "deprecated" | "decommissioned";
  prodDomainUrl?: string;
  prodConnectType?: "IP" | "VPN" | "VDI" | "RE";
  prodRepositoryUrl?: string;
  prodDbDsn?: string;
  prodSrcPath?: string;
  prodClassPath?: string;
  prodMemo?: string;
  devDomainUrl?: string;
  devConnectType?: "IP" | "VPN" | "VDI" | "RE";
  devRepositoryUrl?: string;
  devDbDsn?: string;
  devSrcPath?: string;
  devClassPath?: string;
  devMemo?: string;
};

type CreateProjectAccessInput = {
  accessType: "db" | "ssh" | "vpn" | "web" | "api";
  label: string;
  host?: string;
  port?: number;
  usernameRef?: string;
  passwordRef?: string;
  connectionStringRef?: string;
  vpnFileRef?: string;
  notes?: string;
  requiredRole?: "VIEWER" | "DEVELOPER" | "MANAGER" | "ADMIN";
  envType: "prod" | "dev";
};

function normalizeOptionalString(value?: string | null) {
  if (!value) {
    return null;
  }

  return value;
}

export async function listProjects({
  workspaceId,
  status,
  connectType,
  hasDev,
  q,
  page = 1,
  pageSize = 20,
  database = db
}: ListProjectsParams): Promise<PaginatedProjects> {
  const safePage = Math.max(1, page);
  const safePageSize = Math.min(100, Math.max(1, pageSize));
  const conditions = [eq(project.workspaceId, workspaceId)];

  if (status) {
    conditions.push(eq(project.status, status));
  }
  if (connectType) {
    conditions.push(
      or(
        eq(project.prodConnectType, connectType),
        eq(project.devConnectType, connectType)
      )!
    );
  }
  if (hasDev === true) {
    conditions.push(isNotNull(project.devDomainUrl));
  }
  if (q) {
    conditions.push(or(ilike(project.name, `%${q}%`), ilike(project.description, `%${q}%`))!);
  }

  const where = and(...conditions);

  const [rows, totalRows] = await Promise.all([
    database
      .select({
        id: project.id,
        name: project.name,
        prodDomainUrl: project.prodDomainUrl,
        devDomainUrl: project.devDomainUrl,
        status: project.status,
        sensitivity: project.sensitivity,
        updatedAt: project.updatedAt,
        companyCode: company.code,
        companyName: company.name,
        ownerName: user.name
      })
      .from(project)
      .leftJoin(company, eq(project.companyId, company.id))
      .leftJoin(user, eq(project.ownerId, user.id))
      .where(where)
      .orderBy(desc(project.updatedAt))
      .limit(safePageSize)
      .offset((safePage - 1) * safePageSize),
    database.select({ total: count() }).from(project).where(where)
  ]);

  const total = Number(totalRows[0]?.total ?? 0);

  return {
    data: rows,
    pagination: {
      page: safePage,
      pageSize: safePageSize,
      total,
      totalPages: total === 0 ? 1 : Math.ceil(total / safePageSize)
    }
  };
}

export async function createProject({
  workspaceId,
  userId,
  input,
  database = db
}: {
  workspaceId: string;
  userId: string;
  input: CreateProjectInput;
  database?: ProjectsDb;
}) {
  const [created] = await database
    .insert(project)
    .values({
      workspaceId,
      companyId: input.companyId,
      ownerId: userId,
      name: input.name,
      description: normalizeOptionalString(input.description),
      sensitivity: input.sensitivity ?? "INTERNAL",
      status: input.status ?? "active",
      prodDomainUrl: normalizeOptionalString(input.prodDomainUrl),
      prodConnectType: normalizeOptionalString(input.prodConnectType),
      prodRepositoryUrl: normalizeOptionalString(input.prodRepositoryUrl),
      prodDbDsn: normalizeOptionalString(input.prodDbDsn),
      prodSrcPath: normalizeOptionalString(input.prodSrcPath),
      prodClassPath: normalizeOptionalString(input.prodClassPath),
      prodMemo: normalizeOptionalString(input.prodMemo),
      devDomainUrl: normalizeOptionalString(input.devDomainUrl),
      devConnectType: normalizeOptionalString(input.devConnectType),
      devRepositoryUrl: normalizeOptionalString(input.devRepositoryUrl),
      devDbDsn: normalizeOptionalString(input.devDbDsn),
      devSrcPath: normalizeOptionalString(input.devSrcPath),
      devClassPath: normalizeOptionalString(input.devClassPath),
      devMemo: normalizeOptionalString(input.devMemo)
    })
    .returning();

  return created;
}

export async function getProject({
  workspaceId,
  projectId,
  database = db
}: {
  workspaceId: string;
  projectId: string;
  database?: ProjectsDb;
}) {
  const [row] = await database
    .select()
    .from(project)
    .where(and(eq(project.id, projectId), eq(project.workspaceId, workspaceId)))
    .limit(1);

  return row ?? null;
}

export async function updateProject({
  workspaceId,
  projectId,
  input,
  database = db
}: {
  workspaceId: string;
  projectId: string;
  input: Partial<CreateProjectInput>;
  database?: ProjectsDb;
}) {
  const [updated] = await database
    .update(project)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined
        ? { description: normalizeOptionalString(input.description) }
        : {}),
      ...(input.sensitivity !== undefined ? { sensitivity: input.sensitivity } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.prodDomainUrl !== undefined
        ? { prodDomainUrl: normalizeOptionalString(input.prodDomainUrl) }
        : {}),
      ...(input.prodConnectType !== undefined
        ? { prodConnectType: normalizeOptionalString(input.prodConnectType) }
        : {}),
      ...(input.prodRepositoryUrl !== undefined
        ? { prodRepositoryUrl: normalizeOptionalString(input.prodRepositoryUrl) }
        : {}),
      ...(input.prodDbDsn !== undefined
        ? { prodDbDsn: normalizeOptionalString(input.prodDbDsn) }
        : {}),
      ...(input.prodSrcPath !== undefined
        ? { prodSrcPath: normalizeOptionalString(input.prodSrcPath) }
        : {}),
      ...(input.prodClassPath !== undefined
        ? { prodClassPath: normalizeOptionalString(input.prodClassPath) }
        : {}),
      ...(input.prodMemo !== undefined
        ? { prodMemo: normalizeOptionalString(input.prodMemo) }
        : {}),
      ...(input.devDomainUrl !== undefined
        ? { devDomainUrl: normalizeOptionalString(input.devDomainUrl) }
        : {}),
      ...(input.devConnectType !== undefined
        ? { devConnectType: normalizeOptionalString(input.devConnectType) }
        : {}),
      ...(input.devRepositoryUrl !== undefined
        ? { devRepositoryUrl: normalizeOptionalString(input.devRepositoryUrl) }
        : {}),
      ...(input.devDbDsn !== undefined
        ? { devDbDsn: normalizeOptionalString(input.devDbDsn) }
        : {}),
      ...(input.devSrcPath !== undefined
        ? { devSrcPath: normalizeOptionalString(input.devSrcPath) }
        : {}),
      ...(input.devClassPath !== undefined
        ? { devClassPath: normalizeOptionalString(input.devClassPath) }
        : {}),
      ...(input.devMemo !== undefined
        ? { devMemo: normalizeOptionalString(input.devMemo) }
        : {}),
      updatedAt: new Date()
    })
    .where(and(eq(project.id, projectId), eq(project.workspaceId, workspaceId)))
    .returning();

  return updated ?? null;
}

export async function deleteProject({
  workspaceId,
  projectId,
  database = db
}: {
  workspaceId: string;
  projectId: string;
  database?: ProjectsDb;
}) {
  const [deleted] = await database
    .delete(project)
    .where(and(eq(project.id, projectId), eq(project.workspaceId, workspaceId)))
    .returning({ id: project.id });

  return deleted ?? null;
}

async function resolveSecretField(
  value: string | null,
  allowResolve: boolean,
  resolver: SecretResolver
): Promise<ResolvedSecretField> {
  if (!value) {
    return { ref: null, resolved: null, canView: allowResolve };
  }

  if (!isSecretRef(value)) {
    return {
      ref: allowResolve ? value : null,
      resolved: allowResolve ? value : null,
      canView: allowResolve
    };
  }

  if (!allowResolve) {
    return {
      ref: null,
      resolved: null,
      canView: false
    };
  }

  try {
    const resolved = await resolver.resolve(value);
    return {
      ref: null,
      resolved,
      canView: true
    };
  } catch {
    return {
      ref: null,
      resolved: null,
      canView: true
    };
  }
}

export async function listProjectAccessEntries({
  workspaceId,
  projectId,
  sessionRoles,
  sessionPermissions,
  database = db,
  resolver = createEnvSecretResolver()
}: {
  workspaceId: string;
  projectId: string;
  sessionRoles: string[];
  sessionPermissions: string[];
  database?: ProjectsDb;
  resolver?: SecretResolver;
}): Promise<ResolvedAccessEntry[] | null> {
  const proj = await getProject({ workspaceId, projectId, database });
  if (!proj) {
    return null;
  }

  const rows = await database
    .select()
    .from(projectAccess)
    .where(
      and(eq(projectAccess.projectId, projectId), eq(projectAccess.workspaceId, workspaceId))
    )
    .orderBy(projectAccess.sortOrder);

  const visibleRows = rows.filter((row: ProjectAccessRow) =>
    canAccessProjectAccessEntry(sessionRoles, row.requiredRole)
  );

  const allowResolve = canResolveProjectSecrets(
    sessionPermissions,
    proj.sensitivity
  );

  return Promise.all(
    visibleRows.map(async (row: ProjectAccessRow) => ({
      id: row.id,
      accessType: row.accessType,
      label: row.label,
      host: row.host,
      port: row.port,
      notes: row.notes,
      requiredRole: row.requiredRole,
      createdAt: row.createdAt,
      usernameRef: await resolveSecretField(row.usernameRef, allowResolve, resolver),
      passwordRef: await resolveSecretField(row.passwordRef, allowResolve, resolver),
      connectionStringRef: await resolveSecretField(
        row.connectionStringRef,
        allowResolve,
        resolver
      ),
      vpnFileRef: await resolveSecretField(row.vpnFileRef, allowResolve, resolver)
    }))
  );
}

export async function createProjectAccess({
  workspaceId,
  projectId,
  input,
  database = db
}: {
  workspaceId: string;
  projectId: string;
  input: CreateProjectAccessInput;
  database?: ProjectsDb;
}) {
  const proj = await getProject({ workspaceId, projectId, database });
  if (!proj) {
    return null;
  }

  const [created] = await database
    .insert(projectAccess)
    .values({
      workspaceId,
      projectId,
      envType: input.envType,
      accessType: input.accessType,
      label: input.label,
      host: normalizeOptionalString(input.host),
      port: input.port ?? null,
      usernameRef: normalizeOptionalString(input.usernameRef),
      passwordRef: normalizeOptionalString(input.passwordRef),
      connectionStringRef: normalizeOptionalString(input.connectionStringRef),
      vpnFileRef: normalizeOptionalString(input.vpnFileRef),
      notes: normalizeOptionalString(input.notes),
      requiredRole: input.requiredRole ?? "DEVELOPER"
    })
    .returning();

  return created;
}

export async function deleteProjectAccess({
  workspaceId,
  projectId,
  accessId,
  database = db
}: {
  workspaceId: string;
  projectId: string;
  accessId: string;
  database?: ProjectsDb;
}) {
  const [deleted] = await database
    .delete(projectAccess)
    .where(
      and(
        eq(projectAccess.id, accessId),
        eq(projectAccess.projectId, projectId),
        eq(projectAccess.workspaceId, workspaceId)
      )
    )
    .returning({ id: projectAccess.id });

  return deleted ?? null;
}
