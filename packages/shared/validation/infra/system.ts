/**
 * packages/shared/validation/infra/system.ts
 *
 * 인프라구성관리 (Plan 5) Zod 스키마.
 * `/infra` Grid 라우트의 list/save/delete/linkRunbook server action에서 사용.
 *
 * 컬럼은 schema/infra-system.ts와 1:1 매핑. workspaceId는 session에서 주입하므로
 * 입력 schema에는 포함하지 않음 (output 전용).
 */
import { z } from "zod";

export const SENSITIVITY_VALUES = [
  "PUBLIC",
  "INTERNAL",
  "RESTRICTED",
  "SECRET_REF_ONLY",
] as const;

export const infraSystemRow = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  systemName: z.string().min(1).max(200),
  envType: z.string().max(30).nullable(),
  domainAddr: z.string().nullable(),
  port: z.number().int().min(0).max(65535).nullable(),
  dbType: z.string().max(30).nullable(),
  dbVersion: z.string().max(30).nullable(),
  osType: z.string().max(50).nullable(),
  osVersion: z.string().max(50).nullable(),
  connectMethod: z.string().max(50).nullable(),
  deployMethod: z.string().max(50).nullable(),
  deployFolder: z.string().nullable(),
  ownerName: z.string().max(100).nullable(),
  ownerContact: z.string().max(100).nullable(),
  wikiPageId: z.string().uuid().nullable(),
  note: z.string().nullable(),
  sensitivity: z.enum(SENSITIVITY_VALUES).default("INTERNAL"),
  // audit (output-only)
  createdAt: z.string().optional(),
  updatedAt: z.string().nullable().optional(),
  createdBy: z.string().uuid().nullable().optional(),
  updatedBy: z.string().uuid().nullable().optional(),
});

/** companyName 등 join 결과 — list 출력에서만 사용. */
export const infraSystemListRow = infraSystemRow.extend({
  companyName: z.string().nullable().optional(),
  wikiPageRouteKey: z.string().nullable().optional(),
  wikiPageTitle: z.string().nullable().optional(),
});

export const listInfraSystemsInput = z.object({
  q: z.string().trim().optional(),
  companyId: z.string().uuid().optional(),
  envType: z.string().trim().optional(),
  dbType: z.string().trim().optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(200).default(50),
});

export const exportInfraSystemsInput = listInfraSystemsInput.omit({
  page: true,
  limit: true,
});

export const listInfraSystemsOutput = z.object({
  rows: z.array(infraSystemListRow),
  total: z.number().int().min(0),
});

export const infraSystemCreateInput = infraSystemRow.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  createdBy: true,
  updatedBy: true,
});

export const infraSystemUpdateInput = z.object({
  id: z.string().uuid(),
  patch: infraSystemRow
    .omit({ id: true, createdAt: true, updatedAt: true, createdBy: true, updatedBy: true })
    .partial(),
});

export const saveInfraSystemsInput = z.object({
  creates: z.array(infraSystemCreateInput).default([]),
  updates: z.array(infraSystemUpdateInput).default([]),
  deletes: z.array(z.string().uuid()).default([]),
});

export const saveInfraSystemsOutput = z.object({
  ok: z.boolean(),
  created: z.array(z.string().uuid()).optional(),
  updated: z.array(z.string().uuid()).optional(),
  deleted: z.array(z.string().uuid()).optional(),
  errors: z
    .array(z.object({ id: z.string().optional(), message: z.string() }))
    .optional(),
});

export const linkRunbookInput = z.object({
  id: z.string().uuid(),
  wikiPageId: z.string().uuid().nullable(),
});

export const linkRunbookOutput = z.object({
  ok: z.boolean(),
  wikiPageId: z.string().uuid().nullable(),
});

export type InfraSystemRow = z.infer<typeof infraSystemRow>;
export type InfraSystemListRow = z.infer<typeof infraSystemListRow>;
export type ListInfraSystemsInput = z.infer<typeof listInfraSystemsInput>;
export type ListInfraSystemsOutput = z.infer<typeof listInfraSystemsOutput>;
export type ExportInfraSystemsInput = z.infer<typeof exportInfraSystemsInput>;
export type InfraSystemCreateInput = z.infer<typeof infraSystemCreateInput>;
export type InfraSystemUpdateInput = z.infer<typeof infraSystemUpdateInput>;
export type SaveInfraSystemsInput = z.infer<typeof saveInfraSystemsInput>;
export type SaveInfraSystemsOutput = z.infer<typeof saveInfraSystemsOutput>;
export type LinkRunbookInput = z.infer<typeof linkRunbookInput>;
export type LinkRunbookOutput = z.infer<typeof linkRunbookOutput>;
