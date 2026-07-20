import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { migrate } from "../migrate.js";
import { seedSystem } from "../seed/system.js";

const connectionString = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("TEST_DATABASE_URL or DATABASE_URL is required");
}

const testPool = new Pool({ connectionString, max: 2 });
const migrationsDir = fileURLToPath(new URL("../../migrations/", import.meta.url));

async function counts() {
  const result = await testPool.query<{
    workspaces: number;
    roles: number;
    permissions: number;
    rolePermissions: number;
    menus: number;
    menuPermissions: number;
    codeGroups: number;
    codeItems: number;
    sourceDocuments: number;
    sourceRevisions: number;
  }>(`SELECT
      (SELECT count(*)::int FROM workspace) AS "workspaces",
      (SELECT count(*)::int FROM role) AS "roles",
      (SELECT count(*)::int FROM permission) AS "permissions",
      (SELECT count(*)::int FROM role_permission) AS "rolePermissions",
      (SELECT count(*)::int FROM menu_item) AS "menus",
      (SELECT count(*)::int FROM menu_permission) AS "menuPermissions",
      (SELECT count(*)::int FROM code_group) AS "codeGroups",
      (SELECT count(*)::int FROM code_item) AS "codeItems",
      (SELECT count(*)::int FROM source_document) AS "sourceDocuments",
      (SELECT count(*)::int FROM source_revision) AS "sourceRevisions"`);
  const row = result.rows[0];
  if (!row) {
    throw new Error("count query returned no row");
  }
  return row;
}

describe("system seed", () => {
  it("is idempotent and does not create source revisions", async () => {
    await migrate(testPool, migrationsDir);
    const before = await counts();
    await seedSystem(testPool);
    const first = await counts();
    await seedSystem(testPool);
    const second = await counts();
    expect(second).toEqual(first);
    expect(first.sourceDocuments).toBe(before.sourceDocuments);
    expect(first.sourceRevisions).toBe(before.sourceRevisions);
    expect({
      workspaces: first.workspaces,
      roles: first.roles,
      permissions: first.permissions,
      rolePermissions: first.rolePermissions,
      menus: first.menus,
      menuPermissions: first.menuPermissions,
      codeGroups: first.codeGroups,
      codeItems: first.codeItems,
    }).toEqual({
      workspaces: 1,
      roles: 3,
      permissions: 11,
      rolePermissions: 20,
      menus: 11,
      menuPermissions: 11,
      codeGroups: 3,
      codeItems: 11,
    });
  });
});

afterAll(async () => {
  await testPool.end();
});
