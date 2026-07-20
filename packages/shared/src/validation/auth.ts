import { z } from "zod";
import { PERMISSIONS, ROLE_CODES, type Permission } from "../constants/permissions.js";

export const ACCOUNT_TYPES = ["human", "demo"] as const;
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 200;

const COMMON_PASSWORDS = new Set(["admin", "password", "1234", "admin1234", "password1234", "qwerty123", "letmein123"]);

export function validatePasswordPolicy(value: string): void {
  const normalized = value.trim().toLowerCase();
  if (value.length < PASSWORD_MIN_LENGTH) {
    throw new Error(`password must be at least ${PASSWORD_MIN_LENGTH} characters`);
  }
  if (value.length > PASSWORD_MAX_LENGTH) {
    throw new Error(`password must be at most ${PASSWORD_MAX_LENGTH} characters`);
  }
  if (!/[a-z]/i.test(value) || !/\d/.test(value)) {
    throw new Error("password must include at least one letter and one number");
  }
  if (COMMON_PASSWORDS.has(normalized)) {
    throw new Error("password must not be a known default");
  }
}

export const passwordSchema = z.string().superRefine((value, ctx) => {
  try {
    validatePasswordPolicy(value);
  } catch (error) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: error instanceof Error ? error.message : "invalid password",
    });
  }
});

export const loginInput = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  currentSessionId: z.string().trim().min(32).nullable().optional(),
});

export const changePasswordInput = z.object({
  currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  newPassword: passwordSchema,
});

export const createDemoSessionInput = z.object({
  ttlMs: z.number().int().positive().max(24 * 60 * 60 * 1000).default(60 * 60 * 1000),
  now: z.date().optional(),
});

export const bootstrapAdminEnvSchema = z.object({
  BOOTSTRAP_ADMIN_EMAIL: z.string().trim().email().max(320),
  BOOTSTRAP_ADMIN_PASSWORD: passwordSchema,
});

const permissionValues = Object.values(PERMISSIONS) as [Permission, ...Permission[]];

export const authSessionSchema = z.object({
  id: z.string().min(32),
  userId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string().min(1),
  roleCode: z.enum(ROLE_CODES),
  permissions: z.array(z.enum(permissionValues)).min(1),
  accountType: z.enum(ACCOUNT_TYPES),
  expiresAt: z.date(),
});
