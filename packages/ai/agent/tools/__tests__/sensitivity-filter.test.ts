import { describe, it, expect, vi } from "vitest";
import { withSensitivityFilter } from "../sensitivity-filter.js";
import { ok, err, type ToolContext, type ToolDefinition } from "../types.js";

function makeTool(
  impl: (input: { x: number }, ctx: ToolContext) => Promise<unknown>,
): ToolDefinition<{ x: number }, { y: number }> {
  return {
    name: "test_tool",
    description: "dummy",
    parameters: { type: "object" },
    execute: impl as ToolDefinition<{ x: number }, { y: number }>["execute"],
  };
}

const validCtx: ToolContext = {
  workspaceId: "ws-1",
  userId: "u-1",
  permissions: ["wiki:read"],
};

describe("withSensitivityFilter", () => {
  it("forwards input and ctx to inner tool when context is valid", async () => {
    const inner = vi.fn(async () => ok({ y: 42 }));
    const wrapped = withSensitivityFilter(makeTool(inner));
    const r = await wrapped.execute({ x: 7 }, validCtx);
    expect(inner).toHaveBeenCalledWith({ x: 7 }, validCtx);
    expect(r).toEqual({ ok: true, data: { y: 42 } });
  });

  it("preserves tool metadata (name/description/parameters)", () => {
    const wrapped = withSensitivityFilter(makeTool(async () => ok({ y: 1 })));
    expect(wrapped.name).toBe("test_tool");
    expect(wrapped.description).toBe("dummy");
    expect(wrapped.parameters).toEqual({ type: "object" });
  });

  it("blocks calls with missing workspaceId", async () => {
    const inner = vi.fn(async () => ok({ y: 1 }));
    const wrapped = withSensitivityFilter(makeTool(inner));
    const r = await wrapped.execute({ x: 1 }, { ...validCtx, workspaceId: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("forbidden");
    expect(inner).not.toHaveBeenCalled();
  });

  it("blocks calls with missing userId", async () => {
    const inner = vi.fn(async () => ok({ y: 1 }));
    const wrapped = withSensitivityFilter(makeTool(inner));
    const r = await wrapped.execute({ x: 1 }, { ...validCtx, userId: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("forbidden");
    expect(inner).not.toHaveBeenCalled();
  });

  it("blocks when permissions is not an array", async () => {
    const inner = vi.fn(async () => ok({ y: 1 }));
    const wrapped = withSensitivityFilter(makeTool(inner));
    const r = await wrapped.execute({ x: 1 }, {
      ...validCtx,
      permissions: undefined as unknown as readonly string[],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("forbidden");
    expect(inner).not.toHaveBeenCalled();
  });

  it("converts unexpected exceptions from inner tool into err(unknown)", async () => {
    const wrapped = withSensitivityFilter(
      makeTool(async () => {
        throw new Error("boom");
      }),
    );
    const r = await wrapped.execute({ x: 1 }, validCtx);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("unknown");
      expect(r.error).toContain("boom");
    }
  });

  it("passes through error results from inner tool without rewrapping", async () => {
    const inner = vi.fn(async () => err("not_found", "gone"));
    const wrapped = withSensitivityFilter(makeTool(inner));
    const r = await wrapped.execute({ x: 1 }, validCtx);
    expect(r).toEqual({ ok: false, code: "not_found", error: "gone" });
  });
});
