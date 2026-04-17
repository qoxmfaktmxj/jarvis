// apps/web/components/knowledge/KnowledgeDebtRadar.tsx
// 지식 부채 레이더 — stale 문서 현황 위젯
'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, RefreshCw, Users } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  getKnowledgeDebtSummary,
  type KnowledgeDebtSummary,
} from '@/app/actions/knowledge-debt';

interface KnowledgeDebtRadarProps {
  workspaceId: string;
}

function StatBadge({
  icon: Icon,
  label,
  count,
  variant,
}: {
  icon: typeof AlertTriangle;
  label: string;
  count: number;
  variant: 'destructive' | 'warning' | 'success';
}) {
  const colors = {
    destructive: 'border-danger/20 bg-danger/5 text-danger',
    warning: 'border-warning/20 bg-warning/5 text-warning',
    success: 'border-success/20 bg-success/5 text-success',
  };

  return (
    <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${colors[variant]}`}>
      <Icon className="h-4 w-4" />
      <div>
        <p className="text-lg font-bold">{count}</p>
        <p className="text-[10px]">{label}</p>
      </div>
    </div>
  );
}

export function KnowledgeDebtRadar({ workspaceId }: KnowledgeDebtRadarProps) {
  const [data, setData] = useState<KnowledgeDebtSummary | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const result = await getKnowledgeDebtSummary(workspaceId);
      setData(result);
    } catch (err) {
      console.error('Failed to load knowledge debt:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const healthScore = data.totalDocuments > 0
    ? Math.round((data.healthyCount / data.totalDocuments) * 100)
    : 100;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <h3 className="text-sm font-semibold">지식 부채 레이더</h3>
            <Badge variant="outline" className="text-[10px]">
              {data.totalDocuments}건 모니터링
            </Badge>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={load}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* 건강도 게이지 */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">문서 건강도</span>
            <span className="font-semibold">{healthScore}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-100">
            <div
              className={`h-full rounded-full transition-all ${
                healthScore >= 80 ? 'bg-success' : healthScore >= 60 ? 'bg-warning' : 'bg-danger'
              }`}
              style={{ width: `${healthScore}%` }}
            />
          </div>
        </div>

        {/* 상태 요약 */}
        <div className="grid grid-cols-3 gap-2">
          <StatBadge
            icon={AlertTriangle}
            label="기한 초과"
            count={data.overdueCount}
            variant="destructive"
          />
          <StatBadge
            icon={Clock}
            label="곧 만료"
            count={data.warningCount}
            variant="warning"
          />
          <StatBadge
            icon={CheckCircle2}
            label="정상"
            count={data.healthyCount}
            variant="success"
          />
        </div>

        {/* 팀별 현황 */}
        {Object.keys(data.byTeam).length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Users className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">팀별 현황</span>
            </div>
            <div className="space-y-1">
              {Object.entries(data.byTeam)
                .sort(([, a], [, b]) => b.overdue - a.overdue)
                .slice(0, 5)
                .map(([team, stats]) => (
                  <div key={team} className="flex items-center justify-between text-xs">
                    <span className="text-surface-700">{team}</span>
                    <div className="flex gap-2">
                      {stats.overdue > 0 && (
                        <Badge variant="destructive" className="text-[10px]">
                          {stats.overdue} 초과
                        </Badge>
                      )}
                      {stats.warning > 0 && (
                        <Badge variant="secondary" className="text-[10px]">
                          {stats.warning} 주의
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* 최고 위험 문서 Top 5 */}
        {data.staleDocuments.length > 0 && (
          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground">
              가장 오래된 미갱신 문서
            </span>
            <div className="space-y-1">
              {data.staleDocuments.slice(0, 5).map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between rounded-md border border-danger/10 bg-danger/5 px-2.5 py-1.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-surface-800">
                      {doc.title}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {doc.ownerTeam ?? '미지정'} · {doc.domain ?? '일반'}
                    </p>
                  </div>
                  <Badge variant="destructive" className="ml-2 shrink-0 text-[10px]">
                    {doc.overdueDays}일 초과
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
