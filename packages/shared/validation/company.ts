import { z } from "zod";

export const companyRowSchema = z.object({
  id: z.string().uuid(),
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(300),
  groupCode: z.string().max(50).nullable(),
  objectDiv: z.string().min(1).max(10),
  manageDiv: z.string().max(50).nullable(),
  representCompany: z.boolean(),
  category: z.string().max(50).nullable(),
  startDate: z.string().nullable(), // ISO yyyy-MM-dd
  industryCode: z.string().max(50).nullable(),
  zip: z.string().max(10).nullable(),
  address: z.string().nullable(),
  homepage: z.string().max(500).nullable(),
  updatedBy: z.string().max(50).nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const companyCreateInput = companyRowSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const companyUpdateInput = companyRowSchema
  .omit({ createdAt: true, updatedAt: true })
  .partial()
  .extend({
    id: z.string().uuid(),
  });

export const listCompaniesInput = z.object({
  q: z.string().optional(),
  objectDiv: z.string().optional(),
  groupCode: z.string().optional(),
  industryCode: z.string().optional(),
  representCompany: z.boolean().optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(200).default(50),
});

export const saveCompaniesInput = z.object({
  creates: z.array(companyCreateInput).default([]),
  updates: z.array(companyUpdateInput).default([]),
  deletes: z.array(z.string().uuid()).default([]),
});

export const saveCompaniesOutput = z.object({
  ok: z.boolean(),
  created: z.number(),
  updated: z.number(),
  deleted: z.number(),
  errors: z.array(z.object({ code: z.string(), message: z.string() })).default([]),
});

export type CompanyRow = z.infer<typeof companyRowSchema>;
export type CompanyCreateInput = z.infer<typeof companyCreateInput>;
export type CompanyUpdateInput = z.infer<typeof companyUpdateInput>;
export type ListCompaniesInput = z.infer<typeof listCompaniesInput>;
export type SaveCompaniesInput = z.infer<typeof saveCompaniesInput>;
export type SaveCompaniesOutput = z.infer<typeof saveCompaniesOutput>;
