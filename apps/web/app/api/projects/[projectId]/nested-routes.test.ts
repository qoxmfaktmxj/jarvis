import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getSessionMock,
  hasPermissionMock,
  listProjectTasksMock,
  createProjectTaskMock,
  listProjectStaffMock,
  assignProjectStaffMock,
  removeProjectStaffMock,
  listProjectInquiriesMock,
  createProjectInquiryMock,
  updateProjectInquiryStatusMock
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  hasPermissionMock: vi.fn(),
  listProjectTasksMock: vi.fn(),
  createProjectTaskMock: vi.fn(),
  listProjectStaffMock: vi.fn(),
  assignProjectStaffMock: vi.fn(),
  removeProjectStaffMock: vi.fn(),
  listProjectInquiriesMock: vi.fn(),
  createProjectInquiryMock: vi.fn(),
  updateProjectInquiryStatusMock: vi.fn()
}));

vi.mock("@jarvis/auth/session", () => ({
  getSession: getSessionMock
}));

vi.mock("@jarvis/auth/rbac", () => ({
  hasPermission: hasPermissionMock
}));

vi.mock("@/lib/queries/projects", () => ({
  listProjectTasks: listProjectTasksMock,
  createProjectTask: createProjectTaskMock,
  listProjectStaff: listProjectStaffMock,
  assignProjectStaff: assignProjectStaffMock,
  removeProjectStaff: removeProjectStaffMock,
  listProjectInquiries: listProjectInquiriesMock,
  createProjectInquiry: createProjectInquiryMock,
  updateProjectInquiryStatus: updateProjectInquiryStatusMock
}));

import { GET as GETTasks, POST as POSTTasks } from "./tasks/route";
import {
  DELETE as DELETEStaff,
  GET as GETStaff,
  POST as POSTStaff
} from "./staff/route";
import {
  GET as GETInquiries,
  POST as POSTInquiries,
  PUT as PUTInquiries
} from "./inquiries/route";

function buildRequest(url: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
  return new NextRequest(url, {
    ...init,
    headers: {
      cookie: "sessionId=session-1",
      ...init?.headers
    }
  });
}

const params = { params: Promise.resolve({ projectId: "project-1" }) };

describe("project nested API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue({
      id: "session-1",
      userId: "user-1",
      workspaceId: "ws-1",
      roles: ["MANAGER"],
      permissions: ["project:read", "project:update"]
    });
    hasPermissionMock.mockReturnValue(true);
  });

  it("lists project tasks", async () => {
    listProjectTasksMock.mockResolvedValue({
      data: [{ id: "task-1", title: "Kickoff" }],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 }
    });

    const response = await GETTasks(
      buildRequest("http://localhost/api/projects/project-1/tasks"),
      params
    );

    expect(response.status).toBe(200);
    expect(listProjectTasksMock).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      projectId: "project-1",
      page: 1,
      limit: 20,
      status: undefined
    });
  });

  it("rejects invalid task creation", async () => {
    const response = await POSTTasks(
      buildRequest("http://localhost/api/projects/project-1/tasks", {
        method: "POST",
        body: JSON.stringify({ title: "" }),
        headers: {
          "content-type": "application/json"
        }
      }),
      params
    );

    expect(response.status).toBe(400);
  });

  it("lists project staff", async () => {
    listProjectStaffMock.mockResolvedValue([{ id: "staff-1", userName: "Kim" }]);

    const response = await GETStaff(
      buildRequest("http://localhost/api/projects/project-1/staff"),
      params
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: [{ id: "staff-1", userName: "Kim" }]
    });
  });

  it("assigns staff to the project", async () => {
    assignProjectStaffMock.mockResolvedValue({ id: "staff-1" });

    const response = await POSTStaff(
      buildRequest("http://localhost/api/projects/project-1/staff", {
        method: "POST",
        body: JSON.stringify({
          userId: "31b3d111-9e2b-4acd-8dfd-5e71d9a92d2e",
          role: "PM"
        }),
        headers: {
          "content-type": "application/json"
        }
      }),
      params
    );

    expect(response.status).toBe(201);
  });

  it("requires a staff id for deletion", async () => {
    const response = await DELETEStaff(
      buildRequest("http://localhost/api/projects/project-1/staff", {
        method: "DELETE",
        body: JSON.stringify({}),
        headers: {
          "content-type": "application/json"
        }
      }),
      params
    );

    expect(response.status).toBe(400);
  });

  it("lists project inquiries", async () => {
    listProjectInquiriesMock.mockResolvedValue([{ id: "inq-1", title: "Need ETA" }]);

    const response = await GETInquiries(
      buildRequest("http://localhost/api/projects/project-1/inquiries"),
      params
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: [{ id: "inq-1", title: "Need ETA" }]
    });
  });

  it("creates a project inquiry", async () => {
    createProjectInquiryMock.mockResolvedValue({ id: "inq-1" });

    const response = await POSTInquiries(
      buildRequest("http://localhost/api/projects/project-1/inquiries", {
        method: "POST",
        body: JSON.stringify({
          title: "Need ETA",
          priority: "high"
        }),
        headers: {
          "content-type": "application/json"
        }
      }),
      params
    );

    expect(response.status).toBe(201);
  });

  it("rejects invalid inquiry status updates", async () => {
    const response = await PUTInquiries(
      buildRequest("http://localhost/api/projects/project-1/inquiries", {
        method: "PUT",
        body: JSON.stringify({
          id: "inq-1",
          status: "bad-status"
        }),
        headers: {
          "content-type": "application/json"
        }
      }),
      params
    );

    expect(response.status).toBe(400);
  });
});
