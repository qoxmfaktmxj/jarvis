import type { LlmProvider, ProviderMessage, ProviderResponse, ToolDefinition } from "../types.js";
import { isToolName } from "../agent/tools/types.js";

export function createOpenAiCompatibleProvider(input: {
  apiKey: string;
  baseUrl: string;
  model: string;
  fetchImpl: typeof fetch;
}): LlmProvider {
  const base = new URL(input.baseUrl.endsWith("/") ? input.baseUrl : `${input.baseUrl}/`);
  if (base.protocol !== "http:" && base.protocol !== "https:") {
    throw new Error("OPENAI_BASE_URL_PROTOCOL_INVALID");
  }
  return {
    providerName: "openai",
    model: input.model,
    async next(payload: {
      messages: ProviderMessage[];
      tools: readonly ToolDefinition[];
    }): Promise<ProviderResponse> {
      const response = await input.fetchImpl(new URL("chat/completions", base), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${input.apiKey}`,
        },
        body: JSON.stringify({
          model: input.model,
          messages: payload.messages.map((message) => ({
            role: message.role,
            content: message.content,
            ...(message.toolName ? { name: message.toolName } : {}),
          })),
          tools: payload.tools.map((tool) => ({
            type: "function",
            function: {
              name: tool.name,
              description: tool.description,
              parameters: tool.inputSchema,
            },
          })),
        }),
      });
      if (!response.ok) {
        throw new Error(`OPENAI_HTTP_${response.status}`);
      }
      const parsed = (await response.json()) as {
        choices?: Array<{
          message?: {
            content?: string | null;
            tool_calls?: Array<{ function?: { name?: string; arguments?: string } }>;
          };
        }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const choice = parsed.choices?.[0];
      if (!choice?.message) {
        throw new Error("OPENAI_RESPONSE_INVALID");
      }
      const usage = {
        promptTokens: parsed.usage?.prompt_tokens ?? 0,
        completionTokens: parsed.usage?.completion_tokens ?? 0,
        costUsd: "0",
      };
      const toolCall = choice.message.tool_calls?.[0];
      if (toolCall) {
        const name = toolCall.function?.name;
        if (!name) throw new Error("OPENAI_TOOL_NAME_MISSING");
        if (!isToolName(name)) throw new Error("OPENAI_TOOL_NAME_INVALID");
        return {
          kind: "tool",
          call: {
            name,
            arguments: parseArguments(toolCall.function?.arguments),
          },
          usage,
        };
      }
      return {
        kind: "final",
        text: choice.message.content ?? "",
        usage,
      };
    },
  };
}

function parseArguments(value: string | undefined): Record<string, unknown> {
  if (!value) return {};
  const parsed = JSON.parse(value) as unknown;
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : {};
}
