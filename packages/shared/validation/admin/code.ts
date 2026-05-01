/**
 * packages/shared/validation/admin/code.ts
 *
 * 공통코드관리(/admin/codes) 그룹코드 + 세부코드 Zod 스키마.
 * legacy `grpCdMgr.jsp` 마스터/디테일 IBSheet 컬럼과 1:1 매핑.
 *
 * 그라운드 트루스: code_group/code_item Drizzle schema (packages/db/schema/code.ts).
 * 권한 게이트: ADMIN_ALL (server actions에서 부여).
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Common scalars
// ---------------------------------------------------------------------------
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 포맷이어야 합니다");
// 'Y'/'N' 문자열 변환기 (legacy 화면 표기 호환). DB 레벨은 boolean.
const yNString = z.enum(["Y", "N"]);

// ---------------------------------------------------------------------------
// codeGroup row (output)
// ---------------------------------------------------------------------------
export const codeGroupRow = z.object({
  id: z.string().uuid(),
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  nameEn: z.string().max(200).nullable(),
  description: z.string().nullable(),
  businessDivCode: z.string().max(50).nullable(),
  kindCode: z.string().max(10), // 'C' | 'N'
  commonYn: z.boolean(),
  isActive: z.boolean(),
  // joined: 세부코드 갯수 (subCnt)
  subCnt: z.number().int().min(0).default(0),
});

export type CodeGroupRow = z.infer<typeof codeGroupRow>;

// ---------------------------------------------------------------------------
// codeGroup inputs
// ---------------------------------------------------------------------------
export const codeGroupCreateInput = z.object({
  id: z.string().uuid(),
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  nameEn: z.string().max(200).nullable().optional(),
  description: z.string().nullable().optional(),
  businessDivCode: z.string().max(50).nullable().optional(),
  kindCode: z.string().max(10).default("C"),
  commonYn: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

export const codeGroupUpdateInput = z.object({
  id: z.string().uuid(),
  patch: codeGroupCreateInput.partial(),
});

export const saveCodeGroupsInput = z.object({
  creates: z.array(codeGroupCreateInput).default([]),
  updates: z.array(codeGroupUpdateInput).default([]),
  deletes: z.array(z.string().uuid()).default([]),
});

export const saveCodeGroupsOutput = z.object({
  ok: z.boolean(),
  created: z.array(z.string().uuid()).optional(),
  updated: z.array(z.string().uuid()).optional(),
  deleted: z.array(z.string().uuid()).optional(),
  errors: z
    .array(z.object({ id: z.string().optional(), message: z.string() }))
    .optional(),
});

export const listCodeGroupsInput = z.object({
  // q matches code+description (legacy '그룹코드' input).
  q: z.string().optional(),
  // qName matches name (legacy '그룹코드명' input — independent filter).
  qName: z.string().optional(),
  kind: z.enum(["C", "N"]).optional(),
  // legacy '코드설명+세부코드명 포함검색' 토글
  includesDetailCodeNm: z.boolean().optional(),
  businessDivCode: z.string().max(50).optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(500).default(100),
});

export const listCodeGroupsOutput = z.object({
  rows: z.array(codeGroupRow),
  total: z.number().int().min(0),
});

// ---------------------------------------------------------------------------
// codeItem row (output)
// ---------------------------------------------------------------------------
export const codeItemRow = z.object({
  id: z.string().uuid(),
  groupId: z.string().uuid(),
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  nameEn: z.string().max(200).nullable(),
  fullName: z.string().nullable(),
  memo: z.string().nullable(),
  note1: z.string().nullable(),
  note2: z.string().nullable(),
  note3: z.string().nullable(),
  note4: z.string().nullable(),
  note5: z.string().nullable(),
  note6: z.string().nullable(),
  note7: z.string().nullable(),
  note8: z.string().nullable(),
  note9: z.string().nullable(),
  numNote: z.number().int().nullable(),
  sdate: isoDate,
  edate: isoDate,
  visualYn: z.boolean(),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
});

export type CodeItemRow = z.infer<typeof codeItemRow>;

// ---------------------------------------------------------------------------
// codeItem inputs
// ---------------------------------------------------------------------------
export const codeItemCreateInput = z.object({
  id: z.string().uuid(),
  groupId: z.string().uuid(),
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  nameEn: z.string().max(200).nullable().optional(),
  fullName: z.string().nullable().optional(),
  memo: z.string().nullable().optional(),
  note1: z.string().nullable().optional(),
  note2: z.string().nullable().optional(),
  note3: z.string().nullable().optional(),
  note4: z.string().nullable().optional(),
  note5: z.string().nullable().optional(),
  note6: z.string().nullable().optional(),
  note7: z.string().nullable().optional(),
  note8: z.string().nullable().optional(),
  note9: z.string().nullable().optional(),
  numNote: z.number().int().nullable().optional(),
  sdate: isoDate.default("1900-01-01"),
  edate: isoDate.default("2999-12-31"),
  visualYn: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
});

export const codeItemUpdateInput = z.object({
  id: z.string().uuid(),
  patch: codeItemCreateInput.partial(),
});

export const saveCodeItemsInput = z.object({
  creates: z.array(codeItemCreateInput).default([]),
  updates: z.array(codeItemUpdateInput).default([]),
  deletes: z.array(z.string().uuid()).default([]),
});

export const saveCodeItemsOutput = z.object({
  ok: z.boolean(),
  created: z.array(z.string().uuid()).optional(),
  updated: z.array(z.string().uuid()).optional(),
  deleted: z.array(z.string().uuid()).optional(),
  errors: z
    .array(z.object({ id: z.string().optional(), message: z.string() }))
    .optional(),
});

export const listCodeItemsInput = z.object({
  groupId: z.string().uuid(),
  q: z.string().optional(),
  // 'Y' = isActive=true | 'N' = isActive=false | undefined = both
  useYn: yNString.optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(1000).default(500),
});

export const listCodeItemsOutput = z.object({
  rows: z.array(codeItemRow),
  total: z.number().int().min(0),
});

// ---------------------------------------------------------------------------
// Type exports
// ---------------------------------------------------------------------------
export type CodeGroupCreateInput = z.infer<typeof codeGroupCreateInput>;
export type CodeGroupUpdateInput = z.infer<typeof codeGroupUpdateInput>;
export type SaveCodeGroupsInput = z.infer<typeof saveCodeGroupsInput>;
export type SaveCodeGroupsOutput = z.infer<typeof saveCodeGroupsOutput>;
export type ListCodeGroupsInput = z.infer<typeof listCodeGroupsInput>;
export type ListCodeGroupsOutput = z.infer<typeof listCodeGroupsOutput>;

export type CodeItemCreateInput = z.infer<typeof codeItemCreateInput>;
export type CodeItemUpdateInput = z.infer<typeof codeItemUpdateInput>;
export type SaveCodeItemsInput = z.infer<typeof saveCodeItemsInput>;
export type SaveCodeItemsOutput = z.infer<typeof saveCodeItemsOutput>;
export type ListCodeItemsInput = z.infer<typeof listCodeItemsInput>;
export type ListCodeItemsOutput = z.infer<typeof listCodeItemsOutput>;
