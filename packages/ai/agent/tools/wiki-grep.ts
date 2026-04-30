// packages/ai/agent/tools/wiki-grep.ts
//
// Ask AI harness tool: 위키 페이지를 keyword로 검색.
// 본문은 포함하지 않고 후보 리스트만 반환 — 본문은 wiki-read tool이 담당.

import { db } from "@jarvis/db/client";
import { wikiPageIndex } from "@jarvis/db/schema";
import { and, eq, ilike, or, sql } from "drizzle-orm";
import { resolveAllowedWikiSensitivities } from "@jarvis/auth";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { pgTextArray } from "../../sql-utils.js";
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

function escapeIlike(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export const wikiGrep: ToolDefinition<WikiGrepInput, WikiGrepOutput> = {
  name: "wiki_grep",
  description:
    "위키 페이지를 title/slug/aliases/routeKey 키워드로 검색. 본문은 wiki-read 로 후속 조회.",
  parameters: {
    type: "object",
    required: ["query"],
    properties: {
      query: { type: "string", minLength: 2 },
      scope: {
        type: "string",
        enum: ["all", "manual", "auto", "procedures"],
        default: "all",
      },
      limit: { type: "integer", minimum: 1, maximum: 30, default: 10 },
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
    const escaped = escapeIlike(q);
    const perms = ctx.permissions as string[];
    const isAdmin = perms.includes(PERMISSIONS.ADMIN_ALL);
    const allowedSensitivities = resolveAllowedWikiSensitivities(perms);

    if (allowedSensitivities.length === 0) {
      return ok({ matches: [] });
    }

    // workspace-relative scope: '%/{zone}/%' 형태로 매칭 (멀티테넌트 안전)
    const scopeCond =
      scope === "all"
        ? sql`true`
        : sql`${wikiPageIndex.path} LIKE ${`%/${scope}/%`}`;

    // ACL: requiredPermission이 null이거나, caller가 보유, 또는 ADMIN_ALL
    // pgTextArray: drizzle이 plain JS array를 row literal `($1,$2,...)`로 인라인하는 걸
    // 회피하고 `ARRAY[$1,$2,...]::text[]`로 emit (sql-utils.ts 주석 참조).
    const requiredPermissionCond = isAdmin
      ? sql`true`
      : sql`(${wikiPageIndex.requiredPermission} IS NULL OR ${wikiPageIndex.requiredPermission} = ANY(${pgTextArray(perms)}))`;

    const publishedCond = isAdmin
      ? sql`true`
      : eq(wikiPageIndex.publishedStatus, "published");

    // aliases는 frontmatter->'aliases' (jsonb array of string)
    // alias는 jsonb 배열 정확 일치 매칭이라 ILIKE wildcard escape 불필요
    // (drizzle parameterized binding으로 SQLi 차단).
    const aliasMatch = sql`(${wikiPageIndex.frontmatter} -> 'aliases') ?| ARRAY[${q}]`;

    try {
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
              ilike(wikiPageIndex.title, `%${escaped}%`),
              ilike(wikiPageIndex.slug, `%${escaped}%`),
              ilike(wikiPageIndex.routeKey, `%${escaped}%`),
              aliasMatch,
            ),
            scopeCond,
            sql`${wikiPageIndex.sensitivity} = ANY(${pgTextArray(allowedSensitivities)})`,
            requiredPermissionCond,
            publishedCond,
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
      return err("unknown", e instanceof Error ? e.message : String(e));
    }
  },
};
