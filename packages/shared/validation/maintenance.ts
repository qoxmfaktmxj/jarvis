import { z } from "zod";
import { ISO_DATE } from "./holidays.js";

export const maintenanceAssignmentRowSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  userName: z.string().nullable(),
  companyId: z.string().uuid(),
  companyName: z.string().nullable(),
  startDate: ISO_DATE,
  endDate: ISO_DATE,
  contractNumber: z.string().max(50).nullable(),
  contractType: z.string().max(20).nullable(),
  note: z.string().max(2000).nullable(),
  updatedBy: z.string().max(50).nullable(),
  updatedAt: z.string().datetime(),
  createdAt: z.string().datetime(),
});
export type MaintenanceAssignmentRow = z.infer<typeof maintenanceAssignmentRowSchema>;

const dateRange = z
  .object({ startDate: ISO_DATE, endDate: ISO_DATE })
  .refine((v) => v.startDate <= v.endDate, {
    message: "시작일은 종료일보다 빠르거나 같아야 합니다.",
    path: ["endDate"],
  });

export const maintenanceCreateInput = z
  .object({
    userId: z.string().uuid(),
    companyId: z.string().uuid(),
    startDate: ISO_DATE,
    endDate: ISO_DATE,
    contractNumber: z.string().max(50).nullable(),
    contractType: z.string().max(20).nullable(),
    note: z.string().max(2000).nullable(),
  })
  .and(dateRange);
export type MaintenanceCreateInput = z.infer<typeof maintenanceCreateInput>;

export const maintenanceUpdateInput = z
  .object({
    id: z.string().uuid(),
    userId: z.string().uuid().optional(),
    companyId: z.string().uuid().optional(),
    startDate: ISO_DATE.optional(),
    endDate: ISO_DATE.optional(),
    contractNumber: z.string().max(50).nullable().optional(),
    contractType: z.string().max(20).nullable().optional(),
    note: z.string().max(2000).nullable().optional(),
  })
  .refine(
    (v) => {
      if (v.startDate !== undefined && v.endDate !== undefined) {
        return v.startDate <= v.endDate;
      }
      return true;
    },
    { message: "시작일은 종료일보다 빠르거나 같아야 합니다.", path: ["endDate"] },
  );
export type MaintenanceUpdateInput = z.infer<typeof maintenanceUpdateInput>;

export const listMaintenanceInput = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(500).default(50),
  q: z.string().max(200).optional(),
  userId: z.string().uuid().optional(),
  companyId: z.string().uuid().optional(),
  contractType: z.string().max(20).optional(),
  activeOn: ISO_DATE.optional(),
});
export type ListMaintenanceInput = z.infer<typeof listMaintenanceInput>;

export const listMaintenanceOutput = z.object({
  ok: z.boolean(),
  rows: z.array(maintenanceAssignmentRowSchema),
  total: z.number().int(),
});
export type ListMaintenanceOutput = z.infer<typeof listMaintenanceOutput>;

export const saveMaintenanceInput = z.object({
  creates: z.array(maintenanceCreateInput).default([]),
  updates: z.array(maintenanceUpdateInput).default([]),
  deletes: z.array(z.string().uuid()).default([]),
});
export type SaveMaintenanceInput = z.infer<typeof saveMaintenanceInput>;

export const saveMaintenanceOutput = z.object({
  ok: z.boolean(),
  inserted: z.number().int(),
  updated: z.number().int(),
  deleted: z.number().int(),
  error: z.string().optional(),
});
export type SaveMaintenanceOutput = z.infer<typeof saveMaintenanceOutput>;

export const listAssignmentsByUserInput = z.object({
  userId: z.string().uuid(),
  activeOn: ISO_DATE.optional(),
});
export type ListAssignmentsByUserInput = z.infer<typeof listAssignmentsByUserInput>;
