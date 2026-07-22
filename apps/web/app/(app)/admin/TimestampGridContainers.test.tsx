import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuditGridContainer } from "./audit/_components/AuditGridContainer";
import { LlmUsageGridContainer } from "./llm-usage/_components/LlmUsageGridContainer";
import { UsersGridContainer } from "./users/_components/UsersGridContainer";
import { WikiReviewsGridContainer } from "./wiki-reviews/_components/WikiReviewsGridContainer";

vi.mock("./users/actions", () => ({ saveUsersAction: vi.fn() }));
vi.mock("./wiki-reviews/actions", () => ({ resolveWikiReviewAction: vi.fn() }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

const timestamp = "2026-07-22T06:01:02.999Z";
const expectedTimestamp = "2026-07-22 15:01:02";

describe("admin timestamp grid containers", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("React", React);
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("renders each visible admin grid timestamp in KST", async () => {
    await act(async () => root.render(
      <>
        <LlmUsageGridContainer initialRows={[{ id: "usage-1", createdAt: timestamp, route: "/ask", model: "gpt", promptTokens: 1, completionTokens: 2, totalTokens: 3, costUsd: 0 }]} total={1} />
        <AuditGridContainer initialRows={[{ id: "audit-1", createdAt: timestamp, action: "read", resourceType: "wiki", resourceId: null, details: {}, success: true, errorMessage: null, actorEmail: null }]} total={1} />
        <UsersGridContainer initialRows={[{ id: "user-1", email: "user@example.com", displayName: "사용자", status: "active", role: "READER", accountType: "human", createdAt: timestamp, updatedAt: timestamp }]} total={1} currentUserId="admin-1" />
        <WikiReviewsGridContainer initialRows={[{ id: "review-1", kind: "lint", status: "pending", description: "검토", sourceRevisionId: null, affectedPages: [], createdAt: timestamp, updatedAt: timestamp }]} total={1} />
      </>,
    ));

    const cells = [...container.querySelectorAll("tbody td")].map((cell) => cell.textContent);
    expect(cells.filter((text) => text === expectedTimestamp)).toHaveLength(4);
  });
});
