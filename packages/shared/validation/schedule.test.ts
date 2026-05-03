import { describe, expect, it } from "vitest";
import {
  listCalendarEventsInput,
  listSchedulesInput,
  saveSchedulesInput,
  scheduleCreateInput,
  scheduleUpdateInput,
} from "./schedule.js";

describe("schedule validation", () => {
  describe("scheduleCreateInput", () => {
    it("accepts valid input", () => {
      const result = scheduleCreateInput.safeParse({
        startDate: "2026-05-04",
        endDate: "2026-05-04",
        title: "회의",
        memo: null,
        orderSeq: 0,
        isShared: false,
      });
      expect(result.success).toBe(true);
    });

    it("rejects when startDate > endDate", () => {
      const result = scheduleCreateInput.safeParse({
        startDate: "2026-05-10",
        endDate: "2026-05-01",
        title: "x",
        memo: null,
      });
      expect(result.success).toBe(false);
    });

    it("rejects empty title", () => {
      const result = scheduleCreateInput.safeParse({
        startDate: "2026-05-04",
        endDate: "2026-05-04",
        title: "",
        memo: null,
      });
      expect(result.success).toBe(false);
    });

    it("rejects title > 200 chars", () => {
      const result = scheduleCreateInput.safeParse({
        startDate: "2026-05-04",
        endDate: "2026-05-04",
        title: "a".repeat(201),
        memo: null,
      });
      expect(result.success).toBe(false);
    });

    it("defaults orderSeq=0 and isShared=false", () => {
      const r = scheduleCreateInput.parse({
        startDate: "2026-05-04",
        endDate: "2026-05-04",
        title: "x",
        memo: null,
      });
      // refined object — access via .safeParse + data
      // intersection (.and) result keeps the original shape
      expect(r.orderSeq).toBe(0);
      expect(r.isShared).toBe(false);
    });
  });

  describe("scheduleUpdateInput", () => {
    it("accepts partial update with id only", () => {
      const r = scheduleUpdateInput.safeParse({ id: "33333333-3333-3333-3333-333333333333" });
      expect(r.success).toBe(true);
    });

    it("rejects when partial dates invert", () => {
      const r = scheduleUpdateInput.safeParse({
        id: "33333333-3333-3333-3333-333333333333",
        startDate: "2026-12-31",
        endDate: "2026-01-01",
      });
      expect(r.success).toBe(false);
    });
  });

  describe("listSchedulesInput", () => {
    it("defaults page=1, limit=50, ownOnly=true", () => {
      const r = listSchedulesInput.parse({});
      expect(r.page).toBe(1);
      expect(r.limit).toBe(50);
      expect(r.ownOnly).toBe(true);
    });

    it("rejects month not in yyyy-mm form", () => {
      const r = listSchedulesInput.safeParse({ month: "2026/05" });
      expect(r.success).toBe(false);
    });
  });

  describe("listCalendarEventsInput", () => {
    it("rejects range > 92 days", () => {
      const r = listCalendarEventsInput.safeParse({
        fromDate: "2026-01-01",
        toDate: "2026-12-31",
      });
      expect(r.success).toBe(false);
    });

    it("accepts 92-day range", () => {
      const r = listCalendarEventsInput.safeParse({
        fromDate: "2026-01-01",
        toDate: "2026-04-02",
      });
      expect(r.success).toBe(true);
    });

    it("rejects fromDate > toDate", () => {
      const r = listCalendarEventsInput.safeParse({
        fromDate: "2026-05-10",
        toDate: "2026-05-01",
      });
      expect(r.success).toBe(false);
    });
  });

  describe("saveSchedulesInput", () => {
    it("defaults to empty arrays", () => {
      const r = saveSchedulesInput.parse({});
      expect(r.creates).toEqual([]);
      expect(r.updates).toEqual([]);
      expect(r.deletes).toEqual([]);
    });

    it("rejects non-uuid in deletes", () => {
      const r = saveSchedulesInput.safeParse({ deletes: ["nope"] });
      expect(r.success).toBe(false);
    });
  });
});
