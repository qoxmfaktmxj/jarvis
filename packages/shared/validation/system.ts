import { z } from "zod";

export const systemCategorySchema = z.enum([
  "web",
  "db",
  "server",
  "network",
  "middleware"
]);

export const systemEnvironmentSchema = z.enum(["dev", "staging", "prod"]);
export const systemSensitivitySchema = z.enum([
  "PUBLIC",
  "INTERNAL",
  "RESTRICTED",
  "SECRET_REF_ONLY"
]);
export const systemStatusSchema = z.enum([
  "active",
  "deprecated",
  "decommissioned"
]);
export const systemAccessTypeSchema = z.enum(["db", "ssh", "vpn", "web", "api"]);
export const systemRoleSchema = z.enum([
  "VIEWER",
  "DEVELOPER",
  "MANAGER",
  "ADMIN"
]);

export const createSystemSchema = z.object({
  name: z.string().min(1).max(300),
  category: systemCategorySchema.optional().or(z.literal("")),
  environment: systemEnvironmentSchema.optional(),
  description: z.string().max(4000).optional().or(z.literal("")),
  techStack: z.string().max(500).optional().or(z.literal("")),
  repositoryUrl: z.string().url().optional().or(z.literal("")),
  dashboardUrl: z.string().url().optional().or(z.literal("")),
  sensitivity: systemSensitivitySchema.optional(),
  status: systemStatusSchema.optional()
});

export const createSystemAccessSchema = z.object({
  accessType: systemAccessTypeSchema,
  label: z.string().min(1).max(200),
  host: z.string().max(500).optional().or(z.literal("")),
  port: z.coerce.number().int().min(1).max(65535).optional(),
  usernameRef: z.string().max(500).optional().or(z.literal("")),
  passwordRef: z.string().max(500).optional().or(z.literal("")),
  connectionStringRef: z.string().max(500).optional().or(z.literal("")),
  vpnFileRef: z.string().max(500).optional().or(z.literal("")),
  notes: z.string().max(4000).optional().or(z.literal("")),
  requiredRole: systemRoleSchema.optional()
});

export type CreateSystem = z.infer<typeof createSystemSchema>;
export type CreateSystemAccess = z.infer<typeof createSystemAccessSchema>;
