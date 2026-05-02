import { z } from "zod";

const errorSchema = z.object({ code: z.string(), message: z.string() });

export const salesFreelancerRowSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  legacyEnterCd: z.string().nullable(),
  sabun: z.string(),
  name: z.string().nullable(),
  resNo: z.string().nullable(),
  pjtCd: z.string().nullable(),
  pjtNm: z.string().nullable(),
  sdate: z.string().nullable(),
  edate: z.string().nullable(),
  addr: z.string().nullable(),
  tel: z.string().nullable(),
  mailId: z.string().nullable(),
  belongYm: z.string(),
  businessCd: z.string(),
  totMon: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime().nullable(),
  createdBy: z.string().uuid().nullable(),
  updatedBy: z.string().uuid().nullable(),
});

export type SalesFreelancerRow = z.infer<typeof salesFreelancerRowSchema>;

const freelancerWritable = salesFreelancerRowSchema.omit({
  id: true,
  workspaceId: true,
  createdAt: true,
  updatedAt: true,
  createdBy: true,
  updatedBy: true,
});

export const salesFreelancerCreateSchema = freelancerWritable.pick({
  sabun: true,
  belongYm: true,
  businessCd: true,
}).merge(freelancerWritable.omit({ sabun: true, belongYm: true, businessCd: true }).partial());

export const salesFreelancerUpdateSchema = freelancerWritable.partial().extend({
  id: z.string().uuid(),
});

export const listFreelancersInput = z.object({
  q: z.string().optional(),
  belongYm: z.string().optional(),
  businessCd: z.string().optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(200).default(50),
});

export const listFreelancersOutput = z.object({
  ok: z.boolean(),
  rows: z.array(salesFreelancerRowSchema),
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
  error: z.string().optional(),
});

export const saveFreelancersInput = z.object({
  creates: z.array(salesFreelancerCreateSchema).default([]),
  updates: z.array(salesFreelancerUpdateSchema).default([]),
  deletes: z.array(z.string().uuid()).default([]),
});

export const savePeopleOutput = z.object({
  ok: z.boolean(),
  created: z.number().int(),
  updated: z.number().int(),
  deleted: z.number().int(),
  errors: z.array(errorSchema).optional(),
});

export type SalesFreelancerCreate = z.infer<typeof salesFreelancerCreateSchema>;
export type SalesFreelancerUpdate = z.infer<typeof salesFreelancerUpdateSchema>;
export type ListFreelancersInput = z.infer<typeof listFreelancersInput>;
export type SaveFreelancersInput = z.infer<typeof saveFreelancersInput>;
export type SavePeopleOutput = z.infer<typeof savePeopleOutput>;

export const salesCloudPeopleBaseRowSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  legacyEnterCd: z.string().nullable(),
  contNo: z.string(),
  contYear: z.string(),
  seq: z.number().int(),
  contNm: z.string().nullable(),
  pjtCode: z.string().nullable(),
  pjtNm: z.string().nullable(),
  companyCd: z.string().nullable(),
  companyNm: z.string().nullable(),
  personType: z.string(),
  calcType: z.string(),
  sdate: z.string(),
  edate: z.string().nullable(),
  monthAmt: z.string().nullable(),
  note: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime().nullable(),
  createdBy: z.string().uuid().nullable(),
  updatedBy: z.string().uuid().nullable(),
});

export type SalesCloudPeopleBaseRow = z.infer<typeof salesCloudPeopleBaseRowSchema>;

const cloudBaseWritable = salesCloudPeopleBaseRowSchema.omit({
  id: true,
  workspaceId: true,
  contNm: true,
  pjtNm: true,
  companyNm: true,
  createdAt: true,
  updatedAt: true,
  createdBy: true,
  updatedBy: true,
});

export const salesCloudPeopleBaseCreateSchema = cloudBaseWritable.pick({
  contNo: true,
  contYear: true,
  seq: true,
  personType: true,
  calcType: true,
  sdate: true,
}).merge(
  cloudBaseWritable.omit({
    contNo: true,
    contYear: true,
    seq: true,
    personType: true,
    calcType: true,
    sdate: true,
  }).partial(),
);

export const salesCloudPeopleBaseUpdateSchema = cloudBaseWritable.partial().extend({
  id: z.string().uuid(),
});

export const listCloudPeopleBaseInput = z.object({
  q: z.string().optional(),
  contYear: z.string().optional(),
  pjtCode: z.string().optional(),
  personType: z.string().optional(),
  calcType: z.string().optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(200).default(50),
});

export const listCloudPeopleBaseOutput = z.object({
  ok: z.boolean(),
  rows: z.array(salesCloudPeopleBaseRowSchema),
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
  error: z.string().optional(),
});

export const saveCloudPeopleBaseInput = z.object({
  creates: z.array(salesCloudPeopleBaseCreateSchema).default([]),
  updates: z.array(salesCloudPeopleBaseUpdateSchema).default([]),
  deletes: z.array(z.string().uuid()).default([]),
});

export type SalesCloudPeopleBaseCreate = z.infer<typeof salesCloudPeopleBaseCreateSchema>;
export type SalesCloudPeopleBaseUpdate = z.infer<typeof salesCloudPeopleBaseUpdateSchema>;
export type ListCloudPeopleBaseInput = z.infer<typeof listCloudPeopleBaseInput>;
export type SaveCloudPeopleBaseInput = z.infer<typeof saveCloudPeopleBaseInput>;

export const salesCloudPeopleCalcRowSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  legacyEnterCd: z.string().nullable(),
  contNo: z.string(),
  contYear: z.string(),
  seq: z.number().int(),
  contNm: z.string().nullable(),
  pjtCode: z.string().nullable(),
  pjtNm: z.string().nullable(),
  companyCd: z.string().nullable(),
  companyNm: z.string().nullable(),
  ym: z.string(),
  reflYn: z.string().nullable(),
  personType: z.string(),
  calcType: z.string(),
  monthAmt: z.string().nullable(),
  personCnt: z.number().int().nullable(),
  totalAmt: z.string().nullable(),
  note: z.string().nullable(),
  reflId: z.string().nullable(),
  reflDate: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime().nullable(),
  createdBy: z.string().uuid().nullable(),
  updatedBy: z.string().uuid().nullable(),
});

export type SalesCloudPeopleCalcRow = z.infer<typeof salesCloudPeopleCalcRowSchema>;

const cloudCalcWritable = salesCloudPeopleCalcRowSchema.omit({
  id: true,
  workspaceId: true,
  contNm: true,
  pjtCode: true,
  pjtNm: true,
  companyCd: true,
  companyNm: true,
  monthAmt: true,
  createdAt: true,
  updatedAt: true,
  createdBy: true,
  updatedBy: true,
});

export const salesCloudPeopleCalcCreateSchema = cloudCalcWritable.pick({
  contNo: true,
  contYear: true,
  seq: true,
  personType: true,
  calcType: true,
  ym: true,
}).merge(
  cloudCalcWritable.omit({
    contNo: true,
    contYear: true,
    seq: true,
    personType: true,
    calcType: true,
    ym: true,
  }).partial(),
);

export const salesCloudPeopleCalcUpdateSchema = cloudCalcWritable.partial().extend({
  id: z.string().uuid(),
});

export const listCloudPeopleCalcInput = z.object({
  q: z.string().optional(),
  contYear: z.string().optional(),
  ym: z.string().optional(),
  personType: z.string().optional(),
  calcType: z.string().optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(200).default(50),
});

export const listCloudPeopleCalcOutput = z.object({
  ok: z.boolean(),
  rows: z.array(salesCloudPeopleCalcRowSchema),
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
  error: z.string().optional(),
});

export const saveCloudPeopleCalcInput = z.object({
  creates: z.array(salesCloudPeopleCalcCreateSchema).default([]),
  updates: z.array(salesCloudPeopleCalcUpdateSchema).default([]),
  deletes: z.array(z.string().uuid()).default([]),
});

export type SalesCloudPeopleCalcCreate = z.infer<typeof salesCloudPeopleCalcCreateSchema>;
export type SalesCloudPeopleCalcUpdate = z.infer<typeof salesCloudPeopleCalcUpdateSchema>;
export type ListCloudPeopleCalcInput = z.infer<typeof listCloudPeopleCalcInput>;
export type SaveCloudPeopleCalcInput = z.infer<typeof saveCloudPeopleCalcInput>;

