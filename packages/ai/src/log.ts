import type { AiLogSink } from "./types.js";

export function createAiLogSink(database: typeof import("@jarvis/db").db): AiLogSink {
  return {
    async logSearch(input) {
      const { searchLog } = await import("@jarvis/db/schema");
      await database.insert(searchLog).values({
        workspaceId: input.workspaceId,
        userId: input.userId,
        query: input.query,
        scope: input.scope,
        resultCount: input.resultCount,
        latencyMs: input.latencyMs,
      });
    },
  };
}
