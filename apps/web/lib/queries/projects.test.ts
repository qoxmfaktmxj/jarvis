import { describe, expect, it, vi } from "vitest";
import {
  createProjectAccess,
  listProjectAccessEntries,
  listProjects
} from "./projects";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds a minimal Drizzle-like mock used by listProjectAccessEntries.
 * The first `select()` call returns `systemRows` (project lookup).
 * The second `select()` call returns `accessRows` (access entry list).
 */
function makeAccessDatabase(systemRows: unknown[], accessRows: unknown[]) {
  const query = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(systemRows),
    orderBy: vi.fn().mockResolvedValue(accessRows)
  };

  return {
    select: vi.fn().mockReturnValue(query)
  };
}

/**
 * Builds a Drizzle-like mock for queries that use the builder-pattern chain
 * ending in `.then()` (i.e. listProjects, createProjectAccess).
 * `resolveWith` is what the chain resolves to.
 */
function makeChainDatabase(resolveWith: unknown) {
  const chain: Record<string, unknown> = {};
  const methods = [
    "select",
    "from",
    "leftJoin",
    "where",
    "orderBy",
    "limit",
    "offset",
    "insert",
    "values",
    "returning",
    "delete"
  ];

  // Make every method return the chain itself so calls can be chained freely.
  for (const m of methods) {
    chain[m] = vi.fn(() => chain);
  }

  // Promise-like resolution: the last awaited call resolves to resolveWith.
  (chain as { then: (resolve: (v: unknown) => void) => Promise<unknown> }).then = (resolve) =>
    Promise.resolve(resolve(resolveWith));

  return chain;
}

/**
 * Builds a two-call mock database:
 * - first call to `select()` → chain resolving to `firstRows`
 * - second call to `select()` → chain resolving to `secondRows`
 */
function makeTwoSelectDatabase(firstRows: unknown[], secondRows: unknown[]) {
  const db = { select: vi.fn() };
  db.select
    .mockReturnValueOnce(makeChainDatabase(firstRows))
    .mockReturnValueOnce(makeChainDatabase(secondRows));
  return db;
}

// ---------------------------------------------------------------------------
// listProjectAccessEntries (existing test, unchanged)
// ---------------------------------------------------------------------------

describe("listProjectAccessEntries", () => {
  it("filters out entries above the caller role and hides secret values without secret permission", async () => {
    const database = makeAccessDatabase(
      [
        {
          id: "proj-1",
          workspaceId: "ws-1",
          sensitivity: "INTERNAL"
        }
      ],
      [
        {
          id: "viewer-entry",
          accessType: "web",
          label: "Viewer Docs",
          host: "intranet.local",
          port: 443,
          notes: null,
          requiredRole: "VIEWER",
          usernameRef: "plain-user",
          passwordRef: "vault://jarvis/viewer/password",
          connectionStringRef: null,
          vpnFileRef: null,
          createdAt: new Date()
        },
        {
          id: "developer-entry",
          accessType: "db",
          label: "Primary DB",
          host: "db.local",
          port: 5432,
          notes: null,
          requiredRole: "DEVELOPER",
          usernameRef: "vault://jarvis/db/user",
          passwordRef: "vault://jarvis/db/password",
          connectionStringRef: null,
          vpnFileRef: null,
          createdAt: new Date()
        }
      ]
    );

    const resolver = {
      resolve: vi.fn().mockResolvedValue("resolved-secret")
    };

    const entries = await listProjectAccessEntries({
      workspaceId: "ws-1",
      projectId: "proj-1",
      sessionRoles: ["VIEWER"],
      sessionPermissions: ["project:read"],
      database: database as never,
      resolver
    });

    expect(entries).toHaveLength(1);
    expect(entries?.[0]?.id).toBe("viewer-entry");
    expect(entries?.[0]?.usernameRef).toEqual({
      ref: null,
      resolved: null,
      canView: false
    });
    expect(entries?.[0]?.passwordRef).toEqual({
      ref: null,
      resolved: null,
      canView: false
    });
    expect(resolver.resolve).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// listProjects — connectType filter (OR across prod/dev)
// ---------------------------------------------------------------------------

describe("listProjects", () => {
  it("returns projects where prodConnectType OR devConnectType matches the filter", async () => {
    // Fixture: 3 projects.
    //   proj-A: prodConnectType=VPN, devConnectType=null  → should match
    //   proj-B: prodConnectType=null, devConnectType=VPN  → should match
    //   proj-C: prodConnectType=null, devConnectType=null → should NOT match
    //
    // listProjects uses Promise.all with two queries:
    //   query 1: rows (data)
    //   query 2: count
    //
    // We simulate the DB returning only proj-A and proj-B (the where clause is
    // built in application code and passed to the real DB; here we mock the DB
    // returning the already-filtered rows to verify the plumbing).

    const matchingRows = [
      {
        id: "proj-A",
        name: "Alpha",
        prodDomainUrl: "https://alpha.example.com",
        devDomainUrl: null,
        status: "active",
        sensitivity: "INTERNAL",
        updatedAt: new Date("2026-01-01"),
        companyCode: "ACME",
        companyName: "Acme Corp",
        ownerName: "Alice"
      },
      {
        id: "proj-B",
        name: "Beta",
        prodDomainUrl: null,
        devDomainUrl: "https://dev.beta.example.com",
        status: "active",
        sensitivity: "PUBLIC",
        updatedAt: new Date("2026-01-02"),
        companyCode: "BETA",
        companyName: "Beta Inc",
        ownerName: null
      }
    ];

    const db = makeTwoSelectDatabase(matchingRows, [{ total: 2 }]);

    const result = await listProjects({
      workspaceId: "ws-1",
      connectType: "VPN",
      database: db as never
    });

    expect(result.data).toHaveLength(2);
    expect(result.data.map((r) => r.id)).toEqual(["proj-A", "proj-B"]);
    expect(result.pagination.total).toBe(2);
  });

  it("returns only projects with devDomainUrl set when hasDev=true", async () => {
    const rowWithDev = {
      id: "proj-D",
      name: "Dev Project",
      prodDomainUrl: "https://prod.d.example.com",
      devDomainUrl: "https://dev.d.example.com",
      status: "active",
      sensitivity: "INTERNAL",
      updatedAt: new Date("2026-02-01"),
      companyCode: "DEV",
      companyName: "Dev Corp",
      ownerName: "Bob"
    };

    const db = makeTwoSelectDatabase([rowWithDev], [{ total: 1 }]);

    const result = await listProjects({
      workspaceId: "ws-1",
      hasDev: true,
      database: db as never
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.id).toBe("proj-D");
    expect(result.data[0]?.devDomainUrl).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// createProjectAccess — envType is persisted correctly
// ---------------------------------------------------------------------------

describe("createProjectAccess", () => {
  function makeProjectAccessDatabase(projectRow: unknown, createdRow: unknown) {
    // getProject uses: select().from().where().limit() → resolves to [projectRow]
    // insert uses:    insert().values().returning()    → resolves to [createdRow]
    const getChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([projectRow])
    };

    const insertChain = {
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([createdRow])
    };

    const db = {
      select: vi.fn().mockReturnValue(getChain),
      insert: vi.fn().mockReturnValue(insertChain)
    };

    return { db, insertChain };
  }

  it("persists envType=dev when called with dev", async () => {
    const createdRow = {
      id: "access-1",
      workspaceId: "ws-1",
      projectId: "proj-1",
      envType: "dev",
      accessType: "db",
      label: "Dev DB",
      host: null,
      port: null,
      usernameRef: null,
      passwordRef: null,
      connectionStringRef: null,
      vpnFileRef: null,
      notes: null,
      requiredRole: "DEVELOPER",
      sortOrder: 0,
      createdAt: new Date()
    };

    const { db, insertChain } = makeProjectAccessDatabase(
      { id: "proj-1", workspaceId: "ws-1", sensitivity: "INTERNAL" },
      createdRow
    );

    const result = await createProjectAccess({
      workspaceId: "ws-1",
      projectId: "proj-1",
      input: {
        envType: "dev",
        accessType: "db",
        label: "Dev DB"
      },
      database: db as never
    });

    expect(result).not.toBeNull();
    // Verify the values passed to insert contain envType: "dev"
    const insertedValues = (insertChain.values as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(insertedValues).toMatchObject({ envType: "dev" });
  });

  it("persists envType=prod when called with prod", async () => {
    const createdRow = {
      id: "access-2",
      workspaceId: "ws-1",
      projectId: "proj-1",
      envType: "prod",
      accessType: "ssh",
      label: "Prod SSH",
      host: "prod.example.com",
      port: 22,
      usernameRef: null,
      passwordRef: null,
      connectionStringRef: null,
      vpnFileRef: null,
      notes: null,
      requiredRole: "DEVELOPER",
      sortOrder: 0,
      createdAt: new Date()
    };

    const { db, insertChain } = makeProjectAccessDatabase(
      { id: "proj-1", workspaceId: "ws-1", sensitivity: "INTERNAL" },
      createdRow
    );

    const result = await createProjectAccess({
      workspaceId: "ws-1",
      projectId: "proj-1",
      input: {
        envType: "prod",
        accessType: "ssh",
        label: "Prod SSH",
        host: "prod.example.com",
        port: 22
      },
      database: db as never
    });

    expect(result).not.toBeNull();
    const insertedValues = (insertChain.values as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(insertedValues).toMatchObject({ envType: "prod" });
  });
});
