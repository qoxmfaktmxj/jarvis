// packages/ai/agent/tools/wiki-grep.ts
//
// Ask AI harness tool: 위키 페이지를 slug/title 키워드로 검색.
// 본문은 포함하지 않고 후보 리스트만 반환 — 본문은 wiki-read tool이 담당.

import { db } from "@jarvis/db/client";
import { wikiPageIndex } from "@jarvis/db/schema";
import { and, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { getAllowedWikiSensitivityValues } from "@jarvis/auth/rbac";
import {
  ok,
  err,
  type ToolContext,
  type ToolDefinition,
  type ToolResult,
} from "./types.js";

export interface WikiGrepInput {
  query: string;
  scope?: "all" | "manual" | "auto" | "procedures";
  limit?: number;
}

export interface WikiGrepMatch {
  slug: string;
  title: string;
  path: string;
  sensitivity: string;
  /** Phase A3에서 wiki-fs를 읽어 채움. 현재는 빈 문자열. */
  snippet: string;
}

export interface WikiGrepOutput {
  matches: WikiGrepMatch[];
}

export const wikiGrep: ToolDefinition<WikiGrepInput, WikiGrepOutput> = {
  name: "wiki_grep",
  description:
    "위키 페이지를 slug/title 키워드로 검색. 본문은 wiki-read 로 후속 조회.",
  parameters: {
    type: "object",
    required: ["query"],
    properties: {
      query: {
        type: "string",
        minLength: 2,
        description: "검색 키워드 (2자 이상)",
      },
      scope: {
        type: "string",
        enum: ["all", "manual", "auto", "procedures"],
        default: "all",
        description: "검색 범위 필터. 기본값 all",
      },
      limit: {
        type: "integer",
        minimum: 1,
        maximum: 30,
        default: 10,
        description: "반환할 최대 결과 수 (1-30)",
      },
    },
  },

  async execute(
    { query, scope = "all", limit = 10 }: WikiGrepInput,
    ctx: ToolContext,
  ): Promise<ToolResult<WikiGrepOutput>> {
    const q = (query ?? "").trim();
    if (q.length < 2) {
      return err("invalid", "query must be at least 2 characters");
    }

    const lim = Math.min(30, Math.max(1, limit));

    try {
      // sensitivity 허용 목록 — getAllowedWikiSensitivityValues는 drizzle 조건 아님
      const allowedSensitivities = getAllowedWikiSensitivityValues(
        ctx.permissions as string[],
      );

      // scope 필터: all 이면 조건 없음
      const scopeCond =
        scope === "all"
          ? sql`true`
          : ilike(wikiPageIndex.path, `wiki/jarvis/${scope}/%`);

      const rows = await db
        .select({
          slug: wikiPageIndex.slug,
          title: wikiPageIndex.title,
          path: wikiPageIndex.path,
          sensitivity: wikiPageIndex.sensitivity,
        })
        .from(wikiPageIndex)
        .where(
          and(
            eq(wikiPageIndex.workspaceId, ctx.workspaceId),
            or(
              ilike(wikiPageIndex.title, `%${q}%`),
              ilike(wikiPageIndex.slug, `%${q}%`),
            ),
            scopeCond,
            inArray(wikiPageIndex.sensitivity, allowedSensitivities),
          ),
        )
        .orderBy(wikiPageIndex.title)
        .limit(lim);

      return ok({
        matches: rows.map((r) => ({
          slug: r.slug,
          title: r.title,
          path: r.path,
          sensitivity: r.sensitivity,
          snippet: "",
        })),
      });
    } catch (e) {
      return err(
        "unknown",
        e instanceof Error ? e.message : String(e),
      );
    }
  },
};
