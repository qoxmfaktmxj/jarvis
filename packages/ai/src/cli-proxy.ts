export const JARVIS_MODELS = ["gpt-5.6-terra", "gpt-5.6-sol"] as const;

export type JarvisModel = (typeof JARVIS_MODELS)[number];

export interface CliProxyMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

export interface CliProxyTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface CliProxyCompletion {
  content: string;
  toolCall?: { id: string; name: string; arguments: string };
  usage: { promptTokens: number; completionTokens: number };
}

export interface CliProxyClient {
  readonly model: JarvisModel;
  complete(input: {
    messages: readonly CliProxyMessage[];
    tools?: readonly CliProxyTool[];
  }): Promise<CliProxyCompletion>;
}

export interface CliProxyEnv {
  LLM_GATEWAY_URL?: string;
  LLM_GATEWAY_KEY?: string;
  ASK_AI_MODEL?: string;
  INGEST_AI_MODEL?: string;
}

const DEFAULT_GATEWAY_URL = "http://127.0.0.1:8317/v1";
const REQUEST_TIMEOUT_MS = 120_000;

export function createCliProxyClient(
  env: Readonly<CliProxyEnv>,
  options: {
    modelEnv: "ASK_AI_MODEL" | "INGEST_AI_MODEL";
    defaultModel: JarvisModel;
    fetchImpl?: typeof fetch;
  },
): CliProxyClient {
  const accessToken = env.LLM_GATEWAY_KEY?.trim();
  if (!accessToken) throw new Error("LLM_GATEWAY_KEY is required for CLI Proxy");

  const baseUrl = env.LLM_GATEWAY_URL?.trim() || DEFAULT_GATEWAY_URL;
  const base = new URL(baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  if (base.protocol !== "http:" && base.protocol !== "https:") {
    throw new Error("LLM_GATEWAY_URL must use http or https");
  }
  if (!["127.0.0.1", "localhost", "[::1]"].includes(base.hostname)) {
    throw new Error("LLM_GATEWAY_URL must target the local CLI Proxy loopback endpoint");
  }

  const configuredModel = (options.modelEnv === "ASK_AI_MODEL"
    ? env.ASK_AI_MODEL
    : env.INGEST_AI_MODEL)?.trim() || options.defaultModel;
  if (!isJarvisModel(configuredModel)) {
    throw new Error(`${options.modelEnv} must be one of: ${JARVIS_MODELS.join(", ")}`);
  }
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    model: configuredModel,
    async complete(input) {
      const response = await fetchImpl(new URL("chat/completions", base), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          model: configuredModel,
          messages: input.messages,
          ...(input.tools?.length ? { tools: input.tools } : {}),
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new Error(`CLI_PROXY_HTTP_${response.status}`);
      }

      const parsed = (await response.json()) as {
        choices?: Array<{
          message?: {
            content?: string | null;
            tool_calls?: Array<{
              id?: string;
              function?: { name?: string; arguments?: string };
            }>;
          };
        }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const message = parsed.choices?.[0]?.message;
      if (!message) throw new Error("CLI_PROXY_RESPONSE_INVALID");
      const rawToolCall = message.tool_calls?.[0];
      if (message.tool_calls?.length && !rawToolCall?.id) {
        throw new Error("CLI_PROXY_TOOL_ID_MISSING");
      }
      if (message.tool_calls?.length && !rawToolCall?.function?.name) {
        throw new Error("CLI_PROXY_TOOL_NAME_MISSING");
      }

      return {
        content: message.content ?? "",
        ...(rawToolCall?.id && rawToolCall.function?.name
          ? {
              toolCall: {
                id: rawToolCall.id,
                name: rawToolCall.function.name,
                arguments: rawToolCall.function.arguments ?? "{}",
              },
            }
          : {}),
        usage: {
          promptTokens: parsed.usage?.prompt_tokens ?? 0,
          completionTokens: parsed.usage?.completion_tokens ?? 0,
        },
      };
    },
  };
}

function isJarvisModel(value: string): value is JarvisModel {
  return (JARVIS_MODELS as readonly string[]).includes(value);
}
