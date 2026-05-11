// packages/ai/agent/tools/wiki-follow-link.ts
//
// slug 에서 outbound wikilinks (1-hop) 을 반환.
//
// 2026-05-11 (D4=A): 페이지별 sensitivity/requiredPermission/publishedStatus
// ACL 게이트 제거 (source + targets 양쪽 모두). workspaceId 매칭으로 충분.

import { db } from "@jarvis/db/client";
import { wikiPageIndex } from "@jarvis/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { readPage } from "@jarvis/wiki-fs";
import { splitFrontmatter } from "@jarvis/wiki-fs/frontmatter";
import { parseWikilinks } from "@jarvis/wiki-fs/wikilink";
import { ok, err, type ToolDefinition } from "./types.js";

export interface WikiFollowLinkInput {
  from_slug: string;
  direction?: "outbound";
}

export interface WikiFollowLinkLink {
  slug: string;
  title: string;
  direction: "outbound";
}

export interface WikiFollowLinkOutput {
  links: WikiFollowLinkLink[];
}

export const wikiFollowLink: ToolDefinition<WikiFollowLinkInput, WikiFollowLinkOutput> = {
  name: "wiki_follow_link",
  description:
    "slug에서 outbound wikilinks (1-hop) 목록.",
  parameters: {
    type: "object",
    required: ["from_slug"],
    properties: {
      from_slug: { type: "string", minLength: 1 },
      direction: { type: "string", enum: ["outbound"], default: "outbound" },
    },
  },
  async execute({ from_slug }, ctx) {
    if (!from_slug || from_slug.trim().length === 0) {
      return err("invalid", "from_slug required");
    }

    try {
      const [source] = await db
        .select({
          path: wikiPageIndex.path,
        })
        .from(wikiPageIndex)
        .where(
          and(
            eq(wikiPageIndex.workspaceId, ctx.workspaceId),
            eq(wikiPageIndex.slug, from_slug),
          ),
        )
        .limit(1);

      if (!source) {
        return err("not_found", `slug "${from_slug}" not found`);
      }

      const raw = await readPage(ctx.workspaceId, source.path);
      const { body } = splitFrontmatter(raw);
      const linkObjs = parseWikilinks(body);
      const uniqueSlugs = Array.from(
        new Set(linkObjs.map((l) => l.target).filter(Boolean)),
      );

      if (uniqueSlugs.length === 0) {
        return ok({ links: [] });
      }

      const targets = await db
        .select({
          slug: wikiPageIndex.slug,
          title: wikiPageIndex.title,
        })
        .from(wikiPageIndex)
        .where(
          and(
            eq(wikiPageIndex.workspaceId, ctx.workspaceId),
            inArray(wikiPageIndex.slug, uniqueSlugs),
          ),
        );

      const links = targets.map((t) => ({
        slug: t.slug,
        title: t.title,
        direction: "outbound" as const,
      }));

      return ok({ links });
    } catch (e) {
      return err("unknown", e instanceof Error ? e.message : String(e));
    }
  },
};
