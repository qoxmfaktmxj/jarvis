import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@jarvis/db/client";
import { rawSource } from "@jarvis/db/schema/file";
import { reviewQueue } from "@jarvis/db/schema/review-queue";
import { and, eq } from "drizzle-orm";

// Skip integration tests if no DB is available
const DB_AVAILABLE = !!process.env["DATABASE_URL"] || !!process.env["INTEGRATION_TEST"];

// Unit-level integration: exercises the pii-redactor + DB insertion path that
// ingest.ts uses for SECRET keyword routing.
// Step 2D (2026-05-11): raw_source.sensitivity 컬럼 제거 (D2=B). SECRET 키워드는
// 여전히 ingest 흐름을 정지하고 review_queue 행을 만들지만, sensitivity 분류는
// 더 이상 수행되지 않는다.

import {
  detectSecretKeywords,
} from "../../lib/pii-redactor.js";

describe.skipIf(!DB_AVAILABLE)("PII flow integration (G3)", () => {
  const WORKSPACE_ID = "00000000-0000-0000-0000-000000000777";
  let rawId: string;

  beforeAll(async () => {
    // insert workspace with fixed id for test isolation
    await db.execute(
      /* sql */ `INSERT INTO workspace (id, code, name) VALUES ('${WORKSPACE_ID}', 'pii-test-ws', 'PII Test Workspace') ON CONFLICT DO NOTHING`
    );
    const [row] = await db
      .insert(rawSource)
      .values({
        workspaceId: WORKSPACE_ID,
        sourceType: "file",
        storagePath: "test/pii.txt",
        mimeType: "text/plain",
        ingestStatus: "pending",
        parsedContent: null,
      })
      .returning({ id: rawSource.id });
    rawId = row!.id;
  });

  afterAll(async () => {
    await db
      .delete(reviewQueue)
      .where(eq(reviewQueue.workspaceId, WORKSPACE_ID));
    await db.delete(rawSource).where(eq(rawSource.id, rawId));
  });

  it("SECRET keyword → review_queue row + ingestStatus queued_for_review", async () => {
    const text = "사내 매뉴얼. api_key=ABCDEF. 비밀번호: hunter2";
    const hits = detectSecretKeywords(text);
    expect(hits).toContain("api_key");
    expect(hits).toContain("비밀번호");

    // simulate Step 0 branch
    await db.insert(reviewQueue).values({
      workspaceId: WORKSPACE_ID,
      documentId: rawId,
      documentType: "raw_source",
      reason: "SECRET_KEYWORD",
      matchedKeywords: hits,
      status: "pending",
    });
    await db
      .update(rawSource)
      .set({ ingestStatus: "queued_for_review" })
      .where(eq(rawSource.id, rawId));

    const queued = await db
      .select()
      .from(reviewQueue)
      .where(
        and(
          eq(reviewQueue.workspaceId, WORKSPACE_ID),
          eq(reviewQueue.documentId, rawId),
        ),
      );
    expect(queued).toHaveLength(1);
    expect(queued[0]!.reason).toBe("SECRET_KEYWORD");

    const [updated] = await db
      .select()
      .from(rawSource)
      .where(eq(rawSource.id, rawId));
    expect(updated!.ingestStatus).toBe("queued_for_review");
  });
});
