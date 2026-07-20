import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { Pool } from "pg";
import {
  appUser,
  codeGroup,
  db,
  menuItem,
  migrate,
  role,
  seedSystem,
  sourceDocument,
  userRole,
  userSession,
  wikiPageIndex,
  wikiReviewQueue,
  workspace,
} from "@jarvis/db";
import { SYSTEM_MENUS } from "@jarvis/shared/constants/routes";
import { listAuditLogs } from "../audit.js";
import { listCodeGroups, listCodeItems, saveCodeGroups, saveCodeItems } from "../codes.js";
import { listMenus, saveMenus } from "../menus.js";
import { listSources } from "../sources.js";
import { listUsers, saveUsers } from "../users.js";
import { resolveWikiReview } from "../wiki-reviews.js";

const connectionString = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("TEST_DATABASE_URL or DATABASE_URL is required");

const migrationPool = new Pool({ connectionString, max: 2 });
const migrationsDir = fileURLToPath(
  new URL("../../../../../../packages/db/migrations/", import.meta.url),
);
const runId = randomUUID();
const workspaceIds: string[] = [];
let primaryWorkspaceId = "";
let foreignWorkspaceId = "";
let actorUserId = "";
let foreignUserId = "";
let foreignMenuId = "";
let foreignCodeGroupId = "";

async function createWorkspace(code: string): Promise<string> {
  const [row] = await db
    .insert(workspace)
    .values({ code, name: code, settings: { synthetic: true } })
    .returning({ id: workspace.id });
  workspaceIds.push(row.id);
  return row.id;
}

async function createRoles(workspaceId: string) {
  return db
    .insert(role)
    .values([
      { workspaceId, code: "ADMIN", name: "관리자", isSystem: true },
      { workspaceId, code: "EDITOR", name: "편집자", isSystem: true },
      { workspaceId, code: "READER", name: "열람자", isSystem: true },
    ])
    .returning({ id: role.id, code: role.code });
}

beforeAll(async () => {
  await migrate(migrationPool, migrationsDir);
  await seedSystem(migrationPool);
  primaryWorkspaceId = await createWorkspace(`repository-primary-${runId}`);
  foreignWorkspaceId = await createWorkspace(`repository-foreign-${runId}`);
  const primaryRoles = await createRoles(primaryWorkspaceId);
  const foreignRoles = await createRoles(foreignWorkspaceId);
  const primaryAdminRoleId = primaryRoles.find(({ code }) => code === "ADMIN")?.id;
  const foreignReaderRoleId = foreignRoles.find(({ code }) => code === "READER")?.id;
  if (!primaryAdminRoleId || !foreignReaderRoleId) throw new Error("test roles are missing");

  actorUserId = randomUUID();
  foreignUserId = randomUUID();
  await db.insert(appUser).values([
    {
      id: actorUserId,
      workspaceId: primaryWorkspaceId,
      email: `actor-${runId}@example.invalid`,
      displayName: "Repository Actor",
      passwordHash: "test-only-hash",
      status: "active",
      accountType: "human",
      preferences: {},
    },
    {
      id: foreignUserId,
      workspaceId: foreignWorkspaceId,
      email: `foreign-${runId}@example.invalid`,
      displayName: "Foreign User",
      passwordHash: "test-only-hash",
      status: "active",
      accountType: "human",
      preferences: {},
    },
  ]);
  await db.insert(userRole).values([
    { workspaceId: primaryWorkspaceId, userId: actorUserId, roleId: primaryAdminRoleId },
    { workspaceId: foreignWorkspaceId, userId: foreignUserId, roleId: foreignReaderRoleId },
  ]);

  foreignMenuId = randomUUID();
  await db.insert(menuItem).values({
    id: foreignMenuId,
    workspaceId: foreignWorkspaceId,
    parentId: null,
    code: "foreign-menu",
    label: "Foreign Menu",
    description: null,
    kind: "group",
    icon: null,
    routePath: null,
    sortOrder: 0,
    isVisible: true,
  });
  foreignCodeGroupId = randomUUID();
  await db.insert(codeGroup).values({
    id: foreignCodeGroupId,
    workspaceId: foreignWorkspaceId,
    code: "FOREIGN_GROUP",
    name: "Foreign Group",
    description: null,
    isActive: true,
  });
});

describe.sequential("public admin repositories", () => {
  it("returns whitelisted user fields and blocks cross-workspace mutation", async () => {
    const userId = randomUUID();
    await expect(
      saveUsers(
        { workspaceId: primaryWorkspaceId, actorUserId },
        {
          creates: [
            {
              id: userId,
              email: `editor-${runId}@example.invalid`,
              displayName: "Editor",
              role: "EDITOR",
              status: "active",
              initialPassword: "PublicJarvis2026",
            },
          ],
        },
      ),
    ).resolves.toMatchObject({ ok: true, created: 1 });

    const listed = await listUsers({ workspaceId: primaryWorkspaceId }, { q: "Editor" });
    expect(listed.rows).toHaveLength(1);
    expect(JSON.stringify(listed)).not.toMatch(/password|hash/i);

    await expect(
      saveUsers(
        { workspaceId: primaryWorkspaceId, actorUserId },
        { updates: [{ id: foreignUserId, patch: { displayName: "Breached" } }] },
      ),
    ).resolves.toMatchObject({ updated: 0 });
    const [foreign] = await db
      .select({ displayName: appUser.displayName })
      .from(appUser)
      .where(
        and(eq(appUser.workspaceId, foreignWorkspaceId), eq(appUser.id, foreignUserId)),
      )
      .limit(1);
    expect(foreign?.displayName).toBe("Foreign User");

    const audits = await listAuditLogs(
      { workspaceId: primaryWorkspaceId },
      { action: "admin.user.create" },
    );
    expect(audits.rows).toHaveLength(1);
    expect(JSON.stringify(audits)).not.toContain("PublicJarvis2026");
  });

  it("blocks self-delete and revokes target sessions when role or status changes", async () => {
    await expect(
      saveUsers(
        { workspaceId: primaryWorkspaceId, actorUserId },
        { deletes: [actorUserId] },
      ),
    ).resolves.toMatchObject({ deleted: 0 });
    const [actor] = await db.select({ id: appUser.id }).from(appUser).where(and(
      eq(appUser.workspaceId, primaryWorkspaceId),
      eq(appUser.id, actorUserId),
    ));
    expect(actor?.id).toBe(actorUserId);

    const targetUserId = randomUUID();
    await saveUsers(
      { workspaceId: primaryWorkspaceId, actorUserId },
      {
        creates: [{
          id: targetUserId,
          email: `session-target-${runId}@example.invalid`,
          displayName: "Session Target",
          role: "READER",
          status: "active",
          initialPassword: "PublicJarvis2026",
        }],
      },
    );
    await db.insert(userSession).values({
      sessionTokenHash: randomUUID().replaceAll("-", "").repeat(2),
      workspaceId: primaryWorkspaceId,
      userId: targetUserId,
      expiresAt: new Date(Date.now() + 60_000),
    });

    await saveUsers(
      { workspaceId: primaryWorkspaceId, actorUserId },
      { updates: [{ id: targetUserId, patch: { role: "EDITOR" } }] },
    );
    const sessions = await db.select({ hash: userSession.sessionTokenHash }).from(userSession).where(and(
      eq(userSession.workspaceId, primaryWorkspaceId),
      eq(userSession.userId, targetUserId),
    ));
    expect(sessions).toHaveLength(0);
  });

  it("keeps sessions when submitted role and status are unchanged", async () => {
    const targetUserId = randomUUID();
    await saveUsers(
      { workspaceId: primaryWorkspaceId, actorUserId },
      {
        creates: [{
          id: targetUserId,
          email: `unchanged-session-${runId}@example.invalid`,
          displayName: "Unchanged Session Target",
          role: "READER",
          status: "active",
          initialPassword: "PublicJarvis2026",
        }],
      },
    );
    const sessionTokenHash = randomUUID().replaceAll("-", "").repeat(2);
    await db.insert(userSession).values({
      sessionTokenHash,
      workspaceId: primaryWorkspaceId,
      userId: targetUserId,
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(
      saveUsers(
        { workspaceId: primaryWorkspaceId, actorUserId },
        {
          updates: [{
            id: targetUserId,
            patch: {
              displayName: "Unchanged Session Target",
              role: "READER",
              status: "active",
            },
          }],
        },
      ),
    ).resolves.toMatchObject({ updated: 0 });

    const sessions = await db
      .select({ hash: userSession.sessionTokenHash })
      .from(userSession)
      .where(
        and(
          eq(userSession.workspaceId, primaryWorkspaceId),
          eq(userSession.userId, targetUserId),
        ),
      );
    expect(sessions).toEqual([{ hash: sessionTokenHash }]);
  });

  it("rejects self and indirect menu cycles and isolates foreign rows", async () => {
    const selfId = randomUUID();
    await expect(
      saveMenus(
        { workspaceId: primaryWorkspaceId, actorUserId },
        {
          creates: [
            {
              id: selfId,
              parentId: selfId,
              code: "self-menu",
              label: "Self",
              description: null,
              kind: "group",
              icon: null,
              routePath: null,
              sortOrder: 0,
              isVisible: true,
              permissionCodes: [],
            },
          ],
        },
      ),
    ).rejects.toThrow(/cycle/i);

    const rootId = randomUUID();
    const childId = randomUUID();
    await saveMenus(
      { workspaceId: primaryWorkspaceId, actorUserId },
      {
        creates: [
          {
            id: rootId,
            parentId: null,
            code: "root-menu",
            label: "Root",
            description: null,
            kind: "group",
            icon: null,
            routePath: null,
            sortOrder: 0,
            isVisible: true,
            permissionCodes: [],
          },
          {
            id: childId,
            parentId: rootId,
            code: "child-menu",
            label: "Child",
            description: null,
            kind: "group",
            icon: null,
            routePath: null,
            sortOrder: 1,
            isVisible: true,
            permissionCodes: [],
          },
        ],
      },
    );
    await expect(
      saveMenus(
        { workspaceId: primaryWorkspaceId, actorUserId },
        { updates: [{ id: rootId, patch: { parentId: childId } }] },
      ),
    ).rejects.toThrow(/cycle/i);

    await expect(
      saveMenus(
        { workspaceId: primaryWorkspaceId, actorUserId },
        { updates: [{ id: foreignMenuId, patch: { label: "Breached" } }] },
      ),
    ).resolves.toMatchObject({ updated: 0 });
    const listed = await listMenus({ workspaceId: primaryWorkspaceId }, {});
    expect(listed.rows.map(({ id }) => id)).toEqual(expect.arrayContaining([rootId, childId]));
  });

  it("keeps code groups and items inside the request workspace", async () => {
    const groupId = randomUUID();
    const itemId = randomUUID();
    await saveCodeGroups(
      { workspaceId: primaryWorkspaceId, actorUserId },
      {
        creates: [
          {
            id: groupId,
            code: "TEST_GROUP",
            name: "Test Group",
            description: null,
            isActive: true,
          },
        ],
      },
    );
    await saveCodeItems(
      { workspaceId: primaryWorkspaceId, actorUserId },
      {
        creates: [
          {
            id: itemId,
            groupId,
            code: "TEST_ITEM",
            name: "Test Item",
            description: null,
            sortOrder: 1,
            isActive: true,
            metadata: {},
          },
        ],
      },
    );
    const groups = await listCodeGroups({ workspaceId: primaryWorkspaceId }, {});
    expect(groups.rows.find(({ id }) => id === groupId)?.itemCount).toBe(1);
    const items = await listCodeItems({ workspaceId: primaryWorkspaceId }, { groupId });
    expect(items.rows.map(({ id }) => id)).toContain(itemId);

    await expect(
      saveCodeGroups(
        { workspaceId: primaryWorkspaceId, actorUserId },
        { updates: [{ id: foreignCodeGroupId, patch: { name: "Breached" } }] },
      ),
    ).resolves.toMatchObject({ updated: 0 });
    await expect(
      saveCodeItems(
        { workspaceId: primaryWorkspaceId, actorUserId },
        {
          creates: [
            {
              id: randomUUID(),
              groupId: foreignCodeGroupId,
              code: "FOREIGN_ITEM",
              name: "Foreign Item",
              description: null,
              sortOrder: 1,
              isActive: true,
              metadata: {},
            },
          ],
        },
      ),
    ).rejects.toThrow(/outside workspace/i);
  });

  it("keeps the seeded menu rows aligned with shared constants", async () => {
    const [publicWorkspace] = await db
      .select({ id: workspace.id })
      .from(workspace)
      .where(eq(workspace.code, "public-demo"))
      .limit(1);
    const rows = await db
      .select({ code: menuItem.code, routePath: menuItem.routePath, sortOrder: menuItem.sortOrder })
      .from(menuItem)
      .where(eq(menuItem.workspaceId, publicWorkspace.id));
    expect(rows.sort((left, right) => left.sortOrder - right.sortOrder)).toEqual(
      SYSTEM_MENUS.map(({ code, routePath, sortOrder }) => ({ code, routePath, sortOrder })),
    );
    expect(rows.some(({ routePath }) => routePath === "/profile")).toBe(false);
  });

  it("lists sources without ambiguous outer document columns", async () => {
    await db.insert(sourceDocument).values({
      workspaceId: primaryWorkspaceId,
      provider: "synthetic-hr",
      sourceType: "guide",
      externalId: `source-${runId}`,
      title: "Synthetic source",
      canonicalUrl: "https://example.invalid/source",
      metadata: { synthetic: true },
    });

    const result = await listSources({ workspaceId: primaryWorkspaceId }, {});
    expect(result.total).toBe(1);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      provider: "synthetic-hr",
      title: "Synthetic source",
      parseStatus: "pending",
    });
    expect(Date.parse(result.rows[0].retrievedAt)).not.toBeNaN();
  });

  it("does not overwrite source-derived page freshness when closing a review", async () => {
    const path = `manual/review-freshness-${runId}.md`;
    const [page] = await db.insert(wikiPageIndex).values({
      workspaceId: primaryWorkspaceId,
      path,
      title: "Review freshness",
      slug: `review-freshness-${runId}`,
      zone: "manual",
      pageType: "guide",
      frontmatter: { synthetic: true },
      gitSha: "a".repeat(40),
      stale: false,
      publishedStatus: "published",
      snippet: "Synthetic review freshness page",
    }).returning({ id: wikiPageIndex.id });
    const [review] = await db.insert(wikiReviewQueue).values({
      workspaceId: primaryWorkspaceId,
      kind: "citation_validation",
      affectedPages: [path],
      description: "Synthetic freshness review",
      payload: { synthetic: true },
    }).returning({ id: wikiReviewQueue.id });

    await resolveWikiReview(
      { workspaceId: primaryWorkspaceId, actorUserId },
      { reviewId: review.id, status: "dismissed" },
    );

    const [projected] = await db.select({ stale: wikiPageIndex.stale })
      .from(wikiPageIndex)
      .where(and(
        eq(wikiPageIndex.workspaceId, primaryWorkspaceId),
        eq(wikiPageIndex.id, page.id),
      ));
    expect(projected?.stale).toBe(false);
  });
});

afterAll(async () => {
  if (workspaceIds.length > 0) {
    await db.delete(workspace).where(inArray(workspace.id, workspaceIds));
  }
  await migrationPool.end();
});
