// packages/ai/agent/tools/wiki-read.ts
//
// slug 로 위키 페이지 전체 내용을 읽어 frontmatter + content + outbound wikilinks 반환.

import { db } from "@jarvis/db/client";
import { wikiPageIndex } from "@jarvis/db/schema";
import { and, eq } from "drizzle-orm";
import { canAccessKnowledgeSensitivityByPermissions } from "@jarvis/auth/rbac";
import { readPage } from "@jarvis/wiki-fs";
import { splitFrontmatter } from "@jarvis/wiki-fs/frontmatter";
import { parseWikilinks } from "@jarvis/wiki-fs/wikilink";
import { ok, err, type ToolDefinition } from "./types.js";

export interface WikiReadInput {
  slug: string;
}

export interface WikiReadOutput {
  slug: string;
  title: string;
  path: string;
  sensitivity: string;
  /** raw frontmatter string or null when no frontmatter block present */
  frontmatter: unknown;
  /** frontmatter 제외한 본문 */
  content: string;
  /** 본문에 등장한 outbound wikilink slug 배열 (중복 제거) */
  outbound_wikilinks: string[];
}

export const wikiRead: ToolDefinition<WikiReadInput, WikiReadOutput> = {
  name: "wiki_read",
  description:
    "slug 로 위키 페이지 본문 읽기. frontmatter + content + outbound wikilinks 반환.",
  parameters: {
    type: "object",
    required: ["slug"],
    properties: {
      slug: { type: "string", minLength: 1 },
    },
  },
  async execute({ slug }, ctx) {
    if (!slug || slug.trim().length === 0) {
      return err("invalid", "slug is required");
    }

    try {
      const [row] = await db
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
            eq(wikiPageIndex.slug, slug),
          ),
        )
        .limit(1);

      if (!row) {
        return err("not_found", `slug "${slug}" not found`);
      }

      if (
        !canAccessKnowledgeSensitivityByPermissions(
          [...ctx.permissions],
          row.sensitivity,
        )
      ) {
        return err("forbidden", "sensitivity restricted");
      }

      const raw = await readPage(ctx.workspaceId, row.path);
      const { frontmatter, body } = splitFrontmatter(raw);
      const links = parseWikilinks(body);
      const outbound_wikilinks = Array.from(
        new Set(links.map((l) => l.target).filter(Boolean)),
      );

      return ok({
        slug: row.slug,
        title: row.title,
        path: row.path,
        sensitivity: row.sensitivity,
        frontmatter: frontmatter ?? null,
        content: body,
        outbound_wikilinks,
      });
    } catch (e) {
      return err("unknown", e instanceof Error ? e.message : String(e));
    }
  },
};
