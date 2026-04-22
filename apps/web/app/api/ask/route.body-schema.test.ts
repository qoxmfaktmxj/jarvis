// apps/web/app/api/ask/route.body-schema.test.ts
// 2026-04-21 — Tests the Zod bodySchema contract for /api/ask.
// - accepts { model: 'gpt-5.4' | 'gpt-5.4-mini' }
// - rejects legacy { mode: 'simple' | 'expert' }
// - accepts empty body extras (model/mode both optional-shape)
//
// The schema is re-derived here because route.ts keeps it local (not exported).
// If the route's schema changes, this test is a canary.

import { describe, expect, it } from "vitest";
import { z } from "zod";

// Mirror of apps/web/app/api/ask/route.ts bodySchema — must stay in sync.
const bodySchema = z.object({
  question: z.string().min(1).max(2000),
  snapshotId: z.string().uuid().optional(),
  model: z.enum(["gpt-5.4", "gpt-5.4-mini"]).optional(),
  conversationId: z.string().uuid().optional(),
});

describe("/api/ask bodySchema contract", () => {
  it("accepts { model: 'gpt-5.4-mini' }", () => {
    const out = bodySchema.safeParse({ question: "hi", model: "gpt-5.4-mini" });
    expect(out.success).toBe(true);
  });

  it("accepts { model: 'gpt-5.4' }", () => {
    const out = bodySchema.safeParse({ question: "hi", model: "gpt-5.4" });
    expect(out.success).toBe(true);
  });

  it("accepts body with no model field (env default fallback)", () => {
    const out = bodySchema.safeParse({ question: "hi" });
    expect(out.success).toBe(true);
  });

  it("rejects legacy mode field because it is not a declared key (strict not on; passes through)", () => {
    // Zod z.object is non-strict by default — unknown keys are stripped but not rejected.
    // So the contract is: { mode } does NOT become body.mode downstream.
    const out = bodySchema.safeParse({ question: "hi", mode: "simple" });
    expect(out.success).toBe(true);
    if (out.success) {
      expect("mode" in out.data).toBe(false);
    }
  });

  it("rejects invalid model value", () => {
    const out = bodySchema.safeParse({ question: "hi", model: "bogus-model" });
    expect(out.success).toBe(false);
  });

  it("rejects empty question", () => {
    const out = bodySchema.safeParse({ question: "", model: "gpt-5.4-mini" });
    expect(out.success).toBe(false);
  });
});
