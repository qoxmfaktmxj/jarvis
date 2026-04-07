import { db } from "@jarvis/db/client";
import { project, projectInquiry, projectStaff, projectTask, user } from "@jarvis/db/schema";
import type {
  AssignProjectStaff,
  CreateProject,
  CreateProjectInquiry,
  CreateTask,
  UpdateProjectInquiryStatus
} from "@jarvis/shared/validation/project";
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray
} from "drizzle-orm";

type ProjectDatabase = typeof db;
type ProjectRow = typeof project.$inferSelect;
type TaskRow = typeof projectTask.$inferSelect;
type StaffRow = typeof projectStaff.$inferSelect;
type InquiryRow = typeof projectInquiry.$inferSelect;

export interface ProjectListItem extends ProjectRow {
  taskCount: number;
  staffCount: number;
}

export interface ProjectListResult {
  data: ProjectListItem[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ProjectDetail extends ProjectRow {
  taskCount: number;
  staffCount: number;
  inquiryCount: number;
}

export interface ProjectTaskItem extends TaskRow {
  assigneeName: string | null;
  assigneeEmployeeId: string | null;
}

export interface ProjectTaskListResult {
  data: ProjectTaskItem[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ProjectStaffItem extends StaffRow {
  userName: string;
  userEmail: string | null;
  employeeId: string;
  position: string | null;
}

export interface ProjectInquiryItem extends InquiryRow {
  authorName: string | null;
  authorEmployeeId: string | null;
}

export interface WorkspaceUserOption {
  id: string;
  name: string;
  employeeId: string;
  email: string | null;
  position: string | null;
}

export interface ListProjectsParams {
  workspaceId: string;
  page?: number;
  limit?: number;
  status?: string;
  q?: string;
  database?: ProjectDatabase;
}

function normalizeOptionalString(value?: string | null) {
  if (value == null || value === "") {
    return null;
  }

  return value;
}

function normalizeOptionalDate(value?: string | null) {
  if (!value) {
    return null;
  }

  return value;
}

function normalizeProjectInput(input: Partial<CreateProject>) {
  const values: Partial<typeof project.$inferInsert> = {};

  if ("code" in input && input.code !== undefined) {
    values.code = input.code;
  }
  if ("name" in input && input.name !== undefined) {
    values.name = input.name;
  }
  if ("description" in input) {
    values.description = normalizeOptionalString(input.description);
  }
  if ("status" in input && input.status !== undefined) {
    values.status = input.status;
  }
  if ("startDate" in input) {
    values.startDate = normalizeOptionalDate(input.startDate);
  }
  if ("endDate" in input) {
    values.endDate = normalizeOptionalDate(input.endDate);
  }

  return values;
}

function normalizeTaskInput(input: CreateTask) {
  return {
    title: input.title,
    content: normalizeOptionalString(input.content),
    status: input.status,
    priority: input.priority,
    dueDate: normalizeOptionalDate(input.dueDate),
    assigneeId: normalizeOptionalString(input.assigneeId)
  };
}

function normalizeStaffInput(input: AssignProjectStaff) {
  return {
    userId: input.userId,
    role: normalizeOptionalString(input.role),
    startDate: normalizeOptionalDate(input.startDate),
    endDate: normalizeOptionalDate(input.endDate)
  };
}

function normalizeInquiryInput(input: CreateProjectInquiry) {
  return {
    title: input.title,
    content: normalizeOptionalString(input.content),
    priority: input.priority
  };
}

async function ensureProjectInWorkspace(
  projectId: string,
  workspaceId: string,
  database: ProjectDatabase = db
) {
  const [row] = await database
    .select({ id: project.id })
    .from(project)
    .where(and(eq(project.id, projectId), eq(project.workspaceId, workspaceId)))
    .limit(1);

  return row ?? null;
}

async function buildProjectCountMaps(
  projectIds: string[],
  database: ProjectDatabase
) {
  if (projectIds.length === 0) {
    return {
      taskCounts: new Map<string, number>(),
      staffCounts: new Map<string, number>(),
      inquiryCounts: new Map<string, number>()
    };
  }

  const [taskRows, staffRows, inquiryRows] = await Promise.all([
    database
      .select({
        projectId: projectTask.projectId,
        total: count()
      })
      .from(projectTask)
      .where(inArray(projectTask.projectId, projectIds))
      .groupBy(projectTask.projectId),
    database
      .select({
        projectId: projectStaff.projectId,
        total: count()
      })
      .from(projectStaff)
      .where(inArray(projectStaff.projectId, projectIds))
      .groupBy(projectStaff.projectId),
    database
      .select({
        projectId: projectInquiry.projectId,
        total: count()
      })
      .from(projectInquiry)
      .where(inArray(projectInquiry.projectId, projectIds))
      .groupBy(projectInquiry.projectId)
  ]);

  return {
    taskCounts: new Map(taskRows.map((row) => [row.projectId, Number(row.total)])),
    staffCounts: new Map(staffRows.map((row) => [row.projectId, Number(row.total)])),
    inquiryCounts: new Map(
      inquiryRows.map((row) => [row.projectId, Number(row.total)])
    )
  };
}

export async function listProjects({
  workspaceId,
  page = 1,
  limit = 20,
  status,
  q,
  database = db
}: ListProjectsParams): Promise<ProjectListResult> {
  const offset = (page - 1) * limit;
  const conditions = [eq(project.workspaceId, workspaceId)];

  if (status) {
    conditions.push(eq(project.status, status));
  }
  if (q) {
    conditions.push(ilike(project.name, `%${q}%`));
  }

  const where = and(...conditions);

  const [rows, totalRows] = await Promise.all([
    database
      .select()
      .from(project)
      .where(where)
      .orderBy(desc(project.createdAt))
      .limit(limit)
      .offset(offset),
    database.select({ total: count() }).from(project).where(where)
  ]);

  const projectIds = rows.map((row) => row.id);
  const { taskCounts, staffCounts } = await buildProjectCountMaps(
    projectIds,
    database
  );
  const total = Number(totalRows[0]?.total ?? 0);

  return {
    data: rows.map((row) => ({
      ...row,
      taskCount: taskCounts.get(row.id) ?? 0,
      staffCount: staffCounts.get(row.id) ?? 0
    })),
    meta: {
      page,
      limit,
      total,
      totalPages: total === 0 ? 1 : Math.ceil(total / limit)
    }
  };
}

export async function createProject({
  workspaceId,
  userId,
  input,
  database = db
}: {
  workspaceId: string;
  userId: string;
  input: CreateProject;
  database?: ProjectDatabase;
}) {
  const [created] = await database
    .insert(project)
    .values({
      workspaceId,
      createdBy: userId,
      code: input.code,
      name: input.name,
      description: normalizeOptionalString(input.description),
      status: input.status,
      startDate: normalizeOptionalDate(input.startDate),
      endDate: normalizeOptionalDate(input.endDate)
    })
    .returning();

  return created;
}

export async function getProjectById({
  workspaceId,
  projectId,
  database = db
}: {
  workspaceId: string;
  projectId: string;
  database?: ProjectDatabase;
}) {
  const [row] = await database
    .select()
    .from(project)
    .where(and(eq(project.id, projectId), eq(project.workspaceId, workspaceId)))
    .limit(1);

  return row ?? null;
}

export async function getProjectDetail({
  workspaceId,
  projectId,
  database = db
}: {
  workspaceId: string;
  projectId: string;
  database?: ProjectDatabase;
}): Promise<ProjectDetail | null> {
  const row = await getProjectById({ workspaceId, projectId, database });
  if (!row) {
    return null;
  }

  const { taskCounts, staffCounts, inquiryCounts } = await buildProjectCountMaps(
    [projectId],
    database
  );

  return {
    ...row,
    taskCount: taskCounts.get(projectId) ?? 0,
    staffCount: staffCounts.get(projectId) ?? 0,
    inquiryCount: inquiryCounts.get(projectId) ?? 0
  };
}

export async function updateProject({
  workspaceId,
  projectId,
  input,
  database = db
}: {
  workspaceId: string;
  projectId: string;
  input: Partial<CreateProject>;
  database?: ProjectDatabase;
}) {
  const [updated] = await database
    .update(project)
    .set({
      ...normalizeProjectInput(input),
      updatedAt: new Date()
    })
    .where(and(eq(project.id, projectId), eq(project.workspaceId, workspaceId)))
    .returning();

  return updated ?? null;
}

export async function archiveProject({
  workspaceId,
  projectId,
  database = db
}: {
  workspaceId: string;
  projectId: string;
  database?: ProjectDatabase;
}) {
  const [updated] = await database
    .update(project)
    .set({
      status: "archived",
      updatedAt: new Date()
    })
    .where(and(eq(project.id, projectId), eq(project.workspaceId, workspaceId)))
    .returning();

  return updated ?? null;
}

export async function listProjectTasks({
  workspaceId,
  projectId,
  page = 1,
  limit = 20,
  status,
  database = db
}: {
  workspaceId: string;
  projectId: string;
  page?: number;
  limit?: number;
  status?: string;
  database?: ProjectDatabase;
}): Promise<ProjectTaskListResult | null> {
  const scopedProject = await ensureProjectInWorkspace(projectId, workspaceId, database);
  if (!scopedProject) {
    return null;
  }

  const offset = (page - 1) * limit;
  const conditions = [
    eq(projectTask.projectId, projectId),
    eq(projectTask.workspaceId, workspaceId)
  ];

  if (status) {
    conditions.push(eq(projectTask.status, status));
  }

  const where = and(...conditions);
  const [rows, totalRows] = await Promise.all([
    database
      .select({
        id: projectTask.id,
        projectId: projectTask.projectId,
        workspaceId: projectTask.workspaceId,
        title: projectTask.title,
        content: projectTask.content,
        status: projectTask.status,
        priority: projectTask.priority,
        dueDate: projectTask.dueDate,
        assigneeId: projectTask.assigneeId,
        createdAt: projectTask.createdAt,
        updatedAt: projectTask.updatedAt,
        assigneeName: user.name,
        assigneeEmployeeId: user.employeeId
      })
      .from(projectTask)
      .leftJoin(user, eq(projectTask.assigneeId, user.id))
      .where(where)
      .orderBy(desc(projectTask.createdAt))
      .limit(limit)
      .offset(offset),
    database.select({ total: count() }).from(projectTask).where(where)
  ]);

  const total = Number(totalRows[0]?.total ?? 0);

  return {
    data: rows,
    meta: {
      page,
      limit,
      total,
      totalPages: total === 0 ? 1 : Math.ceil(total / limit)
    }
  };
}

export async function createProjectTask({
  workspaceId,
  projectId,
  input,
  database = db
}: {
  workspaceId: string;
  projectId: string;
  input: CreateTask;
  database?: ProjectDatabase;
}) {
  const scopedProject = await ensureProjectInWorkspace(projectId, workspaceId, database);
  if (!scopedProject) {
    return null;
  }

  const [created] = await database
    .insert(projectTask)
    .values({
      projectId,
      workspaceId,
      ...normalizeTaskInput(input)
    })
    .returning();

  return created;
}

export async function listWorkspaceUsers({
  workspaceId,
  database = db
}: {
  workspaceId: string;
  database?: ProjectDatabase;
}): Promise<WorkspaceUserOption[]> {
  return database
    .select({
      id: user.id,
      name: user.name,
      employeeId: user.employeeId,
      email: user.email,
      position: user.position
    })
    .from(user)
    .where(and(eq(user.workspaceId, workspaceId), eq(user.isActive, true)))
    .orderBy(asc(user.name));
}

export async function listProjectStaff({
  workspaceId,
  projectId,
  database = db
}: {
  workspaceId: string;
  projectId: string;
  database?: ProjectDatabase;
}): Promise<ProjectStaffItem[] | null> {
  const scopedProject = await ensureProjectInWorkspace(projectId, workspaceId, database);
  if (!scopedProject) {
    return null;
  }

  return database
    .select({
      id: projectStaff.id,
      projectId: projectStaff.projectId,
      workspaceId: projectStaff.workspaceId,
      userId: projectStaff.userId,
      role: projectStaff.role,
      startDate: projectStaff.startDate,
      endDate: projectStaff.endDate,
      createdAt: projectStaff.createdAt,
      updatedAt: projectStaff.updatedAt,
      userName: user.name,
      userEmail: user.email,
      employeeId: user.employeeId,
      position: user.position
    })
    .from(projectStaff)
    .innerJoin(user, eq(projectStaff.userId, user.id))
    .where(
      and(
        eq(projectStaff.projectId, projectId),
        eq(projectStaff.workspaceId, workspaceId)
      )
    )
    .orderBy(asc(user.name));
}

export async function assignProjectStaff({
  workspaceId,
  projectId,
  input,
  database = db
}: {
  workspaceId: string;
  projectId: string;
  input: AssignProjectStaff;
  database?: ProjectDatabase;
}) {
  const [scopedProject, scopedUser] = await Promise.all([
    ensureProjectInWorkspace(projectId, workspaceId, database),
    database
      .select({ id: user.id })
      .from(user)
      .where(and(eq(user.id, input.userId), eq(user.workspaceId, workspaceId)))
      .limit(1)
  ]);

  if (!scopedProject || !scopedUser[0]) {
    return null;
  }

  const [created] = await database
    .insert(projectStaff)
    .values({
      projectId,
      workspaceId,
      ...normalizeStaffInput(input)
    })
    .returning();

  return created;
}

export async function removeProjectStaff({
  workspaceId,
  projectId,
  staffId,
  database = db
}: {
  workspaceId: string;
  projectId: string;
  staffId: string;
  database?: ProjectDatabase;
}) {
  const [deleted] = await database
    .delete(projectStaff)
    .where(
      and(
        eq(projectStaff.id, staffId),
        eq(projectStaff.projectId, projectId),
        eq(projectStaff.workspaceId, workspaceId)
      )
    )
    .returning();

  return deleted ?? null;
}

export async function listProjectInquiries({
  workspaceId,
  projectId,
  database = db
}: {
  workspaceId: string;
  projectId: string;
  database?: ProjectDatabase;
}): Promise<ProjectInquiryItem[] | null> {
  const scopedProject = await ensureProjectInWorkspace(projectId, workspaceId, database);
  if (!scopedProject) {
    return null;
  }

  return database
    .select({
      id: projectInquiry.id,
      workspaceId: projectInquiry.workspaceId,
      projectId: projectInquiry.projectId,
      authorId: projectInquiry.authorId,
      title: projectInquiry.title,
      content: projectInquiry.content,
      priority: projectInquiry.priority,
      status: projectInquiry.status,
      createdAt: projectInquiry.createdAt,
      updatedAt: projectInquiry.updatedAt,
      authorName: user.name,
      authorEmployeeId: user.employeeId
    })
    .from(projectInquiry)
    .leftJoin(user, eq(projectInquiry.authorId, user.id))
    .where(
      and(
        eq(projectInquiry.projectId, projectId),
        eq(projectInquiry.workspaceId, workspaceId)
      )
    )
    .orderBy(desc(projectInquiry.createdAt));
}

export async function createProjectInquiry({
  workspaceId,
  projectId,
  authorId,
  input,
  database = db
}: {
  workspaceId: string;
  projectId: string;
  authorId: string;
  input: CreateProjectInquiry;
  database?: ProjectDatabase;
}) {
  const scopedProject = await ensureProjectInWorkspace(projectId, workspaceId, database);
  if (!scopedProject) {
    return null;
  }

  const [created] = await database
    .insert(projectInquiry)
    .values({
      projectId,
      workspaceId,
      authorId,
      ...normalizeInquiryInput(input)
    })
    .returning();

  return created;
}

export async function updateProjectInquiryStatus({
  workspaceId,
  projectId,
  input,
  database = db
}: {
  workspaceId: string;
  projectId: string;
  input: UpdateProjectInquiryStatus;
  database?: ProjectDatabase;
}) {
  const [updated] = await database
    .update(projectInquiry)
    .set({
      status: input.status,
      updatedAt: new Date()
    })
    .where(
      and(
        eq(projectInquiry.id, input.id),
        eq(projectInquiry.projectId, projectId),
        eq(projectInquiry.workspaceId, workspaceId)
      )
    )
    .returning();

  return updated ?? null;
}
