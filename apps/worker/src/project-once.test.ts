import { beforeEach, describe, expect, it, vi } from "vitest";

const { createRepo, projectCurrentHead } = vi.hoisted(() => ({
  createRepo: vi.fn(async () => {}),
  projectCurrentHead: vi.fn(async () => ({ commitSha: "a".repeat(40), paths: [] })),
}));

vi.mock("./lib/wiki-runtime.js", () => ({
  loadWikiRuntime: vi.fn(async () => ({
    workspaceId: "00000000-0000-4000-8000-000000000001",
    workspaceCode: "public-demo",
    repo: { createRepo },
  })),
}));

vi.mock("./lib/projection.js", () => ({ projectCurrentHead }));
vi.mock("./jobs/ingest/review-queue.js", () => ({
  serializeError: (error: unknown) => ({ message: String(error) }),
}));

import { projectOnce } from "./project-once.js";

describe("projectOnce", () => {
  beforeEach(() => {
    createRepo.mockClear();
    projectCurrentHead.mockClear();
  });

  it("lets the worker initialize the runtime wiki before projection", async () => {
    await projectOnce({});

    expect(createRepo).toHaveBeenCalledWith("main");
    expect(projectCurrentHead).toHaveBeenCalledOnce();
  });
});
