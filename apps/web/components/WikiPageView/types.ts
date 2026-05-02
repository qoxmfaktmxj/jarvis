/**
 * apps/web/components/WikiPageView/types.ts
 *
 * Phase-W2 / Phase-W3 PR3 — WikiPage / WikiPageMeta 타입 정의.
 * mockWikiPages.ts 와 분리해 Storybook fixture 와 실 DB 로딩 코드가 같은 타입을 공유.
 *
 * sensitivity UI 4값: DB 의 PUBLIC|INTERNAL|RESTRICTED|SECRET_REF_ONLY 에 1:1 대응.
 * mappers.ts 의 mapDbSensitivity() 를 통해서만 변환한다. 직접 비교 금지.
 */
export type WikiSensitivityUi = "public" | "internal" | "restricted" | "secret";

export type WikiPageMeta = {
  slug: string;
  title: string;
  sensitivity: WikiSensitivityUi;
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
