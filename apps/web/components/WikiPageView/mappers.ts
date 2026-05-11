import type { WikiPageIndex } from "@jarvis/db/schema/wiki-page-index";
import type { InfraRunbookMeta, WikiPage } from "./types";

/**
 * apps/web/components/WikiPageView/mappers.ts
 *
 * Phase-W2 / Phase-W3 PR3 — DB row(WikiPageIndex) → UI(WikiPage) 매핑 단일 진입점.
 *
 * sensitivity 격리는 RBAC + workspaceId 모델로 일원화되었다 (2026-05-11 step 2A) —
 * 매핑에서 sensitivity 필드는 제거.
 */
export function mapDbRowToWikiPage(row: WikiPageIndex, body: string): WikiPage {
  const fm = (row.frontmatter ?? {}) as Record<string, unknown>;

  const fmTags = fm.tags;
  const tags =
    Array.isArray(fmTags) && fmTags.every((t) => typeof t === "string")
      ? (fmTags as string[])
      : [];

  const pageType = typeof fm.type === "string" ? fm.type : undefined;
  const infra =
    pageType === "infra-runbook" && fm.infra && typeof fm.infra === "object"
      ? coerceInfraMeta(fm.infra as Record<string, unknown>)
      : undefined;

  return {
    slug: row.slug,
    title: row.title,
    tags,
    updatedAt: row.updatedAt.toISOString(),
    workspaceId: row.workspaceId,
    content: body,
    pageType,
    infra,
  };
}

function coerceInfraMeta(raw: Record<string, unknown>): InfraRunbookMeta {
  const str = (v: unknown) =>
    v === null || v === undefined ? null : typeof v === "string" ? v : String(v);
  return {
    enterCd: typeof raw.enterCd === "string" ? raw.enterCd : undefined,
    companyCd: typeof raw.companyCd === "string" ? raw.companyCd : undefined,
    envType: typeof raw.envType === "string" ? raw.envType : undefined,
    connectCd: typeof raw.connectCd === "string" ? raw.connectCd : undefined,
    vpnFileSeq:
      typeof raw.vpnFileSeq === "string" || typeof raw.vpnFileSeq === "number"
        ? raw.vpnFileSeq
        : null,
    domainAddr: str(raw.domainAddr),
    loginInfo: str(raw.loginInfo),
    svnAddr: str(raw.svnAddr),
    dbConnectInfo: str(raw.dbConnectInfo),
    dbUserInfo: str(raw.dbUserInfo),
    srcInfo: str(raw.srcInfo),
    classInfo: str(raw.classInfo),
  };
}
