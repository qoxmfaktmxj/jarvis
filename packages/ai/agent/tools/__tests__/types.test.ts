import { describe, it, expectTypeOf } from "vitest";
import type {
  ToolContext,
  ToolDefinition,
  ToolResult,
  ToolErrorCode,
} from "../types.js";

describe("agent tool types", () => {
  it("ToolContext carries session info", () => {
    expectTypeOf<ToolContext["workspaceId"]>().toBeString();
    expectTypeOf<ToolContext["userId"]>().toBeString();
    expectTypeOf<ToolContext["permissions"]>().toEqualTypeOf<readonly string[]>();
  });

  it("ToolContext.conversationId is optional", () => {
    expectTypeOf<ToolContext>().toHaveProperty("conversationId");
    type C = ToolContext["conversationId"];
    expectTypeOf<C>().toEqualTypeOf<string | undefined>();
  });

  it("ToolResult success shape", () => {
    type R = Extract<ToolResult<{ hits: number }>, { ok: true }>;
    expectTypeOf<R["data"]>().toEqualTypeOf<{ hits: number }>();
  });

  it("ToolResult error shape carries code", () => {
    type R = Extract<ToolResult<unknown>, { ok: false }>;
    expectTypeOf<R["error"]>().toBeString();
    expectTypeOf<R["code"]>().toEqualTypeOf<ToolErrorCode>();
  });

  it("ToolErrorCode union has required members", () => {
    const codes: ToolErrorCode[] = ["not_found", "forbidden", "invalid", "timeout", "unknown"];
    expectTypeOf<typeof codes[number]>().toEqualTypeOf<ToolErrorCode>();
  });

  it("ToolDefinition.execute returns ToolResult", async () => {
    type Def = ToolDefinition<{ q: string }, { n: number }>;
    expectTypeOf<Def["name"]>().toBeString();
    expectTypeOf<Def["description"]>().toBeString();
    expectTypeOf<Def["parameters"]>().toBeObject();
    expectTypeOf<Def["execute"]>().toBeFunction();
    type ExecReturn = Awaited<ReturnType<Def["execute"]>>;
    expectTypeOf<ExecReturn>().toEqualTypeOf<ToolResult<{ n: number }>>();
  });

  it("exports helper constructors ok()/err()", async () => {
    const mod = await import("../types.js");
    expectTypeOf(mod.ok).toBeFunction();
    expectTypeOf(mod.err).toBeFunction();
  });
});
