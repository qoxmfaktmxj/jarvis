/**
 * packages/shared/validation/admin/user.ts
 *
 * 사용자 관리(/admin/users) listUsers + saveUsers Zod 스키마.
 * DB 그라운드 트루스: packages/db/schema/user.ts (user 테이블).
 * 권한 게이트: ADMIN_ALL (server actions에서 검사).
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Scalars
// ---------------------------------------------------------------------------

export const userStatus = z.enum(["active", "inactive", "locked"]);
export type UserStatus = z.infer<typeof userStatus>;

// ---------------------------------------------------------------------------
// Row (output — SELECT 결과와 1:1 매핑)
// name: DB varchar(100) 제약에 맞춤 (plan의 200은 schema와 불일치)
// ---------------------------------------------------------------------------

export const userRow = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  employeeId: z.string().min(1).max(50),
  name: z.string().min(1).max(100),
  email: z.string().email().nullable(),
  phone: z.string().max(50).nullable(),
  orgId: z.string().uuid().nullable(),
  orgName: z.string().nullable(), // organization 조인 결과
  position: z.string().max(100).nullable(),
  jobTitle: z.string().max(50).nullable(),
  status: userStatus,
  isOutsourced: z.boolean(),
  employmentType: z.string(),
  updatedBy: z.string().uuid().nullable(),
  updatedByName: z.string().nullable(), // subquery 조인 결과
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type UserRow = z.infer<typeof userRow>;

// ---------------------------------------------------------------------------
// listUsers
// ---------------------------------------------------------------------------

export const listUsersInput = z.object({
  q: z.string().trim().max(200).optional(),
  status: userStatus.or(z.literal("all")).optional(),
  orgId: z.string().uuid().optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(200).default(50),
});
export type ListUsersInput = z.infer<typeof listUsersInput>;

export const listUsersOutput = z.object({
  ok: z.boolean(),
  rows: z.array(userRow),
  total: z.number(),
});
export type ListUsersOutput = z.infer<typeof listUsersOutput>;

// ---------------------------------------------------------------------------
// saveUsers — creates / updates / deletes
// ---------------------------------------------------------------------------

const createUserPayload = userRow.pick({
  id: true,
  employeeId: true,
  name: true,
  email: true,
  phone: true,
  orgId: true,
  position: true,
  jobTitle: true,
  status: true,
  isOutsourced: true,
});
export type CreateUserPayload = z.infer<typeof createUserPayload>;

const updateUserPayload = createUserPayload
  .partial({
    email: true,
    phone: true,
    orgId: true,
    position: true,
    jobTitle: true,
    status: true,
    isOutsourced: true,
  })
  .extend({
    id: z.string().uuid(),
  });
export type UpdateUserPayload = z.infer<typeof updateUserPayload>;

export const saveUsersInput = z.object({
  creates: z.array(createUserPayload).default([]),
  updates: z.array(updateUserPayload).default([]),
  deletes: z.array(z.string().uuid()).default([]),
});
export type SaveUsersInput = z.infer<typeof saveUsersInput>;

export const saveUsersOutput = z.object({
  ok: z.boolean(),
  inserted: z.number(),
  updated: z.number(),
  deleted: z.number(),
  error: z.string().optional(),
});
export type SaveUsersOutput = z.infer<typeof saveUsersOutput>;
