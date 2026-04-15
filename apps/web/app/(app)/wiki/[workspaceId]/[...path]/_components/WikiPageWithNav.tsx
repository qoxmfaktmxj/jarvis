'use client';

import { useRouter } from 'next/navigation';
import { WikiPageView, type WikiPage } from '@/components/WikiPageView';

type WikiPageWithNavProps = {
  page: WikiPage;
  workspaceId: string;
};

export function WikiPageWithNav({ page, workspaceId }: WikiPageWithNavProps) {
  const router = useRouter();

  return (
    <WikiPageView
      page={page}
      onWikiLinkClick={(slug) => {
        router.push(`/wiki/${workspaceId}/${slug}`);
      }}
    />
  );
}
