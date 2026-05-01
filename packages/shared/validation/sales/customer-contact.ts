import { z } from "zod";

export const customerContactRow = z.object({
  id: z.string().uuid(),
  custMcd: z.string().min(1).max(50),
  customerId: z.string().uuid().nullable(),
  custName: z.string().nullable(),
  jikweeNm: z.string().nullable(),
  orgNm: z.string().nullable(),
  telNo: z.string().nullable(),
  hpNo: z.string().nullable(),
  email: z.string().nullable(),
  statusYn: z.boolean().nullable(),
  sabun: z.string().nullable(),
  // 고객사명 (read-only display; populated via JOIN salesCustomer.custNm in listCustomerContacts).
  custNm: z.string().nullable().optional(),
  // 등록일자 (read-only display; server sets defaultNow on insert).
  createdAt: z.string().nullable().optional(),
});

export const listCustomerContactsInput = z.object({
  custMcd: z.string().optional(),
  custName: z.string().optional(),
  customerId: z.string().uuid().optional(),
  // 영업담당 검색 — salesCustomerCharger.name via EXISTS subquery (chargerNm col 없음).
  chargerNm: z.string().optional(),
  // 휴대폰 검색 — salesCustomerContact.hpNo 직접 ilike.
  hpNo: z.string().optional(),
  // 이메일 검색 — salesCustomerContact.email 직접 ilike.
  email: z.string().optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(200).default(50),
});

export const listCustomerContactsOutput = z.object({
  rows: z.array(customerContactRow),
  total: z.number().int().min(0),
});

export const saveCustomerContactsInput = z.object({
  creates: z.array(customerContactRow).default([]),
  updates: z.array(z.object({ id: z.string().uuid(), patch: customerContactRow.partial() })).default([]),
  deletes: z.array(z.string().uuid()).default([]),
});

export const saveCustomerContactsOutput = z.object({
  ok: z.boolean(),
  created: z.array(z.string().uuid()).optional(),
  updated: z.array(z.string().uuid()).optional(),
  deleted: z.array(z.string().uuid()).optional(),
  errors: z.array(z.object({ id: z.string().optional(), message: z.string() })).optional(),
});

export type CustomerContactRow = z.infer<typeof customerContactRow>;
export type ListCustomerContactsInput = z.infer<typeof listCustomerContactsInput>;
export type SaveCustomerContactsInput = z.infer<typeof saveCustomerContactsInput>;
export type SaveCustomerContactsOutput = z.infer<typeof saveCustomerContactsOutput>;
