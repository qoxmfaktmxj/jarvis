import type { WikiPageIndex } from "@jarvis/db/schema/wiki-page-index";
import type { InfraRunbookMeta, WikiPage, WikiSensitivityUi } from "./types";

/**
 * apps/web/components/WikiPageView/mappers.ts
 *
 * Phase-W2 / Phase-W3 PR3 — DB row(WikiPageIndex) → UI(WikiPage) 매핑 단일 진입점.
 *
 * sensitivity 변환 규약 (4값 1:1 대응):
 *   PUBLIC          → public
 *   INTERNAL        → internal
 *   RESTRICTED      → restricted
 *   SECRET_REF_ONLY → secret
 *   알 수 없는 값   → restricted  (보수적 처리)
 */
export function mapDbSensitivity(db: string): WikiSensitivityUi {
  switch (db) {
    case "PUBLIC":
      return "public";
    case "INTERNAL":
      return "internal";
    case "RESTRICTED":
      return "restricted";
    case "SECRET_REF_ONLY":
      return "secret";
    default:
      return "restricted";
  }
}

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
    sensitivity: mapDbSensitivity(row.sensitivity),
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
