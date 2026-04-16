'use client';

import { useRouter } from 'next/navigation';
import { WikiPageView, type WikiPage } from '@/components/WikiPageView';

type WikiPageWithNavProps = {
  page: WikiPage;
  workspaceId: string;
  /**
   * T6 — 현재 페이지에서 출발하는 orphan wikilink target slug 목록.
   * 서버 컴포넌트(`page.tsx`)에서 `wiki_page_link.toPageId IS NULL` 조회 결과를 넘긴다.
   */
  orphanSlugs?: readonly string[];
};

export function WikiPageWithNav({
  page,
  workspaceId,
  orphanSlugs,
}: WikiPageWithNavProps) {
  const router = useRouter();

  return (
    <WikiPageView
      page={page}
      orphanSlugs={orphanSlugs}
      onWikiLinkClick={(slug) => {
        router.push(`/wiki/${workspaceId}/${slug}`);
      }}
    />
  );
}
