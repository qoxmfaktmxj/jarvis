/**
 * apps/web/components/WikiPageView/types.ts
 *
 * Phase-W2 — WikiPage / WikiPageMeta 타입 정의.
 * mockWikiPages.ts 와 분리해 Storybook fixture 와 실 DB 로딩 코드가 같은 타입을 공유.
 *
 * 주의: sensitivity 의 레거시 UI 유니온은 'public'|'internal'|'confidential' 이다.
 *       DB 의 4값(PUBLIC|INTERNAL|RESTRICTED|SECRET_REF_ONLY) 은 mappers.ts 의
 *       mapDbSensitivity() 를 통해서만 변환한다. 직접 비교 금지.
 */
export type WikiSensitivityUi = "public" | "internal" | "confidential";

export type WikiPageMeta = {
  slug: string;
  title: string;
  sensitivity: WikiSensitivityUi;
  tags: string[];
  updatedAt: string;
  workspaceId: string;
};

export type WikiPage = WikiPageMeta & {
  content: string;
};
