import { z } from "zod";
import { ROLE_CODES } from "../../constants/permissions.js";
import { passwordSchema } from "../auth.js";

const status = z.enum(["active", "disabled"]);
const userCreate = z.object({
  id: z.string().uuid(),
  email: z.string().trim().toLowerCase().email().max(320),
  displayName: z.string().trim().min(1).max(100),
  role: z.enum(ROLE_CODES),
  status,
  initialPassword: passwordSchema,
});
const userPatch = userCreate.omit({ id: true, initialPassword: true }).partial();

export const listUsersInput = z.object({
  q: z.string().trim().max(100).optional(),
  accountType: z.enum(["human", "demo"]).default("human"),
  status: status.optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(200).default(50),
});

export const userRow = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string(),
  role: z.enum(ROLE_CODES),
  accountType: z.enum(["human", "demo"]),
  status,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const listUsersOutput = z.object({
  rows: z.array(userRow),
  total: z.number().int().nonnegative(),
});

export const saveUsersInput = z.object({
  creates: z.array(userCreate).default([]),
  updates: z.array(z.object({ id: z.string().uuid(), patch: userPatch })).default([]),
  deletes: z.array(z.string().uuid()).default([]),
});

export const saveUsersOutput = z.object({
  ok: z.boolean(),
  created: z.number().int(),
  updated: z.number().int(),
  deleted: z.number().int(),
});
