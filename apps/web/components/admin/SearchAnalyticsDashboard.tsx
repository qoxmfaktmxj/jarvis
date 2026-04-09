'use client';

import { useTranslations } from 'next-intl';
import type { SearchAnalytics } from '@/lib/queries/admin';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

type Props = { data: SearchAnalytics };

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="border rounded-lg p-4 space-y-1">
      <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function SearchAnalyticsDashboard({ data }: Props) {
  const t = useTranslations('Admin.SearchAnalytics');
  return (
    <div className="space-y-8">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label={t('searchesToday')}    value={data.totalToday} />
        <StatCard
          label={t('zeroResultRate')}
          value={`${data.zeroResultRate}%`}
          sub={t('zeroResultDesc')}
        />
        <StatCard
          label={t('avgResponse')}
          value={`${data.avgResponseMs} ms`}
          sub={t('avgResponseDesc')}
        />
      </div>

      <div className="grid grid-cols-2 gap-8">
        {/* Popular searches */}
        <div className="space-y-3">
          <h2 className="text-base font-semibold">{t('topSearches')}</h2>
          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('columns.term')}</TableHead>
                  <TableHead className="text-right">{t('columns.count')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.popularTerms.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={2} className="text-center text-muted-foreground py-4">{t('noData')}</TableCell>
                  </TableRow>
                ) : (
                  data.popularTerms.map((item, i) => (
                    <TableRow key={item.term}>
                      <TableCell className="text-sm">
                        <span className="text-muted-foreground w-5 inline-block">{i + 1}.</span>
                        {item.term}
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium">{item.count.toLocaleString()}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Zero-result queries */}
        <div className="space-y-3">
          <h2 className="text-base font-semibold">{t('zeroResultQueries')}</h2>
          <p className="text-xs text-muted-foreground">{t('zeroResultNote')}</p>
          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('columns.term')}</TableHead>
                  <TableHead className="text-right">{t('columns.count')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.zeroResultTerms.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={2} className="text-center text-muted-foreground py-4">{t('noZeroResults')}</TableCell>
                  </TableRow>
                ) : (
                  data.zeroResultTerms.map((item) => (
                    <TableRow key={item.term}>
                      <TableCell className="text-sm text-destructive">{item.term}</TableCell>
                      <TableCell className="text-right text-sm font-medium">{item.count.toLocaleString()}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </div>
  );
}
