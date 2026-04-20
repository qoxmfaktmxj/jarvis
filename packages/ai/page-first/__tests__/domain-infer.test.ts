import { describe, it, expect } from "vitest";
import { inferDomain } from "../domain-infer.js";

describe("inferDomain", () => {
  it("returns 'policies' for 휴가 keyword", () => {
    expect(inferDomain("빙부상 휴가 며칠이야?")).toBe("policies");
  });

  it("returns 'code' for 프로시저 keyword", () => {
    expect(inferDomain("P_HRI_AFTER_PROC_EXEC 프로시저에 뭐 있어?")).toBe("code");
  });

  it("returns 'procedures' for 신청 keyword", () => {
    expect(inferDomain("회의실 예약 어떻게 신청해?")).toBe("procedures");
  });

  it("returns null for ambiguous question", () => {
    expect(inferDomain("휴가 신청 프로시저 어떻게 만들어?")).toBeNull();
  });

  it("returns null when no keyword", () => {
    expect(inferDomain("안녕")).toBeNull();
  });

  it("detects identifier pattern P_/F_/TB_/V_ as code", () => {
    expect(inferDomain("p_sal_calc 보고 싶어")).toBe("code");
    expect(inferDomain("TB_EMPLOYEE 구조")).toBe("code");
  });
});
