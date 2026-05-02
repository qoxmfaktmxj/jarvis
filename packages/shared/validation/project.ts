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

const nullableString = z.string().nullable();
const uuidString = z.string().uuid();
const auditFields = {
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime().nullable(),
  createdBy: uuidString.nullable(),
  updatedBy: uuidString.nullable()
};

const pageInput = {
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(200).default(50)
};

const saveOutputSchema = z.object({
  ok: z.boolean(),
  created: z.number().int().min(0),
  updated: z.number().int().min(0),
  deleted: z.number().int().min(0),
  error: z.string().optional()
});

export const projectBeaconRowSchema = z.object({
  id: uuidString,
  workspaceId: uuidString,
  legacyEnterCd: nullableString,
  legacyBeaconMcd: nullableString,
  legacyBeaconSer: nullableString,
  beaconMcd: nullableString,
  beaconSer: nullableString,
  pjtCd: nullableString,
  pjtNm: nullableString,
  sdate: nullableString,
  edate: nullableString,
  sabun: nullableString,
  outYn: nullableString,
  bigo: nullableString,
  ...auditFields
});

export type ProjectBeaconRow = z.infer<typeof projectBeaconRowSchema>;

export const listProjectBeaconsInput = z.object({
  q: z.string().optional(),
  pjtCd: z.string().optional(),
  sabun: z.string().optional(),
  outYn: z.string().optional(),
  ...pageInput
});

export const listProjectBeaconsOutput = z.object({
  ok: z.boolean(),
  rows: z.array(projectBeaconRowSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  limit: z.number().int().min(1),
  error: z.string().optional()
});

const projectBeaconWriteSchema = projectBeaconRowSchema.omit({
  id: true,
  workspaceId: true,
  createdAt: true,
  updatedAt: true,
  createdBy: true,
  updatedBy: true
}).partial();

export const saveProjectBeaconsInput = z.object({
  creates: z.array(projectBeaconWriteSchema).default([]),
  updates: z.array(projectBeaconWriteSchema.extend({ id: uuidString })).default([]),
  deletes: z.array(uuidString).default([])
});

export const saveProjectBeaconsOutput = saveOutputSchema;

export type ListProjectBeaconsInput = z.infer<typeof listProjectBeaconsInput>;
export type ListProjectBeaconsOutput = z.infer<typeof listProjectBeaconsOutput>;
export type SaveProjectBeaconsInput = z.infer<typeof saveProjectBeaconsInput>;
export type SaveProjectBeaconsOutput = z.infer<typeof saveProjectBeaconsOutput>;

export const projectHistoryRowSchema = z.object({
  id: uuidString,
  workspaceId: uuidString,
  legacyEnterCd: nullableString,
  legacySabun: nullableString,
  legacyOrgCd: nullableString,
  legacyPjtCd: nullableString,
  sabun: nullableString,
  orgCd: nullableString,
  pjtCd: nullableString,
  pjtNm: nullableString,
  custCd: nullableString,
  custNm: nullableString,
  sdate: nullableString,
  edate: nullableString,
  regCd: nullableString,
  regNm: nullableString,
  deReg: nullableString,
  flist: nullableString,
  plist: nullableString,
  roleCd: nullableString,
  roleNm: nullableString,
  module: nullableString,
  workHours: nullableString,
  memo: nullableString,
  etc1: nullableString,
  etc2: nullableString,
  etc3: nullableString,
  etc4: nullableString,
  etc5: nullableString,
  jobCd: nullableString,
  jobNm: nullableString,
  rewardYn: nullableString,
  statusCd: nullableString,
  beaconMcd: nullableString,
  ...auditFields
});

export type ProjectHistoryRow = z.infer<typeof projectHistoryRowSchema>;

export const listProjectHistoryInput = z.object({
  q: z.string().optional(),
  pjtCd: z.string().optional(),
  sabun: z.string().optional(),
  orgCd: z.string().optional(),
  roleCd: z.string().optional(),
  statusCd: z.string().optional(),
  baseSymd: z.string().optional(),
  baseEymd: z.string().optional(),
  ...pageInput
});

export const listProjectHistoryOutput = z.object({
  ok: z.boolean(),
  rows: z.array(projectHistoryRowSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  limit: z.number().int().min(1),
  error: z.string().optional()
});

const projectHistoryWriteSchema = projectHistoryRowSchema.omit({
  id: true,
  workspaceId: true,
  createdAt: true,
  updatedAt: true,
  createdBy: true,
  updatedBy: true
}).partial();

export const saveProjectHistoryInput = z.object({
  creates: z.array(projectHistoryWriteSchema).default([]),
  updates: z.array(projectHistoryWriteSchema.extend({ id: uuidString })).default([]),
  deletes: z.array(uuidString).default([])
});

export const saveProjectHistoryOutput = saveOutputSchema;

export type ListProjectHistoryInput = z.infer<typeof listProjectHistoryInput>;
export type ListProjectHistoryOutput = z.infer<typeof listProjectHistoryOutput>;
export type SaveProjectHistoryInput = z.infer<typeof saveProjectHistoryInput>;
export type SaveProjectHistoryOutput = z.infer<typeof saveProjectHistoryOutput>;

export const projectModuleRowSchema = z.object({
  id: uuidString,
  workspaceId: uuidString,
  legacyEnterCd: nullableString,
  legacySabun: nullableString,
  legacyPjtCd: nullableString,
  legacyModuleCd: nullableString,
  sabun: nullableString,
  pjtCd: nullableString,
  pjtNm: nullableString,
  moduleCd: nullableString,
  moduleNm: nullableString,
  ...auditFields
});

export type ProjectModuleRow = z.infer<typeof projectModuleRowSchema>;

export const listProjectModulesInput = z.object({
  q: z.string().optional(),
  pjtCd: z.string().optional(),
  sabun: z.string().optional(),
  moduleCd: z.string().optional(),
  ...pageInput
});

export const listProjectModulesOutput = z.object({
  ok: z.boolean(),
  rows: z.array(projectModuleRowSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  limit: z.number().int().min(1),
  error: z.string().optional()
});

const projectModuleWriteSchema = projectModuleRowSchema.omit({
  id: true,
  workspaceId: true,
  createdAt: true,
  updatedAt: true,
  createdBy: true,
  updatedBy: true
}).partial();

export const saveProjectModulesInput = z.object({
  creates: z.array(projectModuleWriteSchema).default([]),
  updates: z.array(projectModuleWriteSchema.extend({ id: uuidString })).default([]),
  deletes: z.array(uuidString).default([])
});

export const saveProjectModulesOutput = saveOutputSchema;

export type ListProjectModulesInput = z.infer<typeof listProjectModulesInput>;
export type ListProjectModulesOutput = z.infer<typeof listProjectModulesOutput>;
export type SaveProjectModulesInput = z.infer<typeof saveProjectModulesInput>;
export type SaveProjectModulesOutput = z.infer<typeof saveProjectModulesOutput>;
