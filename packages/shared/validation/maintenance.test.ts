import { describe, expect, it } from "vitest";
import {
  listMaintenanceInput,
  maintenanceCreateInput,
  maintenanceUpdateInput,
  saveMaintenanceInput,
} from "./maintenance.js";

describe("maintenance validation", () => {
  describe("maintenanceCreateInput", () => {
    it("accepts valid input", () => {
      const result = maintenanceCreateInput.safeParse({
        userId: "11111111-1111-1111-1111-111111111111",
        companyId: "22222222-2222-2222-2222-222222222222",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        contractNumber: "CT-001",
        contractType: "01",
        note: null,
      });
      expect(result.success).toBe(true);
    });

    it("rejects when startDate > endDate", () => {
      const result = maintenanceCreateInput.safeParse({
        userId: "11111111-1111-1111-1111-111111111111",
        companyId: "22222222-2222-2222-2222-222222222222",
        startDate: "2026-12-31",
        endDate: "2026-01-01",
        contractNumber: null,
        contractType: null,
        note: null,
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid date format", () => {
      const result = maintenanceCreateInput.safeParse({
        userId: "11111111-1111-1111-1111-111111111111",
        companyId: "22222222-2222-2222-2222-222222222222",
        startDate: "20260101",
        endDate: "2026-12-31",
        contractNumber: null,
        contractType: null,
        note: null,
      });
      expect(result.success).toBe(false);
    });

    it("rejects non-uuid userId", () => {
      const result = maintenanceCreateInput.safeParse({
        userId: "not-a-uuid",
        companyId: "22222222-2222-2222-2222-222222222222",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        contractNumber: null,
        contractType: null,
        note: null,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("maintenanceUpdateInput", () => {
    it("accepts partial update with id only", () => {
      const result = maintenanceUpdateInput.safeParse({
        id: "33333333-3333-3333-3333-333333333333",
      });
      expect(result.success).toBe(true);
    });

    it("rejects when partial dates invert", () => {
      const result = maintenanceUpdateInput.safeParse({
        id: "33333333-3333-3333-3333-333333333333",
        startDate: "2026-12-31",
        endDate: "2026-01-01",
      });
      expect(result.success).toBe(false);
    });

    it("accepts when only one date is given (no inversion check)", () => {
      const result = maintenanceUpdateInput.safeParse({
        id: "33333333-3333-3333-3333-333333333333",
        startDate: "2026-06-01",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("listMaintenanceInput", () => {
    it("applies defaults for page/limit", () => {
      const result = listMaintenanceInput.parse({});
      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);
    });

    it("rejects limit > 500", () => {
      const result = listMaintenanceInput.safeParse({ limit: 1000 });
      expect(result.success).toBe(false);
    });
  });

  describe("saveMaintenanceInput", () => {
    it("accepts empty arrays as defaults", () => {
      const result = saveMaintenanceInput.parse({});
      expect(result.creates).toEqual([]);
      expect(result.updates).toEqual([]);
      expect(result.deletes).toEqual([]);
    });

    it("rejects non-uuid in deletes", () => {
      const result = saveMaintenanceInput.safeParse({ deletes: ["not-a-uuid"] });
      expect(result.success).toBe(false);
    });
  });
});
