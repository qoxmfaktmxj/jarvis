import { z } from "zod";
import { FIXED_MENU_PERMISSION_CODES, normalizeAllowedRoutePath } from "../../constants/routes.js";

const permissionCode = z.enum(FIXED_MENU_PERMISSION_CODES);

const menuBase = z.object({
  parentId: z.string().uuid().nullable(),
  code: z.string().regex(/^[a-z][a-z0-9-]{1,63}$/),
  label: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).nullable(),
  kind: z.enum(["group", "page"]),
  icon: z.string().trim().max(50).nullable(),
  routePath: z.string().max(300).nullable(),
  sortOrder: z.number().int().min(0).max(10_000),
  isVisible: z.boolean(),
  permissionCodes: z.array(permissionCode).max(FIXED_MENU_PERMISSION_CODES.length),
});

const menuFields = menuBase.superRefine((value, ctx) => {
  if (value.kind === "group" && value.routePath !== null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["routePath"], message: "group route must be null" });
  }
  if (value.kind === "page") {
    if (value.routePath === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["routePath"], message: "page route is required" });
      return;
    }
    try {
      normalizeAllowedRoutePath(value.routePath);
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["routePath"], message: "route is not public" });
    }
  }
});

const menuCreate = z.object({ id: z.string().uuid() }).and(menuFields);

export const listMenusInput = z.object({
  q: z.string().trim().max(100).optional(),
  kind: z.enum(["group", "page"]).optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(300).default(200),
});

export const menuRow = z.object({ id: z.string().uuid() }).and(menuFields);

export const listMenusOutput = z.object({
  rows: z.array(menuRow),
  total: z.number().int().nonnegative(),
});

export const saveMenusInput = z.object({
  creates: z.array(menuCreate).default([]),
  updates: z.array(z.object({ id: z.string().uuid(), patch: menuBase.partial() })).default([]),
  deletes: z.array(z.string().uuid()).default([]),
});

export const saveMenusOutput = z.object({
  ok: z.boolean(),
  created: z.number().int(),
  updated: z.number().int(),
  deleted: z.number().int(),
});
