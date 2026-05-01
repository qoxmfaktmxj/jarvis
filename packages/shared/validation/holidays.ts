import { z } from "zod";

export const ISO_DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "yyyy-mm-dd 형식이어야 합니다.");

export const holidayRowSchema = z.object({
  id: z.string().uuid(),
  date: ISO_DATE,
  name: z.string().min(1).max(100),
  note: z.string().max(1000).nullable(),
});
export type HolidayRow = z.infer<typeof holidayRowSchema>;

export const holidayCreateInput = z.object({
  date: ISO_DATE,
  name: z.string().min(1).max(100),
  note: z.string().max(1000).nullable(),
});

export const holidayUpdateInput = z.object({
  id: z.string().uuid(),
  date: ISO_DATE.optional(),
  name: z.string().min(1).max(100).optional(),
  note: z.string().max(1000).nullable().optional(),
});

export const listHolidaysInput = z.object({
  year: z.number().int().min(1900).max(3000),
});

export const saveHolidaysInput = z.object({
  creates: z.array(holidayCreateInput).default([]),
  updates: z.array(holidayUpdateInput).default([]),
  deletes: z.array(z.string().uuid()).default([]),
});

export const saveHolidaysOutput = z.object({
  ok: z.boolean(),
  created: z.number().int(),
  updated: z.number().int(),
  deleted: z.number().int(),
  errors: z.array(z.object({ code: z.string(), message: z.string(), id: z.string().optional() })),
});

export const holidayRangeQuery = z
  .object({
    from: ISO_DATE,
    to: ISO_DATE,
  })
  .refine((v) => v.from <= v.to, { message: "from <= to 이어야 합니다." })
  .refine(
    (v) => {
      const f = new Date(v.from);
      const t = new Date(v.to);
      return (t.getTime() - f.getTime()) / 86_400_000 <= 92;
    },
    { message: "범위는 92일 이하만 허용됩니다." },
  );

export type HolidayCreateInput = z.infer<typeof holidayCreateInput>;
export type HolidayUpdateInput = z.infer<typeof holidayUpdateInput>;
export type ListHolidaysInput = z.infer<typeof listHolidaysInput>;
export type SaveHolidaysInput = z.infer<typeof saveHolidaysInput>;
export type SaveHolidaysOutput = z.infer<typeof saveHolidaysOutput>;
