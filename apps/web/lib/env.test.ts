import { describe, it, expect } from "vitest";
import { parseEnv } from "./env";

describe("parseEnv", () => {
  const baseValid = {
    NODE_ENV: "development",
    DATABASE_URL: "postgresql://u:p@localhost:5432/jarvis",
    OPENAI_API_KEY: "sk-test",
    NEXT_PUBLIC_APP_URL: "http://localhost:3010",
    WIKI_REPO_ROOT: "/tmp/jarvis",
  };

  it("accepts a valid dev environment", () => {
    const env = parseEnv(baseValid);
    expect(env.NODE_ENV).toBe("development");
    expect(env.DATABASE_URL).toBe(baseValid.DATABASE_URL);
  });

  it("throws when DATABASE_URL is missing in production", () => {
    const { DATABASE_URL: _omit, ...rest } = baseValid;
    expect(() => parseEnv({ ...rest, NODE_ENV: "production" })).toThrow(/DATABASE_URL/);
  });

  it("allows dev DATABASE_URL absence (non-production)", () => {
    const { DATABASE_URL: _omit, ...rest } = baseValid;
    // In dev, DATABASE_URL is optional — schema does not require it
    const env = parseEnv({ ...rest, NODE_ENV: "development" });
    expect(env.NODE_ENV).toBe("development");
  });

  it("rejects malformed DATABASE_URL", () => {
    expect(() => parseEnv({ ...baseValid, DATABASE_URL: "not-a-url" })).toThrow();
  });

  it("coerces feature flag strings to booleans", () => {
    const env = parseEnv({
      ...baseValid,
      FEATURE_SUBSCRIPTION_QUERY: "true",
      FEATURE_SUBSCRIPTION_INGEST: "false",
    });
    expect(env.FEATURE_SUBSCRIPTION_QUERY).toBe(true);
    expect(env.FEATURE_SUBSCRIPTION_INGEST).toBe(false);
  });
});
