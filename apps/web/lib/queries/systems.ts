import { db } from "@jarvis/db/client";
import { system, systemAccess } from "@jarvis/db/schema";
import {
  createEnvSecretResolver,
  isSecretRef,
  type SecretResolver
} from "@jarvis/secret";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { and, count, desc, eq, ilike, or } from "drizzle-orm";

type SystemsDb = typeof db;
type SystemRow = typeof system.$inferSelect;
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
  category?: "web" | "db" | "server" | "network" | "middleware";
  environment?: "dev" | "staging" | "prod";
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
  category,
  environment,
  status,
  q,
  page = 1,
  pageSize = 20,
  database = db
}: ListSystemsParams): Promise<PaginatedSystems> {
  const safePage = Math.max(1, page);
  const safePageSize = Math.min(100, Math.max(1, pageSize));
  const conditions = [eq(system.workspaceId, workspaceId)];

  if (category) {
    conditions.push(eq(system.category, category));
  }
  if (environment) {
    conditions.push(eq(system.environment, environment));
  }
  if (status) {
    conditions.push(eq(system.status, status));
  }
  if (q) {
    conditions.push(or(ilike(system.name, `%${q}%`), ilike(system.description, `%${q}%`))!);
  }

  const where = and(...conditions);
  const [rows, totalRows] = await Promise.all([
    database
      .select()
      .from(system)
      .where(where)
      .orderBy(desc(system.createdAt))
      .limit(safePageSize)
      .offset((safePage - 1) * safePageSize),
    database.select({ total: count() }).from(system).where(where)
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
  const [created] = await database
    .insert(system)
    .values({
      workspaceId,
      ownerId: userId,
      name: input.name,
      category: normalizeOptionalString(input.category),
      environment: input.environment ?? "prod",
      description: normalizeOptionalString(input.description),
      techStack: normalizeOptionalString(input.techStack),
      repositoryUrl: normalizeOptionalString(input.repositoryUrl),
      dashboardUrl: normalizeOptionalString(input.dashboardUrl),
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
    .from(system)
    .where(and(eq(system.id, systemId), eq(system.workspaceId, workspaceId)))
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
  const [updated] = await database
    .update(system)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.category !== undefined
        ? { category: normalizeOptionalString(input.category) }
        : {}),
      ...(input.environment !== undefined ? { environment: input.environment } : {}),
      ...(input.description !== undefined
        ? { description: normalizeOptionalString(input.description) }
        : {}),
      ...(input.techStack !== undefined
        ? { techStack: normalizeOptionalString(input.techStack) }
        : {}),
      ...(input.repositoryUrl !== undefined
        ? { repositoryUrl: normalizeOptionalString(input.repositoryUrl) }
        : {}),
      ...(input.dashboardUrl !== undefined
        ? { dashboardUrl: normalizeOptionalString(input.dashboardUrl) }
        : {}),
      ...(input.sensitivity !== undefined ? { sensitivity: input.sensitivity } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      updatedAt: new Date()
    })
    .where(and(eq(system.id, systemId), eq(system.workspaceId, workspaceId)))
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
    .delete(system)
    .where(and(eq(system.id, systemId), eq(system.workspaceId, workspaceId)))
    .returning({ id: system.id });

  return deleted ?? null;
}

function canResolveSecrets({
  sensitivity,
  sessionRoles,
  sessionPermissions
}: {
  sensitivity: string;
  sessionRoles: string[];
  sessionPermissions: string[];
}) {
  if (sessionRoles.includes("ADMIN")) {
    return true;
  }

  if (sensitivity === "SECRET_REF_ONLY") {
    return (
      sessionPermissions.includes(PERMISSIONS.SYSTEM_ACCESS_SECRET) ||
      sessionPermissions.includes(PERMISSIONS.SYSTEM_UPDATE)
    );
  }

  return (
    sessionPermissions.includes(PERMISSIONS.SYSTEM_ACCESS_SECRET) ||
    sessionPermissions.includes(PERMISSIONS.SYSTEM_UPDATE) ||
    sessionPermissions.includes(PERMISSIONS.SYSTEM_READ)
  );
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

  const allowResolve = canResolveSecrets({
    sensitivity: sys.sensitivity,
    sessionRoles,
    sessionPermissions
  });

  return Promise.all(
    rows.map(async (row: SystemAccessRow) => ({
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
