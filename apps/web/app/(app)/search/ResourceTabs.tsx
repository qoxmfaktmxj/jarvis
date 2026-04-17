// apps/web/app/(app)/search/ResourceTabs.tsx
// Phase-W5: Lane A (knowledge wiki) vs Lane B (precedent cases) tab switch.
// URL-driven (no client state) — each tab is a Link preserving the query.
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

export type ResourceTabValue = 'knowledge' | 'case';

export async function ResourceTabs({
  value,
  currentQuery,
  extraParams,
}: {
  value: ResourceTabValue;
  currentQuery: string;
  extraParams?: Record<string, string | undefined>;
}) {
  const t = await getTranslations('SearchPage');

  function hrefFor(target: ResourceTabValue): string {
    const params = new URLSearchParams();
    if (currentQuery) params.set('q', currentQuery);
    params.set('resourceType', target);
    for (const [k, v] of Object.entries(extraParams ?? {})) {
      if (v) params.set(k, v);
    }
    return `/search?${params.toString()}`;
  }

  const tabClass = (active: boolean) =>
    [
      'px-4 py-2 border-b-2 text-sm transition-colors',
      active
        ? 'border-primary text-foreground font-semibold'
        : 'border-transparent text-muted-foreground hover:text-foreground',
    ].join(' ');

  // Use nav semantics instead of role="tab" — ARIA tabs require a matching
  // role="tabpanel", but this component drives full-page navigation via URL.
  return (
    <nav aria-label={t('tabKnowledge') + ' / ' + t('tabCase')} className="mb-4 flex gap-2 border-b">
      <Link
        aria-current={value === 'knowledge' ? 'page' : undefined}
        href={hrefFor('knowledge')}
        className={tabClass(value === 'knowledge')}
        title={t('tabKnowledgeDesc')}
      >
        {t('tabKnowledge')}
      </Link>
      <Link
        aria-current={value === 'case' ? 'page' : undefined}
        href={hrefFor('case')}
        className={tabClass(value === 'case')}
        title={t('tabCaseDesc')}
      >
        {t('tabCase')}
      </Link>
    </nav>
  );
}
