import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cleanWikiTables, prepareDatabase } from "./helpers.js";
import { cleanupDemoAccounts } from "../demo-account-cleanup.js";
import { appUser, db } from "@jarvis/db";

describe("demo account cleanup job", () => {
  let workspaceId = "";

  beforeAll(async () => {
    workspaceId = await prepareDatabase();
  });

  afterAll(async () => {
    await cleanWikiTables(workspaceId);
  });

  it("removes expired demo accounts", async () => {
    const now = new Date("2026-07-20T00:00:00.000Z");
    await db.insert(appUser).values({
      workspaceId,
      email: "expired-demo@example.invalid",
      displayName: "Expired Demo",
      passwordHash: null,
      status: "active",
      accountType: "demo",
      expiresAt: new Date(now.getTime() - 1),
      preferences: {},
      createdAt: now,
      updatedAt: now,
    });
    const removed = await cleanupDemoAccounts(new Date("2026-07-20T00:00:01.000Z"));
    expect(removed).toBeGreaterThanOrEqual(1);
  });
});
