"use client";

/**
 * apps/web/app/(app)/admin/menus/_components/MenuTreeViewer.tsx
 *
 * Read-only tree viewer for the admin/menus page.
 * Displays menu_item rows as a flat table grouped by kind (menu / action),
 * sorted by sortOrder. Edit UI is deferred to a future task.
 */

import { useTranslations } from 'next-intl';

type MenuItem = {
  id: string;
  code: string;
  kind: 'menu' | 'action';
  label: string;
  routePath: string | null;
  icon: string | null;
  sortOrder: number;
  isVisible: boolean;
  parentId: string | null;
};

type Props = {
  items: MenuItem[];
};

export function MenuTreeViewer({ items }: Props) {
  const t = useTranslations('Admin.Menus');
  const sorted = [...items].sort((a, b) => a.sortOrder - b.sortOrder);
  const menuItems = sorted.filter((i) => i.kind === 'menu');
  const actionItems = sorted.filter((i) => i.kind === 'action');

  return (
    <div className="space-y-8">
      <Section title={t('kindMenu')} items={menuItems} />
      {actionItems.length > 0 && (
        <Section title={t('kindAction')} items={actionItems} />
      )}
    </div>
  );
}

function Section({ title, items }: { title: string; items: MenuItem[] }) {
  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <div className="rounded-md border divide-y">
        {items.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-muted-foreground">
            항목 없음
          </div>
        ) : (
          items.map((item) => (
            <div key={item.id} className="flex items-center gap-4 px-4 py-3">
              <div className="w-8 text-right text-xs tabular-nums text-muted-foreground">
                {item.sortOrder}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {item.icon && (
                    <span className="text-xs text-muted-foreground font-mono">
                      [{item.icon}]
                    </span>
                  )}
                  <span className="text-sm font-medium">{item.label}</span>
                  <span className="text-xs text-muted-foreground font-mono">
                    {item.code}
                  </span>
                </div>
                {item.routePath && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {item.routePath}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-3">
                {item.parentId && (
                  <span className="text-[10px] bg-surface-100 text-surface-600 rounded px-1.5 py-0.5">
                    하위
                  </span>
                )}
                <span
                  className={[
                    'text-[10px] rounded px-1.5 py-0.5',
                    item.isVisible
                      ? 'bg-green-50 text-green-700'
                      : 'bg-surface-100 text-surface-500',
                  ].join(' ')}
                >
                  {item.isVisible ? '표시' : '숨김'}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
