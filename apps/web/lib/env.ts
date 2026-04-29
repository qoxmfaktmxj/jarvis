import { z } from "zod";

const booleanFromString = z
  .union([z.boolean(), z.enum(["true", "false", "0", "1"])])
  .transform((value) => value === true || value === "true" || value === "1");

const urlString = z.string().url();

const baseSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: urlString
      .startsWith("postgresql://", {
        message: "DATABASE_URL must be a postgresql:// URL",
      })
      .optional(),
    OPENAI_API_KEY: z.string().min(1),
    NEXT_PUBLIC_APP_URL: urlString,
    WIKI_REPO_ROOT: z.string().min(1),
    WIKI_ROOT: z.string().min(1).optional(),
    ASK_AI_MODEL: z.string().min(1).default("gpt-5.4-mini"),
    LLM_GATEWAY_URL: urlString.optional(),
    LLM_GATEWAY_KEY: z.string().min(1).optional(),
    CLIPROXY_API_KEY: z.string().min(1).optional(),
    FEATURE_SUBSCRIPTION_QUERY: booleanFromString.default(false),
    FEATURE_SUBSCRIPTION_INGEST: booleanFromString.default(false),
    FEATURE_SUBSCRIPTION_LINT: booleanFromString.default(false),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === "production" && !data.DATABASE_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["DATABASE_URL"],
        message: "DATABASE_URL is required in production",
      });
    }
    if (data.NODE_ENV === "production") {
      const gatewayKey = data.LLM_GATEWAY_KEY ?? data.CLIPROXY_API_KEY;
      const SENTINELS = new Set(["sk-jar...-dev", "sk-jarvis-local-dev"]);
      if (!gatewayKey) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["LLM_GATEWAY_KEY"],
          message: "LLM_GATEWAY_KEY or CLIPROXY_API_KEY is required in production",
        });
      } else if (SENTINELS.has(gatewayKey)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["LLM_GATEWAY_KEY"],
          message: "Sentinel/dev placeholder LLM_GATEWAY_KEY is not allowed in production",
        });
      }
    }
  });

export type Env = z.infer<typeof baseSchema>;

export function parseEnv(raw: NodeJS.ProcessEnv | Record<string, unknown>): Env {
  return baseSchema.parse(raw);
}

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  cached = parseEnv(process.env);
  return cached;
}
