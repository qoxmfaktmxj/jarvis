import { describe, expect, it } from "vitest";
import { createSseEvent } from "../agent/sse-adapter.js";

describe("createSseEvent", () => {
  it("converts typed AskEvent values to SSE without shape drift", () => {
    expect(createSseEvent({ type: "tool", name: "wiki_search" })).toEqual({
      event: "tool",
      data: "{\"type\":\"tool\",\"name\":\"wiki_search\"}",
    });
  });
});
