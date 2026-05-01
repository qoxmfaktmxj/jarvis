import { describe, expect, it } from "vitest";
import { pathnameToTabKey } from "../tab-key";

describe("pathnameToTabKey", () => {
  it("returns pathname unchanged for plain path", () => {
    expect(pathnameToTabKey("/admin/companies")).toBe("/admin/companies");
  });

  it("strips search params", () => {
    expect(pathnameToTabKey("/admin/companies?q=foo&page=2")).toBe("/admin/companies");
  });

  it("strips hash", () => {
    expect(pathnameToTabKey("/knowledge/123#section")).toBe("/knowledge/123");
  });

  it("strips both search and hash", () => {
    expect(pathnameToTabKey("/admin/companies?q=foo#top")).toBe("/admin/companies");
  });

  it("strips trailing slash from non-root", () => {
    expect(pathnameToTabKey("/admin/companies/")).toBe("/admin/companies");
  });

  it("preserves root slash", () => {
    expect(pathnameToTabKey("/")).toBe("/");
  });

  it("preserves dynamic segments", () => {
    expect(pathnameToTabKey("/knowledge/123/edit")).toBe("/knowledge/123/edit");
  });
});
