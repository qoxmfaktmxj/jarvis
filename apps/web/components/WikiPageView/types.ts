/**
 * apps/web/components/WikiPageView/types.ts
 *
 * Phase-W2 / Phase-W3 PR3 — WikiPage / WikiPageMeta 타입 정의.
 * mockWikiPages.ts 와 분리해 Storybook fixture 와 실 DB 로딩 코드가 같은 타입을 공유.
 *
 * sensitivity 격리는 RBAC + workspaceId 모델로 일원화되었다 (2026-05-11 step 2A).
 * 본 모듈에서 sensitivity 필드를 제거.
 */
export type WikiPageMeta = {
  slug: string;
  title: string;
  tags: string[];
  updatedAt: string;
  workspaceId: string;
  /**
   * Page type from frontmatter (`type:` field). Used to dispatch a
   * specialized renderer — e.g. `infra-runbook` pages get a structured
   * info panel above the markdown body. Undefined for legacy pages that
   * didn't carry the field.
   */
  pageType?: string;
  /**
   * Structured infra metadata — populated when `pageType === "infra-runbook"`.
   * Mirrors the legacy company-master export columns documented in the
   * infra pipeline plan.
   */
  infra?: InfraRunbookMeta;
};

export type InfraRunbookMeta = {
  enterCd?: string;
  companyCd?: string;
  envType?: string;
  connectCd?: string;
  vpnFileSeq?: string | number | null;
  domainAddr?: string | null;
  loginInfo?: string | null;
  svnAddr?: string | null;
  dbConnectInfo?: string | null;
  dbUserInfo?: string | null;
  srcInfo?: string | null;
  classInfo?: string | null;
};

export type WikiPage = WikiPageMeta & {
  content: string;
};
