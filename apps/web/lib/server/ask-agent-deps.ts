import "server-only";

import {
  createAiLogSink,
  createBudgetTracker,
  createMemoryRateLimiter,
  createProvider,
  createSourceRevisionReadRepository,
  locateSourceSegment,
  type AskAgentDeps,
  type ToolContext,
} from "@jarvis/ai";
import { db } from "@jarvis/db";
import { createEvidenceSearcher } from "@jarvis/search";
import { createMinioObjectStoreFromEnv } from "@jarvis/storage";
import { GitRepo } from "@jarvis/wiki-fs";
import { resolveAskDailyBudgetUsd } from "./ask-agent-budget";

const sharedRateLimiter = createMemoryRateLimiter({ windowMs: 60_000, maxCost: 20 });

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

export function createAskAgentDeps(context: ToolContext): AskAgentDeps {
  const repoRoot = requireEnv("WIKI_REPO_ROOT");
  return {
    context,
    provider: createProvider(process.env),
    searcher: createEvidenceSearcher({ db }),
    wikiRepo: new GitRepo(repoRoot),
    sourceRevisionRepository: createSourceRevisionReadRepository(db),
    objectStore: createMinioObjectStoreFromEnv(process.env),
    locateSourceSegment,
    rateLimiter: sharedRateLimiter,
    budget: createBudgetTracker(db, { dailyUsd: resolveAskDailyBudgetUsd(process.env) }),
    logs: createAiLogSink(db),
  };
}
