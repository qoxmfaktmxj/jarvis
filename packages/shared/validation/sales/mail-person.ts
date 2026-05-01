import { z } from "zod";

export const mailPersonRow = z.object({
  id: z.string().uuid(),
  sabun: z.string().min(1).max(20),
  name: z.string().min(1).max(100),
  mailId: z.string().min(1).max(200),
  salesYn: z.boolean(),
  insaYn: z.boolean(),
  memo: z.string().nullable(),
  // 등록일자 (read-only display; server sets defaultNow on insert).
  createdAt: z.string().nullable().optional(),
});

export const listMailPersonsInput = z.object({
  sabun: z.string().optional(),
  name: z.string().optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(200).default(50),
});

export const listMailPersonsOutput = z.object({
  rows: z.array(mailPersonRow),
  total: z.number().int().min(0),
});

export const saveMailPersonsInput = z.object({
  creates: z.array(mailPersonRow).default([]),
  updates: z.array(z.object({ id: z.string().uuid(), patch: mailPersonRow.partial() })).default([]),
  deletes: z.array(z.string().uuid()).default([]),
});

export const saveMailPersonsOutput = z.object({
  ok: z.boolean(),
  created: z.array(z.string().uuid()).optional(),
  updated: z.array(z.string().uuid()).optional(),
  deleted: z.array(z.string().uuid()).optional(),
  errors: z.array(z.object({ id: z.string().optional(), message: z.string() })).optional(),
});

export type MailPersonRow = z.infer<typeof mailPersonRow>;
export type ListMailPersonsInput = z.infer<typeof listMailPersonsInput>;
export type SaveMailPersonsInput = z.infer<typeof saveMailPersonsInput>;
export type SaveMailPersonsOutput = z.infer<typeof saveMailPersonsOutput>;
