import { z } from "zod";

export const getCustomerInput = z.object({ id: z.string().uuid() });
export const customerDetailSchema = z.object({
  id: z.string().uuid(),
  custCd: z.string(),
  custNm: z.string(),
  custKindCd: z.string().nullable(),
  custDivCd: z.string().nullable(),
  ceoNm: z.string().nullable(),
  telNo: z.string().nullable(),
  businessNo: z.string().nullable(),
  homepage: z.string().nullable(),
  addrNo: z.string().nullable(),
  addr1: z.string().nullable(),
  addr2: z.string().nullable(),
});
export const getCustomerOutput = z.object({ customer: customerDetailSchema.nullable() });

export const getContactInput = z.object({ id: z.string().uuid() });
export const contactDetailSchema = z.object({
  id: z.string().uuid(),
  custMcd: z.string(),
  customerId: z.string().uuid().nullable(),
  custNm: z.string().nullable(),  // joined from sales_customer
  custName: z.string().nullable(),
  jikweeNm: z.string().nullable(),
  orgNm: z.string().nullable(),
  hpNo: z.string().nullable(),
  telNo: z.string().nullable(),
  email: z.string().nullable(),
  statusYn: z.boolean().nullable(),
  switComp: z.string().nullable(),
});
export const getContactOutput = z.object({ contact: contactDetailSchema.nullable() });
