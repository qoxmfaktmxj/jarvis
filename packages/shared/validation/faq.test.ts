import { describe, expect, it } from "vitest";
import {
  faqCreateInput,
  faqUpdateInput,
  listFaqInput,
  saveFaqInput,
} from "./faq.js";

describe("faq validation", () => {
  describe("faqCreateInput", () => {
    it("accepts valid input", () => {
      const r = faqCreateInput.safeParse({
        bizCode: "B01",
        question: "어떻게 신청하나요?",
        answer: "관리자에게 문의하세요.",
        fileSeq: null,
      });
      expect(r.success).toBe(true);
    });

    it("rejects empty question", () => {
      const r = faqCreateInput.safeParse({
        bizCode: null,
        question: "",
        answer: "x",
        fileSeq: null,
      });
      expect(r.success).toBe(false);
    });

    it("rejects empty answer", () => {
      const r = faqCreateInput.safeParse({
        bizCode: null,
        question: "x",
        answer: "",
        fileSeq: null,
      });
      expect(r.success).toBe(false);
    });

    it("rejects question > 500 chars", () => {
      const r = faqCreateInput.safeParse({
        bizCode: null,
        question: "a".repeat(501),
        answer: "x",
        fileSeq: null,
      });
      expect(r.success).toBe(false);
    });

    it("accepts null bizCode/fileSeq", () => {
      const r = faqCreateInput.safeParse({
        bizCode: null,
        question: "q",
        answer: "a",
        fileSeq: null,
      });
      expect(r.success).toBe(true);
    });
  });

  describe("faqUpdateInput", () => {
    it("accepts partial update", () => {
      const r = faqUpdateInput.safeParse({
        id: "11111111-1111-1111-1111-111111111111",
        question: "updated",
      });
      expect(r.success).toBe(true);
    });
  });

  describe("listFaqInput", () => {
    it("defaults", () => {
      const r = listFaqInput.parse({});
      expect(r.page).toBe(1);
      expect(r.limit).toBe(50);
    });
  });

  describe("saveFaqInput", () => {
    it("defaults to empty arrays", () => {
      const r = saveFaqInput.parse({});
      expect(r.creates).toEqual([]);
      expect(r.updates).toEqual([]);
      expect(r.deletes).toEqual([]);
    });
  });
});
