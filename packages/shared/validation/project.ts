import { z } from "zod";

export const projectAccessTypeSchema = z.enum(["db", "ssh", "vpn", "web", "api"]);
export const projectEnvTypeSchema = z.enum(["prod", "dev"]);
export const projectRoleSchema = z.enum(["VIEWER", "DEVELOPER", "MANAGER", "ADMIN"]);

export const createProjectAccessSchema = z.object({
  envType: projectEnvTypeSchema,
  accessType: projectAccessTypeSchema,
  label: z.string().min(1).max(200),
  host: z.string().max(500).optional().or(z.literal("")),
  port: z.coerce.number().int().min(1).max(65535).optional(),
  usernameRef: z.string().max(500).optional().or(z.literal("")),
  passwordRef: z.string().max(500).optional().or(z.literal("")),
  connectionStringRef: z.string().max(500).optional().or(z.literal("")),
  vpnFileRef: z.string().max(500).optional().or(z.literal("")),
  notes: z.string().max(4000).optional().or(z.literal("")),
  requiredRole: projectRoleSchema.optional()
});

export type CreateProjectAccess = z.infer<typeof createProjectAccessSchema>;
