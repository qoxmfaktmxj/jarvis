import { z } from "zod";

export const createProjectSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(300),
  description: z.string().max(4000).optional().or(z.literal("")),
  status: z.enum(["active", "on-hold", "completed", "archived"]).default("active"),
  startDate: z.string().date().optional().or(z.literal("")),
  endDate: z.string().date().optional().or(z.literal(""))
});

export const createTaskSchema = z.object({
  title: z.string().min(1).max(500),
  content: z.string().max(4000).optional(),
  status: z.enum(["todo", "in-progress", "review", "done"]).default("todo"),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  dueDate: z.string().date().optional().or(z.literal("")),
  assigneeId: z.string().uuid().optional().or(z.literal(""))
});

export type CreateProject = z.infer<typeof createProjectSchema>;
export type CreateTask = z.infer<typeof createTaskSchema>;
