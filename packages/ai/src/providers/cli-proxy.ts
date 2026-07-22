import { createCliProxyClient, type CliProxyEnv } from "../cli-proxy.js";
import type { LlmProvider } from "../types.js";
import { isToolName } from "../agent/tools/types.js";

export function createCliProxyProvider(
  env: Readonly<CliProxyEnv>,
  options: { fetchImpl?: typeof fetch } = {},
): LlmProvider {
  const client = createCliProxyClient(env, {
    modelEnv: "ASK_AI_MODEL",
    defaultModel: "gpt-5.6-terra",
    fetchImpl: options.fetchImpl,
  });

  return {
    providerName: "cli-proxy",
    model: client.model,
    async next(payload) {
      const completion = await client.complete({
        messages: payload.messages.map((message) => ({
          role: message.role,
          content: message.content,
          ...(message.toolName ? { name: message.toolName } : {}),
          ...(message.toolCall
            ? {
                tool_calls: [{
                  id: message.toolCall.id,
                  type: "function" as const,
                  function: {
                    name: message.toolCall.name,
                    arguments: JSON.stringify(message.toolCall.arguments),
                  },
                }],
              }
            : {}),
          ...(message.toolCallId ? { tool_call_id: message.toolCallId } : {}),
        })),
        tools: payload.tools.map((tool) => ({
          type: "function" as const,
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema,
          },
        })),
      });
      const usage = {
        ...completion.usage,
        costUsd: "0",
      };
      if (completion.toolCall) {
        if (!isToolName(completion.toolCall.name)) {
          throw new Error("CLI_PROXY_TOOL_NAME_INVALID");
        }
        return {
          kind: "tool",
          call: {
            id: completion.toolCall.id,
            name: completion.toolCall.name,
            arguments: parseArguments(completion.toolCall.arguments),
          },
          usage,
        };
      }
      return { kind: "final", text: completion.content, usage };
    },
  };
}

function parseArguments(value: string): Record<string, unknown> {
  const parsed = JSON.parse(value) as unknown;
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : {};
}
