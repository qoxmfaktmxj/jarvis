import { db } from "@jarvis/db/client";
import { project, systemAccess } from "@jarvis/db/schema";
import {
  createEnvSecretResolver,
  isSecretRef,
  type SecretResolver
} from "@jarvis/secret";
import {
  canAccessProjectAccessEntry,
  canResolveProjectSecrets
} from "@jarvis/auth/rbac";
import { and, count, desc, eq, ilike, or } from "drizzle-orm";

type SystemsDb = typeof db;
type SystemRow = typeof project.$inferSelect;
type SystemAccessRow = typeof systemAccess.$inferSelect;

export interface PaginatedSystems {
  data: SystemRow[];
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

type ListSystemsParams = {
  workspaceId: string;
  // category and environment were removed from the project schema (P1-A).
  // TODO(P3-A): remove these from all callers once the file is renamed to projects.ts
  category?: string;
  environment?: string;
  status?: string;
  q?: string;
  page?: number;
  pageSize?: number;
  database?: SystemsDb;
};

type CreateSystemInput = {
  name: string;
  // TODO(P3-A): category and environment no longer exist on project table; remove these from callers
  category?: string;
  environment?: string;
  description?: string;
  techStack?: string;
  repositoryUrl?: string;
  dashboardUrl?: string;
  sensitivity?:
    | "PUBLIC"
    | "INTERNAL"
    | "RESTRICTED"
    | "SECRET_REF_ONLY";
  status?: "active" | "deprecated" | "decommissioned";
};

type CreateSystemAccessInput = {
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
};

function normalizeOptionalString(value?: string | null) {
  if (!value) {
    return null;
  }

  return value;
}

export async function listSystems({
  workspaceId,
  // category and environment are dropped from the project schema (P1-A); ignored here
  // TODO(P3-A): remove params from callers
  status,
  q,
  page = 1,
  pageSize = 20,
  database = db
}: ListSystemsParams): Promise<PaginatedSystems> {
  const safePage = Math.max(1, page);
  const safePageSize = Math.min(100, Math.max(1, pageSize));
  const conditions = [eq(project.workspaceId, workspaceId)];

  if (status) {
    conditions.push(eq(project.status, status));
  }
  if (q) {
    conditions.push(or(ilike(project.name, `%${q}%`), ilike(project.description, `%${q}%`))!);
  }

  const where = and(...conditions);
  const [rows, totalRows] = await Promise.all([
    database
      .select()
      .from(project)
      .where(where)
      .orderBy(desc(project.createdAt))
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

export async function createSystem({
  workspaceId,
  userId,
  input,
  database = db
}: {
  workspaceId: string;
  userId: string;
  input: CreateSystemInput;
  database?: SystemsDb;
}) {
  // NOTE: category and environment are not in the project schema (P1-A). Silently ignored.
  const [created] = await database
    .insert(project)
    .values({
      workspaceId,
      // companyId is required on the project table; callers must supply it via a separate mechanism.
      // TODO(P3-A): update CreateSystemInput to include companyId and pass it here
      companyId: "00000000-0000-0000-0000-000000000000",
      ownerId: userId,
      name: input.name,
      description: normalizeOptionalString(input.description),
      sensitivity: input.sensitivity ?? "INTERNAL",
      status: input.status ?? "active"
    })
    .returning();

  return created;
}

export async function getSystem({
  workspaceId,
  systemId,
  database = db
}: {
  workspaceId: string;
  systemId: string;
  database?: SystemsDb;
}) {
  const [row] = await database
    .select()
    .from(project)
    .where(and(eq(project.id, systemId), eq(project.workspaceId, workspaceId)))
    .limit(1);

  return row ?? null;
}

export async function updateSystem({
  workspaceId,
  systemId,
  input,
  database = db
}: {
  workspaceId: string;
  systemId: string;
  input: Partial<CreateSystemInput>;
  database?: SystemsDb;
}) {
  // NOTE: category and environment are not in the project schema (P1-A). Silently ignored.
  const [updated] = await database
    .update(project)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined
        ? { description: normalizeOptionalString(input.description) }
        : {}),
      ...(input.sensitivity !== undefined ? { sensitivity: input.sensitivity } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      updatedAt: new Date()
    })
    .where(and(eq(project.id, systemId), eq(project.workspaceId, workspaceId)))
    .returning();

  return updated ?? null;
}

export async function deleteSystem({
  workspaceId,
  systemId,
  database = db
}: {
  workspaceId: string;
  systemId: string;
  database?: SystemsDb;
}) {
  const [deleted] = await database
    .delete(project)
    .where(and(eq(project.id, systemId), eq(project.workspaceId, workspaceId)))
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

export async function listSystemAccessEntries({
  workspaceId,
  systemId,
  sessionRoles,
  sessionPermissions,
  database = db,
  resolver = createEnvSecretResolver()
}: {
  workspaceId: string;
  systemId: string;
  sessionRoles: string[];
  sessionPermissions: string[];
  database?: SystemsDb;
  resolver?: SecretResolver;
}): Promise<ResolvedAccessEntry[] | null> {
  const sys = await getSystem({ workspaceId, systemId, database });
  if (!sys) {
    return null;
  }

  const rows = await database
    .select()
    .from(systemAccess)
    .where(
      and(eq(systemAccess.systemId, systemId), eq(systemAccess.workspaceId, workspaceId))
    )
    .orderBy(systemAccess.sortOrder);

  const visibleRows = rows.filter((row: SystemAccessRow) =>
    canAccessProjectAccessEntry(sessionRoles, row.requiredRole)
  );

  const allowResolve = canResolveProjectSecrets(
    sessionPermissions,
    sys.sensitivity
  );

  return Promise.all(
    visibleRows.map(async (row: SystemAccessRow) => ({
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

export async function createSystemAccess({
  workspaceId,
  systemId,
  input,
  database = db
}: {
  workspaceId: string;
  systemId: string;
  input: CreateSystemAccessInput;
  database?: SystemsDb;
}) {
  const sys = await getSystem({ workspaceId, systemId, database });
  if (!sys) {
    return null;
  }

  const [created] = await database
    .insert(systemAccess)
    .values({
      workspaceId,
      systemId,
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

export async function deleteSystemAccess({
  workspaceId,
  systemId,
  accessId,
  database = db
}: {
  workspaceId: string;
  systemId: string;
  accessId: string;
  database?: SystemsDb;
}) {
  const [deleted] = await database
    .delete(systemAccess)
    .where(
      and(
        eq(systemAccess.id, accessId),
        eq(systemAccess.systemId, systemId),
        eq(systemAccess.workspaceId, workspaceId)
      )
    )
    .returning({ id: systemAccess.id });

  return deleted ?? null;
}
