import { describe, it, expect } from "vitest";

import {
  // sales_contract
  salesContractRowSchema,
  listContractsInput,
  saveContractsInput,
  // sales_contract_month
  salesContractMonthRowSchema,
  listContractMonthsInput,
  saveContractMonthsInput,
  // sales_contract_addinfo
  salesContractAddinfoRowSchema,
  saveContractAddinfosInput,
  // sales_contract_service
  salesContractServiceRowSchema,
  listContractServicesInput,
  saveContractServicesInput,
} from "../validation/sales-contract.js";

describe("sales-contract validation", () => {
  describe("sales_contract", () => {
    it("listContractsInput defaults page=1 limit=50", () => {
      const ok = listContractsInput.parse({});
      expect(ok.page).toBe(1);
      expect(ok.limit).toBe(50);
    });

    it("listContractsInput accepts q + customerNo + contGbCd filters", () => {
      const ok = listContractsInput.parse({ q: "test", customerNo: "C001", contGbCd: "001" });
      expect(ok.q).toBe("test");
      expect(ok.customerNo).toBe("C001");
      expect(ok.contGbCd).toBe("001");
    });

    it("listContractsInput rejects limit > 200", () => {
      expect(() => listContractsInput.parse({ limit: 500 })).toThrow();
    });

    it("saveContractsInput accepts empty arrays", () => {
      const ok = saveContractsInput.parse({ creates: [], updates: [], deletes: [] });
      expect(ok.creates).toEqual([]);
      expect(ok.updates).toEqual([]);
      expect(ok.deletes).toEqual([]);
    });

    it("saveContractsInput defaults missing arrays to []", () => {
      const ok = saveContractsInput.parse({});
      expect(ok.creates).toEqual([]);
      expect(ok.updates).toEqual([]);
      expect(ok.deletes).toEqual([]);
    });

    it("rowSchema accepts minimal required fields + nullables", () => {
      const row = {
        id: "00000000-0000-0000-0000-000000000001",
        workspaceId: "00000000-0000-0000-0000-000000000001",
        legacyEnterCd: null,
        legacyContYear: null,
        legacyContNo: null,
        companyType: null,
        companyCd: null,
        companyGrpNm: null,
        companyNm: null,
        companyNo: null,
        customerNo: null,
        customerEmail: null,
        contNm: null,
        custNm: null,
        contGbCd: null,
        contYmd: null,
        contSymd: null,
        contEymd: null,
        mainContType: null,
        newYn: null,
        inOutType: null,
        startAmt: null,
        startAmtRate: null,
        interimAmt1: null,
        interimAmt2: null,
        interimAmt3: null,
        interimAmt4: null,
        interimAmt5: null,
        interimAmtRate1: null,
        interimAmtRate2: null,
        interimAmtRate3: null,
        interimAmtRate4: null,
        interimAmtRate5: null,
        remainAmt: null,
        remainAmtRate: null,
        contImplYn: null,
        contPublYn: null,
        contGrtRate: null,
        advanImplYn: null,
        advanPublYn: null,
        advanGrtRate: null,
        defectImplYn: null,
        defectPublYn: null,
        defectGrtRate: null,
        defectEymd: null,
        inspecConfYmd: null,
        startAmtPlanYmd: null,
        startAmtPublYn: null,
        interimAmtPlanYmd1: null,
        interimAmtPublYn1: null,
        interimAmtPlanYmd2: null,
        interimAmtPublYn2: null,
        interimAmtPlanYmd3: null,
        interimAmtPublYn3: null,
        interimAmtPlanYmd4: null,
        interimAmtPublYn4: null,
        interimAmtPlanYmd5: null,
        interimAmtPublYn5: null,
        remainAmtPlanYmd: null,
        remainAmtPublYn: null,
        befContNo: null,
        contCancelYn: null,
        contInitYn: null,
        fileSeq: null,
        docNo: null,
        companyAddr: null,
        companyOner: null,
        sucProb: null,
        memo: null,
        createdAt: "2026-05-02T10:00:00Z",
        updatedAt: null,
        createdBy: null,
        updatedBy: null,
      };
      const result = salesContractRowSchema.parse(row);
      expect(result.id).toBe("00000000-0000-0000-0000-000000000001");
    });
  });

  describe("sales_contract_month", () => {
    it("listContractMonthsInput defaults page=1 limit=50", () => {
      const ok = listContractMonthsInput.parse({});
      expect(ok.page).toBe(1);
      expect(ok.limit).toBe(50);
    });

    it("listContractMonthsInput accepts contractId and ym filters", () => {
      const ok = listContractMonthsInput.parse({
        contractId: "00000000-0000-0000-0000-000000000001",
        ym: "202604",
      });
      expect(ok.contractId).toBe("00000000-0000-0000-0000-000000000001");
      expect(ok.ym).toBe("202604");
    });

    it("saveContractMonthsInput requires creates with contractId + ym", () => {
      const ok = saveContractMonthsInput.parse({
        creates: [
          {
            contractId: "00000000-0000-0000-0000-000000000001",
            ym: "202604",
          },
        ],
        updates: [],
        deletes: [],
      });
      expect(ok.creates).toHaveLength(1);
      const create = ok.creates[0];
      if (create) {
        expect(create.contractId).toBe("00000000-0000-0000-0000-000000000001");
        expect(create.ym).toBe("202604");
      }
    });

    it("saveContractMonthsInput defaults missing arrays to []", () => {
      const ok = saveContractMonthsInput.parse({});
      expect(ok.creates).toEqual([]);
      expect(ok.updates).toEqual([]);
      expect(ok.deletes).toEqual([]);
    });

    it("rowSchema accepts all numeric fields as nullable strings", () => {
      const row = {
        id: "00000000-0000-0000-0000-000000000001",
        workspaceId: "00000000-0000-0000-0000-000000000001",
        contractId: "00000000-0000-0000-0000-000000000001",
        legacyContYear: null,
        legacyContNo: null,
        legacySeq: null,
        legacyYm: null,
        ym: "202604",
        billTargetYn: null,
        planInManMonth: "100.5",
        planOutManMonth: null,
        planServSaleAmt: "50000",
        planProdSaleAmt: null,
        planInfSaleAmt: null,
        planServInCostAmt: null,
        planServOutCostAmt: null,
        planProdCostAmt: null,
        planInCostAmt: null,
        planOutCostAmt: null,
        planIndirectGrpAmt: null,
        planIndirectComAmt: null,
        planRentAmt: null,
        planSgaAmt: null,
        planExpAmt: null,
        viewInManMonth: null,
        viewOutManMonth: null,
        viewServSaleAmt: null,
        viewProdSaleAmt: null,
        viewInfSaleAmt: null,
        viewServInCostAmt: null,
        viewServOutCostAmt: null,
        viewProdCostAmt: null,
        viewInCostAmt: null,
        viewOutCostAmt: null,
        viewIndirectGrpAmt: null,
        viewIndirectComAmt: null,
        viewRentAmt: null,
        viewSgaAmt: null,
        viewExpAmt: null,
        perfInManMonth: null,
        perfOutManMonth: null,
        perfServSaleAmt: null,
        perfProdSaleAmt: null,
        perfInfSaleAmt: null,
        perfServInCostAmt: null,
        perfServOutCostAmt: null,
        perfProdCostAmt: null,
        perfInCostAmt: null,
        perfOutCostAmt: null,
        perfIndirectGrpAmt: null,
        perfIndirectComAmt: null,
        perfRentAmt: null,
        perfSgaAmt: null,
        perfExpAmt: null,
        taxOrderAmt: null,
        taxServAmt: null,
        rfcEndYn: null,
        note: null,
        createdAt: "2026-05-02T10:00:00Z",
        updatedAt: null,
        createdBy: null,
        updatedBy: null,
      };
      const result = salesContractMonthRowSchema.parse(row);
      expect(result.planInManMonth).toBe("100.5");
    });
  });

  describe("sales_contract_addinfo", () => {
    it("saveContractAddinfosInput requires creates with contractId", () => {
      const ok = saveContractAddinfosInput.parse({
        creates: [
          {
            contractId: "00000000-0000-0000-0000-000000000001",
          },
        ],
        updates: [],
        deletes: [],
      });
      expect(ok.creates).toHaveLength(1);
      const create = ok.creates[0];
      if (create) {
        expect(create.contractId).toBe("00000000-0000-0000-0000-000000000001");
      }
    });

    it("saveContractAddinfosInput defaults missing arrays to []", () => {
      const ok = saveContractAddinfosInput.parse({});
      expect(ok.creates).toEqual([]);
      expect(ok.updates).toEqual([]);
      expect(ok.deletes).toEqual([]);
    });

    it("rowSchema accepts all nullable fields", () => {
      const row = {
        id: "00000000-0000-0000-0000-000000000001",
        workspaceId: "00000000-0000-0000-0000-000000000001",
        contractId: "00000000-0000-0000-0000-000000000001",
        legacyEnterCd: null,
        legacyContNo: null,
        legacySabun: null,
        mailId: "test@example.com",
        createdAt: "2026-05-02T10:00:00Z",
        updatedAt: null,
        createdBy: null,
        updatedBy: null,
      };
      const result = salesContractAddinfoRowSchema.parse(row);
      expect(result.mailId).toBe("test@example.com");
    });
  });

  describe("sales_contract_service", () => {
    it("listContractServicesInput defaults page=1 limit=50", () => {
      const ok = listContractServicesInput.parse({});
      expect(ok.page).toBe(1);
      expect(ok.limit).toBe(50);
    });

    it("listContractServicesInput accepts pjtCd and attendCd filters", () => {
      const ok = listContractServicesInput.parse({
        pjtCd: "P001",
        attendCd: "A001",
      });
      expect(ok.pjtCd).toBe("P001");
      expect(ok.attendCd).toBe("A001");
    });

    it("saveContractServicesInput requires creates with servSabun", () => {
      const ok = saveContractServicesInput.parse({
        creates: [
          {
            servSabun: "12345678901",
          },
        ],
        updates: [],
        deletes: [],
      });
      expect(ok.creates).toHaveLength(1);
      const create = ok.creates[0];
      if (create) {
        expect(create.servSabun).toBe("12345678901");
      }
    });

    it("saveContractServicesInput defaults missing arrays to []", () => {
      const ok = saveContractServicesInput.parse({});
      expect(ok.creates).toEqual([]);
      expect(ok.updates).toEqual([]);
      expect(ok.deletes).toEqual([]);
    });

    it("rowSchema accepts numeric econtAmt as nullable string", () => {
      const row = {
        id: "00000000-0000-0000-0000-000000000001",
        workspaceId: "00000000-0000-0000-0000-000000000001",
        legacyEnterCd: null,
        legacySymd: null,
        legacyServSabun: null,
        servSabun: "12345678901",
        servName: "John Doe",
        birYmd: "19800101",
        symd: "20260101",
        eymd: null,
        cpyGbCd: null,
        cpyName: null,
        econtAmt: "5000000",
        econtCnt: "1",
        job: "Engineer",
        tel: "010-1234-5678",
        mail: "john@example.com",
        addr: "Seoul",
        attendCd: "A001",
        skillCd: "S001",
        cmmncCd: null,
        rsponsCd: null,
        memo1: null,
        memo2: null,
        memo3: null,
        orgCd: null,
        manager: null,
        pjtCd: "P001",
        pjtNm: "Project 1",
        etc1: null,
        etc2: null,
        etc3: null,
        etc4: null,
        etc5: null,
        etc6: null,
        etc7: null,
        etc8: null,
        etc9: null,
        etc10: null,
        createdAt: "2026-05-02T10:00:00Z",
        updatedAt: null,
        createdBy: null,
        updatedBy: null,
      };
      const result = salesContractServiceRowSchema.parse(row);
      expect(result.econtAmt).toBe("5000000");
    });
  });
});
