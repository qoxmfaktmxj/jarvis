'use client';

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
  return (
    <div className="space-y-8">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Searches Today"    value={data.totalToday} />
        <StatCard
          label="Zero-Result Rate"
          value={`${data.zeroResultRate}%`}
          sub="Queries returning no results"
        />
        <StatCard
          label="Avg Response"
          value={`${data.avgResponseMs} ms`}
          sub="Mean search latency today"
        />
      </div>

      <div className="grid grid-cols-2 gap-8">
        {/* Popular searches */}
        <div className="space-y-3">
          <h2 className="text-base font-semibold">Top 10 Popular Searches</h2>
          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Term</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.popularTerms.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={2} className="text-center text-muted-foreground py-4">No data</TableCell>
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
          <h2 className="text-base font-semibold">Zero-Result Queries</h2>
          <p className="text-xs text-muted-foreground">These terms need synonym rules or new content (last 7 days).</p>
          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Term</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.zeroResultTerms.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={2} className="text-center text-muted-foreground py-4">No zero-result queries — great!</TableCell>
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
