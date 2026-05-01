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
  // New search filters (Task 6 / P2-A)
  // chargerNm is intentionally absent: the "담당자명" search input writes to custName in the URL.
  // Both names refer to the same column (salesCustomerContact.custName is the contact person's name).
  hpNo: z.string().trim().optional(),
  email: z.string().trim().optional(),
  searchYmdFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  searchYmdTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(200).default(50),
});

/**
 * Input schema for Excel export — same filter fields as listCustomerContactsInput minus page/limit.
 * The export action applies no pagination (full data export).
 */
export const exportCustomerContactsInput = z.object({
  custMcd: z.string().optional(),
  custName: z.string().optional(),
  customerId: z.string().uuid().optional(),
  // chargerNm intentionally absent: UI "담당자명" input maps to custName key.
  hpNo: z.string().trim().optional(),
  email: z.string().trim().optional(),
  searchYmdFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  searchYmdTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
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
export type ExportCustomerContactsInput = z.infer<typeof exportCustomerContactsInput>;
export type SaveCustomerContactsInput = z.infer<typeof saveCustomerContactsInput>;
export type SaveCustomerContactsOutput = z.infer<typeof saveCustomerContactsOutput>;
