import { createCliProxyClient } from "@jarvis/ai";
import type { WikiCompletionClient } from "../jobs/ingest/analyze.js";

export function createWorkerWikiModel(
  env: Record<string, string | undefined> = process.env,
  fetchImpl?: typeof fetch,
): WikiCompletionClient {
  const client = createCliProxyClient(env, {
    modelEnv: "INGEST_AI_MODEL",
    defaultModel: "gpt-5.6-sol",
    ...(fetchImpl ? { fetchImpl } : {}),
  });

  return {
    async complete(input) {
      const result = await client.complete({ messages: input.messages });
      if (result.toolCall) {
        throw new Error("CLI Proxy returned an unexpected tool call for Wiki ingest");
      }
      return result.content;
    },
  };
}
