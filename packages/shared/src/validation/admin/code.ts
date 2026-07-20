import { z } from "zod";

const codeToken = z.string().regex(/^[A-Z0-9_]{1,50}$/);
const page = {
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(300).default(100),
};

const groupFields = z.object({
  code: codeToken,
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).nullable(),
  isActive: z.boolean(),
});

const itemFields = z.object({
  groupId: z.string().uuid(),
  code: codeToken,
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).nullable(),
  sortOrder: z.number().int().min(0).max(10_000),
  isActive: z.boolean(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

const batch = <T extends z.ZodTypeAny>(create: T, patch: z.ZodTypeAny) => z.object({
  creates: z.array(create).default([]),
  updates: z.array(z.object({ id: z.string().uuid(), patch })).default([]),
  deletes: z.array(z.string().uuid()).default([]),
});

export const listCodeGroupsInput = z.object({
  q: z.string().trim().max(100).optional(),
  ...page,
});

export const listCodeItemsInput = z.object({
  groupId: z.string().uuid(),
  q: z.string().trim().max(100).optional(),
  ...page,
});

export const listCodeGroupsOutput = z.object({
  rows: z.array(z.object({
    id: z.string().uuid(),
    itemCount: z.number().int(),
    ...groupFields.shape,
  })),
  total: z.number().int(),
});

export const listCodeItemsOutput = z.object({
  rows: z.array(z.object({
    id: z.string().uuid(),
    ...itemFields.shape,
  })),
  total: z.number().int(),
});

export const saveCodeGroupsInput = batch(
  z.object({ id: z.string().uuid(), ...groupFields.shape }),
  groupFields.partial(),
);

export const saveCodeItemsInput = batch(
  z.object({ id: z.string().uuid(), ...itemFields.shape }),
  itemFields.partial(),
);

const result = z.object({
  ok: z.boolean(),
  created: z.number().int(),
  updated: z.number().int(),
  deleted: z.number().int(),
});

export const saveCodeGroupsOutput = result;
export const saveCodeItemsOutput = result;
