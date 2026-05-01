import { describe, expect, it } from "vitest";
import {
  saveCloudPeopleBaseInput,
  saveCloudPeopleCalcInput,
  saveFreelancersInput,
  salesCloudPeopleBaseRowSchema,
  salesCloudPeopleCalcRowSchema,
  salesFreelancerRowSchema,
} from "../validation/sales-people";

describe("sales people validation", () => {
  it("requires freelancer natural key fields on create", () => {
    const parsed = saveFreelancersInput.parse({
      creates: [{ sabun: "S001", belongYm: "202605", businessCd: "940926" }],
    });
    expect(parsed.creates[0]?.sabun).toBe("S001");
  });

  it("requires cloud base legacy key fields on create", () => {
    const parsed = saveCloudPeopleBaseInput.parse({
      creates: [{
        contNo: "C001",
        contYear: "2026",
        seq: 1,
        personType: "10",
        calcType: "10",
        sdate: "20260501",
      }],
    });
    expect(parsed.creates[0]?.seq).toBe(1);
  });

  it("requires cloud calc monthly key fields on create", () => {
    const parsed = saveCloudPeopleCalcInput.parse({
      creates: [{
        contNo: "C001",
        contYear: "2026",
        seq: 1,
        personType: "10",
        calcType: "10",
        ym: "202605",
      }],
    });
    expect(parsed.creates[0]?.ym).toBe("202605");
  });

  it("serializes numeric database fields with the expected JSON shapes", () => {
    expect(salesFreelancerRowSchema.shape.totMon.safeParse("1000").success).toBe(true);
    expect(salesCloudPeopleBaseRowSchema.shape.monthAmt.safeParse("1000").success).toBe(true);
    expect(salesCloudPeopleCalcRowSchema.shape.personCnt.safeParse(3).success).toBe(true);
    expect(salesCloudPeopleCalcRowSchema.shape.totalAmt.safeParse("3000").success).toBe(true);
  });
});

