import { describe, expect, it } from "vitest";
import {
  buildDocNo,
  documentNumberCreateInput,
  documentNumberUpdateInput,
  listDocumentNumbersInput,
  saveDocumentNumbersInput,
} from "./document-number.js";

describe("document-number validation", () => {
  describe("buildDocNo", () => {
    it("builds HS-{yy}-{seq:03d}", () => {
      expect(buildDocNo("2026", 1)).toBe("HS-26-001");
      expect(buildDocNo("2026", 42)).toBe("HS-26-042");
      expect(buildDocNo("2026", 999)).toBe("HS-26-999");
    });

    it("supports custom prefix", () => {
      expect(buildDocNo("2026", 1, "ABC")).toBe("ABC-26-001");
    });

    it("uses last 2 digits of year", () => {
      expect(buildDocNo("2099", 5)).toBe("HS-99-005");
    });
  });

  describe("documentNumberCreateInput", () => {
    it("accepts valid input", () => {
      const r = documentNumberCreateInput.safeParse({
        year: "2026",
        docName: "계약서",
        userId: "11111111-1111-1111-1111-111111111111",
        docDate: "2026-05-04",
        note: null,
      });
      expect(r.success).toBe(true);
    });

    it("rejects year not 4 digits", () => {
      const r = documentNumberCreateInput.safeParse({
        year: "26",
        docName: "x",
        userId: null,
        docDate: null,
        note: null,
      });
      expect(r.success).toBe(false);
    });

    it("rejects empty docName", () => {
      const r = documentNumberCreateInput.safeParse({
        year: "2026",
        docName: "",
        userId: null,
        docDate: null,
        note: null,
      });
      expect(r.success).toBe(false);
    });

    it("rejects docName > 300 chars", () => {
      const r = documentNumberCreateInput.safeParse({
        year: "2026",
        docName: "a".repeat(301),
        userId: null,
        docDate: null,
        note: null,
      });
      expect(r.success).toBe(false);
    });

    it("accepts null userId/docDate/note", () => {
      const r = documentNumberCreateInput.safeParse({
        year: "2026",
        docName: "x",
        userId: null,
        docDate: null,
        note: null,
      });
      expect(r.success).toBe(true);
    });
  });

  describe("documentNumberUpdateInput", () => {
    it("accepts partial update with id only", () => {
      const r = documentNumberUpdateInput.safeParse({
        id: "33333333-3333-3333-3333-333333333333",
      });
      expect(r.success).toBe(true);
    });

    it("does not allow updating year (immutable after issue)", () => {
      const r = documentNumberUpdateInput.safeParse({
        id: "33333333-3333-3333-3333-333333333333",
        year: "2027",
      });
      // schema strips unknown fields → should still parse but year ignored
      expect(r.success).toBe(true);
      if (r.success) {
        // year not in schema — Zod strips it
        expect((r.data as Record<string, unknown>).year).toBeUndefined();
      }
    });
  });

  describe("listDocumentNumbersInput", () => {
    it("defaults", () => {
      const r = listDocumentNumbersInput.parse({});
      expect(r.page).toBe(1);
      expect(r.limit).toBe(50);
    });

    it("rejects invalid year", () => {
      const r = listDocumentNumbersInput.safeParse({ year: "26" });
      expect(r.success).toBe(false);
    });
  });

  describe("saveDocumentNumbersInput", () => {
    it("defaults to empty arrays", () => {
      const r = saveDocumentNumbersInput.parse({});
      expect(r.creates).toEqual([]);
      expect(r.updates).toEqual([]);
      expect(r.deletes).toEqual([]);
    });
  });
});
