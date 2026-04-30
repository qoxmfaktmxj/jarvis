/**
 * apps/worker/src/jobs/wiki-quiz-generate.ts
 *
 * 매주 월요일 KST 06:00 (cron `0 21 * * 0` UTC)에 트리거.
 * 워크스페이스마다 wiki_page_index에서 최근 90일 내 published 페이지를 샘플링해
 * 30문항 4지선다 퀴즈를 LLM(gpt-5.4-mini, CLIProxy gateway)으로 일괄 생성한다.
 *
 * Karpathy 원칙:
 *   - 페이지 본문은 디스크에서 wiki-fs `readPage`로 읽는다 (DB 본문 X)
 *   - sensitivity = PUBLIC | INTERNAL만 사용 (RESTRICTED/SECRET_REF_ONLY 제외)
 *   - 도메인(type) 균형: entity / concept / synthesis / source 등에서 골고루
 *
 * 모든 LLM 호출은 logLlmCall로 op="quiz.generate" 기록 (예산 합산 대상).
 */

import type PgBoss from "pg-boss";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@jarvis/db/client";
import {
  llmCallLog,
  wikiPageIndex,
  wikiQuiz,
  wikiQuizBatch,
  workspace
} from "@jarvis/db/schema";
import { callChatWithFallback } from "@jarvis/ai/breaker";
import { resolveModel } from "@jarvis/ai/provider";
import { readPage } from "@jarvis/wiki-fs";

interface LlmLogRow {
  workspaceId: string;
  model: string;
  promptVersion: string | null;
  inputTokens: number;
  outputTokens: number;
  costUsd: string;
  durationMs: number;
  status: "ok" | "error" | "blocked_by_budget";
  errorCode: string | null;
  pagePath: string | null;
}

async function defaultLogLlm(row: LlmLogRow): Promise<void> {
  try {
    await db.insert(llmCallLog).values({
      workspaceId: row.workspaceId,
      model: row.model,
      promptVersion: row.promptVersion ?? undefined,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      costUsd: row.costUsd,
      durationMs: row.durationMs,
      status: row.status,
      errorCode: row.errorCode ?? undefined
    });
  } catch (err) {
    console.warn(
      `[wiki-quiz-generate] llm_call_log insert failed: ${err instanceof Error ? err.message : err}`
    );
  }
}
import {
  llmGeneratedQuizSchema,
  QUIZ_BATCH_TARGET_COUNT,
  type LlmGeneratedQuiz,
  type QuizDifficulty
} from "@jarvis/shared/validation/quiz";

export const QUIZ_GENERATE_QUEUE = "wiki-quiz-generate";
export const QUIZ_GENERATE_CRON = "0 21 * * 0"; // KST 월요일 06:00 = UTC 일요일 21:00

const PROMPT_VERSION = "quiz-v1";
const MAX_BODY_CHARS = 4500;

const DIFFICULTY_DISTRIBUTION: Record<QuizDifficulty, number> = {
  easy: 9, // 30%
  medium: 15, // 50%
  hard: 6 // 20%
};

// 가벼운 가격 추정 (gpt-5.4-mini 가정 — budget 합산 기준):
const COST_PER_INPUT_TOKEN_USD = 0.15 / 1_000_000;
const COST_PER_OUTPUT_TOKEN_USD = 0.60 / 1_000_000;

interface CandidatePage {
  id: string;
  workspaceId: string;
  path: string;
  title: string;
  type: string;
  sensitivity: string;
}

export async function listCandidatePages(
  workspaceId: string,
  database: typeof db = db
): Promise<CandidatePage[]> {
  return database
    .select({
      id: wikiPageIndex.id,
      workspaceId: wikiPageIndex.workspaceId,
      path: wikiPageIndex.path,
      title: wikiPageIndex.title,
      type: wikiPageIndex.type,
      sensitivity: wikiPageIndex.sensitivity
    })
    .from(wikiPageIndex)
    .where(
      and(
        eq(wikiPageIndex.workspaceId, workspaceId),
        eq(wikiPageIndex.publishedStatus, "published"),
        sql`${wikiPageIndex.updatedAt} >= now() - interval '90 days'`,
        inArray(wikiPageIndex.sensitivity, ["PUBLIC", "INTERNAL"])
      )
    )
    .orderBy(desc(wikiPageIndex.updatedAt));
}

/**
 * 도메인 균형 sampling. type별로 round-robin 후 부족하면 랜덤 채움.
 * 결정론은 필요 없으므로 Math.random() 사용 (LLM 호출 자체가 비결정적).
 */
export function sampleBalancedPages(
  candidates: CandidatePage[],
  targetCount: number
): CandidatePage[] {
  if (candidates.length <= targetCount) return [...candidates];
  const byType = new Map<string, CandidatePage[]>();
  for (const c of candidates) {
    const list = byType.get(c.type) ?? [];
    list.push(c);
    byType.set(c.type, list);
  }
  for (const [, list] of byType) {
    list.sort(() => Math.random() - 0.5);
  }
  const types = [...byType.keys()];
  const picked: CandidatePage[] = [];
  let i = 0;
  while (picked.length < targetCount) {
    const t = types[i % types.length]!;
    const next = byType.get(t)?.shift();
    if (next) picked.push(next);
    i++;
    if (i > targetCount * 4) break; // safety
  }
  return picked;
}

/**
 * 30문항 → 난이도별 분배. 페이지 풀 순서대로 easy 9 → medium 15 → hard 6.
 */
export function assignDifficulty(
  pages: CandidatePage[]
): { page: CandidatePage; difficulty: QuizDifficulty }[] {
  const out: { page: CandidatePage; difficulty: QuizDifficulty }[] = [];
  const order: QuizDifficulty[] = [];
  for (const [diff, n] of Object.entries(DIFFICULTY_DISTRIBUTION) as [QuizDifficulty, number][]) {
    for (let i = 0; i < n; i++) order.push(diff);
  }
  for (let i = 0; i < pages.length && i < order.length; i++) {
    out.push({ page: pages[i]!, difficulty: order[i]! });
  }
  return out;
}

interface QuizPromptInput {
  pageTitle: string;
  pagePath: string;
  pageBody: string;
  difficulty: QuizDifficulty;
}

export function buildQuizPrompt(input: QuizPromptInput): {
  system: string;
  user: string;
} {
  const difficultyHint: Record<QuizDifficulty, string> = {
    easy: "사실 확인 수준의 단순한 문제. 본문에 직접 적힌 단어 하나를 묻는다.",
    medium: "본문 내용을 종합해야 풀 수 있는 문제. 두 가지 사실의 결합이나 정의의 응용.",
    hard: "본문에서 추론해야 하는 응용 문제. 단순 기억이 아닌 이해를 묻는다."
  };
  const truncated = input.pageBody.length > MAX_BODY_CHARS
    ? input.pageBody.slice(0, MAX_BODY_CHARS) + "\n…(생략)"
    : input.pageBody;
  const system = `당신은 사내 위키 학습용 4지선다 퀴즈를 만드는 도구입니다.
- 반드시 JSON으로만 응답합니다.
- 정답은 본문에 명시되거나 본문에서 명확히 추론 가능한 내용이어야 합니다.
- 오답 보기는 그럴듯하지만 명백히 다른 내용으로 만듭니다.
- 본문에 없는 내용을 정답으로 만들지 마십시오.`;
  const user = `다음 위키 페이지로부터 한국어 4지선다 문제 1개를 만들어 주세요.

페이지 제목: ${input.pageTitle}
페이지 경로: ${input.pagePath}
난이도: ${input.difficulty} — ${difficultyHint[input.difficulty]}

== 본문 ==
${truncated}
== 본문 끝 ==

JSON schema:
{
  "question": "한국어 질문",
  "options": ["보기 A", "보기 B", "보기 C", "보기 D"],
  "answerIndex": 0,
  "explanation": "1-2줄짜리 정답 설명 (본문 근거 명시)",
  "difficulty": "${input.difficulty}"
}`;
  return { system, user };
}

interface CallLLMOptions {
  workspaceId: string;
  promptInput: QuizPromptInput;
  pagePath: string;
  callChat?: typeof callChatWithFallback;
  logCall?: (row: LlmLogRow) => Promise<void>;
  modelOverride?: string;
}

export async function generateQuizForPage(
  options: CallLLMOptions
): Promise<LlmGeneratedQuiz | null> {
  const callChat = options.callChat ?? callChatWithFallback;
  const log = options.logCall ?? defaultLogLlm;
  const model = options.modelOverride ?? resolveModel("ingest");
  const { system, user } = buildQuizPrompt(options.promptInput);
  const start = Date.now();

  try {
    const completion = await callChat("ingest", {
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
      max_tokens: 800
    });
    const durationMs = Date.now() - start;
    const content = completion.choices[0]?.message?.content ?? "";
    const usage = completion.usage;
    const inputTokens = usage?.prompt_tokens ?? 0;
    const outputTokens = usage?.completion_tokens ?? 0;
    const cost = (
      inputTokens * COST_PER_INPUT_TOKEN_USD +
      outputTokens * COST_PER_OUTPUT_TOKEN_USD
    ).toFixed(6);

    let parsed: LlmGeneratedQuiz | null = null;
    try {
      const json = JSON.parse(content) as unknown;
      parsed = llmGeneratedQuizSchema.parse(json);
    } catch {
      await log({
        workspaceId: options.workspaceId,
        model,
        promptVersion: PROMPT_VERSION,
        inputTokens,
        outputTokens,
        costUsd: cost,
        durationMs,
        status: "error",
        errorCode: "parse_error",
        pagePath: options.pagePath
      });
      return null;
    }

    await log({
      workspaceId: options.workspaceId,
      model,
      promptVersion: PROMPT_VERSION,
      inputTokens,
      outputTokens,
      costUsd: cost,
      durationMs,
      status: "ok",
      errorCode: null,
      pagePath: options.pagePath
    });
    return parsed;
  } catch (err) {
    await log({
      workspaceId: options.workspaceId,
      model,
      promptVersion: PROMPT_VERSION,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: "0",
      durationMs: Date.now() - start,
      status: "error",
      errorCode: err instanceof Error ? err.message.slice(0, 200) : "unknown",
      pagePath: options.pagePath
    });
    return null;
  }
}

interface GenerateForWorkspaceDeps {
  callChat?: typeof callChatWithFallback;
  logCall?: (row: LlmLogRow) => Promise<void>;
  readPageImpl?: typeof readPage;
  database?: typeof db;
}

export async function generateQuizBatchForWorkspace(
  workspaceId: string,
  deps: GenerateForWorkspaceDeps = {}
): Promise<{ batchId: string | null; created: number; failed: number }> {
  const database = deps.database ?? db;
  const readPageFn = deps.readPageImpl ?? readPage;

  const candidates = await listCandidatePages(workspaceId, database);
  if (candidates.length === 0) {
    console.log(`[wiki-quiz-generate] workspace=${workspaceId} no candidate pages`);
    return { batchId: null, created: 0, failed: 0 };
  }
  const sampled = sampleBalancedPages(candidates, QUIZ_BATCH_TARGET_COUNT);
  const assigned = assignDifficulty(sampled);

  const generated: { page: CandidatePage; difficulty: QuizDifficulty; quiz: LlmGeneratedQuiz }[] = [];
  let failed = 0;
  for (const { page, difficulty } of assigned) {
    let body: string;
    try {
      body = await readPageFn(workspaceId, page.path);
    } catch (err) {
      console.warn(
        `[wiki-quiz-generate] read failed workspace=${workspaceId} path=${page.path}: ${err instanceof Error ? err.message : err}`
      );
      failed += 1;
      continue;
    }
    const quiz = await generateQuizForPage({
      workspaceId,
      pagePath: page.path,
      promptInput: {
        pageTitle: page.title,
        pagePath: page.path,
        pageBody: body,
        difficulty
      },
      callChat: deps.callChat,
      logCall: deps.logCall
    });
    if (!quiz) {
      failed += 1;
      continue;
    }
    generated.push({ page, difficulty, quiz });
  }

  if (generated.length === 0) {
    return { batchId: null, created: 0, failed };
  }

  const batchId = await database.transaction(async (tx) => {
    const [batch] = await tx
      .insert(wikiQuizBatch)
      .values({
        workspaceId,
        generatedBy: "llm",
        count: generated.length,
        promptVersion: PROMPT_VERSION
      })
      .returning({ id: wikiQuizBatch.id });
    if (!batch) throw new Error("wiki_quiz_batch insert returned no row");

    await tx.insert(wikiQuiz).values(
      generated.map((g) => ({
        workspaceId,
        batchId: batch.id,
        sourcePagePath: g.page.path,
        question: g.quiz.question,
        options: g.quiz.options,
        answerIndex: g.quiz.answerIndex,
        explanation: g.quiz.explanation,
        difficulty: g.quiz.difficulty,
        generatedBy: "llm" as const
      }))
    );
    return batch.id;
  });
  console.log(
    `[wiki-quiz-generate] workspace=${workspaceId} batch=${batchId} created=${generated.length} failed=${failed}`
  );
  return { batchId, created: generated.length, failed };
}

export async function quizGenerateHandler(
  _jobs: PgBoss.Job<Record<string, never>>[],
  deps: GenerateForWorkspaceDeps = {}
): Promise<{ workspaces: number; created: number; failed: number }> {
  const database = deps.database ?? db;
  const workspaces = await database.select({ id: workspace.id }).from(workspace);
  let totalCreated = 0;
  let totalFailed = 0;
  for (const ws of workspaces) {
    try {
      const r = await generateQuizBatchForWorkspace(ws.id, deps);
      totalCreated += r.created;
      totalFailed += r.failed;
    } catch (err) {
      console.error(
        `[wiki-quiz-generate] workspace=${ws.id} fatal:`,
        err instanceof Error ? err.message : err
      );
    }
  }
  console.log(
    `[wiki-quiz-generate] complete: workspaces=${workspaces.length} created=${totalCreated} failed=${totalFailed}`
  );
  return { workspaces: workspaces.length, created: totalCreated, failed: totalFailed };
}
