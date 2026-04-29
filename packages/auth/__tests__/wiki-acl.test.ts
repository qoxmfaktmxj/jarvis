import { describe, it, expect } from "vitest";
import { canViewWikiPage } from "../wiki-acl.js";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";

describe("canViewWikiPage", () => {
  const base = {
    sensitivity: "INTERNAL",
    requiredPermission: null as string | null,
    publishedStatus: "published",
  };

  it("draft 페이지는 ADMIN_ALL이 아니면 차단", () => {
    const draft = { ...base, publishedStatus: "draft" };
    expect(canViewWikiPage(draft, [PERMISSIONS.KNOWLEDGE_READ])).toBe(false);
    expect(canViewWikiPage(draft, [PERMISSIONS.ADMIN_ALL])).toBe(true);
  });

  it("archived 페이지는 ADMIN_ALL이 아니면 차단", () => {
    const archived = { ...base, publishedStatus: "archived" };
    expect(canViewWikiPage(archived, [PERMISSIONS.KNOWLEDGE_READ])).toBe(false);
    expect(canViewWikiPage(archived, [PERMISSIONS.ADMIN_ALL])).toBe(true);
  });

  it("requiredPermission이 있으면 그 권한이 있어야 통과", () => {
    const restricted = {
      ...base,
      requiredPermission: PERMISSIONS.PROJECT_ACCESS_SECRET,
    };
    expect(canViewWikiPage(restricted, [PERMISSIONS.KNOWLEDGE_READ])).toBe(false);
    expect(
      canViewWikiPage(restricted, [
        PERMISSIONS.KNOWLEDGE_READ,
        PERMISSIONS.PROJECT_ACCESS_SECRET,
      ]),
    ).toBe(true);
    expect(canViewWikiPage(restricted, [PERMISSIONS.ADMIN_ALL])).toBe(true);
  });

  it("requiredPermission이 null이면 sensitivity만 본다", () => {
    expect(
      canViewWikiPage({ ...base, sensitivity: "RESTRICTED" }, [
        PERMISSIONS.KNOWLEDGE_READ,
      ]),
    ).toBe(false);
    expect(
      canViewWikiPage({ ...base, sensitivity: "RESTRICTED" }, [
        PERMISSIONS.KNOWLEDGE_READ,
        PERMISSIONS.KNOWLEDGE_REVIEW,
      ]),
    ).toBe(true);
  });

  it("SECRET_REF_ONLY는 PROJECT_ACCESS_SECRET 또는 ADMIN_ALL", () => {
    const secret = { ...base, sensitivity: "SECRET_REF_ONLY" };
    expect(canViewWikiPage(secret, [PERMISSIONS.KNOWLEDGE_READ])).toBe(false);
    expect(
      canViewWikiPage(secret, [
        PERMISSIONS.KNOWLEDGE_READ,
        PERMISSIONS.PROJECT_ACCESS_SECRET,
      ]),
    ).toBe(true);
    expect(canViewWikiPage(secret, [PERMISSIONS.ADMIN_ALL])).toBe(true);
  });

  it("권한 0개 → 전부 차단", () => {
    expect(canViewWikiPage(base, [])).toBe(false);
  });
});
