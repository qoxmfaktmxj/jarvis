import { z } from "zod";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../constants/pagination.js";

export const projectAccessTypeSchema = z.enum(["db", "ssh", "vpn", "web", "api"]);
export const projectEnvTypeSchema = z.enum(["prod", "dev"]);
export const projectRoleSchema = z.enum(["VIEWER", "DEVELOPER", "MANAGER", "ADMIN"]);
export const projectStatusSchema = z.enum(["active", "deprecated", "decommissioned"]);
export const projectConnectTypeSchema = z.enum(["IP", "VPN", "VDI", "RE"]);

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
  limit: z.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE)
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

// ===========================================================================
// project — main DataGrid (2026-05-12)
// ===========================================================================

/**
 * Row shape returned by list/save for the `/projects` DataGrid.
 *
 * **Intentional subset of `packages/db/schema/project.ts`.** Only the 10
 * columns editable from the grid (companyId/name/status/ownerId/description/
 * prod{Connect,Domain}/dev{Connect,Domain}) are modelled here. The fuller
 * project record — `*RepositoryUrl/*DbDsn/*SrcPath/*ClassPath/*Memo` for prod
 * & dev, `knowledgePageId` — is edited via `/projects/[id]/edit` and
 * `/projects/new` only. `saveProjects` inserts grid creates with those columns
 * left at SQL default / NULL, which is intentional: the grid is for at-a-glance
 * metadata, not full project provisioning.
 */
export const projectRow = z.object({
  id: uuidString,
  companyId: uuidString,
  name: z.string().min(1).max(300),
  status: projectStatusSchema.default("active"),
  ownerId: uuidString.nullable(),
  description: z.string().nullable(),
  prodConnectType: projectConnectTypeSchema.nullable(),
  prodDomainUrl: z.string().max(500).nullable(),
  devConnectType: projectConnectTypeSchema.nullable(),
  devDomainUrl: z.string().max(500).nullable(),
  // audit (output-only timestamps)
  createdAt: z.string().optional(),
  updatedAt: z.string().nullable().optional(),
});

/** Row + join columns (companyName/ownerName) returned by list. */
export const projectListRow = projectRow.extend({
  companyName: z.string().nullable().optional(),
  companyCode: z.string().nullable().optional(),
  ownerName: z.string().nullable().optional(),
});

export const listProjectsInput = z.object({
  q: z.string().trim().optional(),
  status: projectStatusSchema.optional(),
  connectType: projectConnectTypeSchema.optional(),
  hasDev: z.boolean().optional(),
  ...pageInput,
});

export const exportProjectsInput = listProjectsInput.omit({ page: true, limit: true });

export const listProjectsOutput = z.object({
  rows: z.array(projectListRow),
  total: z.number().int().min(0),
});

export const projectCreateInput = projectRow.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const projectUpdateInput = z.object({
  id: uuidString,
  patch: projectRow
    .omit({ id: true, createdAt: true, updatedAt: true })
    .partial(),
});

export const saveProjectsInput = z.object({
  creates: z.array(projectCreateInput).default([]),
  updates: z.array(projectUpdateInput).default([]),
  deletes: z.array(uuidString).default([]),
});

export const saveProjectsOutput = z.object({
  ok: z.boolean(),
  created: z.array(uuidString).optional(),
  updated: z.array(uuidString).optional(),
  deleted: z.array(uuidString).optional(),
  errors: z
    .array(z.object({ id: z.string().optional(), message: z.string() }))
    .optional(),
});

export type ProjectRow = z.infer<typeof projectRow>;
export type ProjectListRow = z.infer<typeof projectListRow>;
export type ListProjectsInput = z.infer<typeof listProjectsInput>;
export type ListProjectsOutput = z.infer<typeof listProjectsOutput>;
export type ExportProjectsInput = z.infer<typeof exportProjectsInput>;
export type ProjectCreateInput = z.infer<typeof projectCreateInput>;
export type ProjectUpdateInput = z.infer<typeof projectUpdateInput>;
export type SaveProjectsInput = z.infer<typeof saveProjectsInput>;
export type SaveProjectsOutput = z.infer<typeof saveProjectsOutput>;
