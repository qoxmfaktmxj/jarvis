import { describe, expect, it, vi } from "vitest";
import { listSystemAccessEntries } from "./systems";

function makeDatabase(systemRows: unknown[], accessRows: unknown[]) {
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

describe("listSystemAccessEntries", () => {
  it("filters out entries above the caller role and hides secret values without secret permission", async () => {
    const database = makeDatabase(
      [
        {
          id: "sys-1",
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

    const entries = await listSystemAccessEntries({
      workspaceId: "ws-1",
      systemId: "sys-1",
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
