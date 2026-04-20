import { db } from "@jarvis/db/client";
import { holiday } from "@jarvis/db/schema";
import { and, asc, eq, gte, lte } from "drizzle-orm";

type DbLike = typeof db;

export async function listHolidays({
  workspaceId,
  year,
  database = db,
}: {
  workspaceId: string;
  year?: number;
  database?: DbLike;
}) {
  const conds = [eq(holiday.workspaceId, workspaceId)];
  if (year !== undefined) {
    conds.push(gte(holiday.date, `${year}-01-01`));
    conds.push(lte(holiday.date, `${year}-12-31`));
  }
  return database
    .select()
    .from(holiday)
    .where(and(...conds))
    .orderBy(asc(holiday.date));
}

export async function getHoliday({
  workspaceId,
  id,
  database = db,
}: {
  workspaceId: string;
  id: string;
  database?: DbLike;
}) {
  const [row] = await database
    .select()
    .from(holiday)
    .where(and(eq(holiday.id, id), eq(holiday.workspaceId, workspaceId)))
    .limit(1);
  return row ?? null;
}

type HolidayInput = { date: string; name: string; note?: string };

export async function createHoliday({
  workspaceId,
  input,
  database = db,
}: {
  workspaceId: string;
  input: HolidayInput;
  database?: DbLike;
}) {
  const [created] = await database
    .insert(holiday)
    .values({
      workspaceId,
      date: input.date,
      name: input.name,
      note: input.note ?? null,
    })
    .returning();
  if (!created) throw new Error("failed to create holiday");
  return created;
}

export async function updateHoliday({
  workspaceId,
  id,
  patch,
  database = db,
}: {
  workspaceId: string;
  id: string;
  patch: Partial<HolidayInput>;
  database?: DbLike;
}) {
  const values: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.date) values.date = patch.date;
  if (patch.name) values.name = patch.name;
  if (patch.note !== undefined) values.note = patch.note;
  const [updated] = await database
    .update(holiday)
    .set(values)
    .where(and(eq(holiday.id, id), eq(holiday.workspaceId, workspaceId)))
    .returning();
  return updated ?? null;
}

export async function deleteHoliday({
  workspaceId,
  id,
  database = db,
}: {
  workspaceId: string;
  id: string;
  database?: DbLike;
}) {
  const [deleted] = await database
    .delete(holiday)
    .where(and(eq(holiday.id, id), eq(holiday.workspaceId, workspaceId)))
    .returning({ id: holiday.id });
  return deleted ?? null;
}

export async function getHolidaySetForRange({
  workspaceId,
  from,
  to,
  database = db,
}: {
  workspaceId: string;
  from: string;
  to: string;
  database?: DbLike;
}) {
  const rows = await database
    .select({ date: holiday.date })
    .from(holiday)
    .where(
      and(
        eq(holiday.workspaceId, workspaceId),
        gte(holiday.date, from),
        lte(holiday.date, to)
      )
    );
  return new Set(rows.map((r) => r.date));
}
