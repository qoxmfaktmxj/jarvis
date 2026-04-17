'use client';

import { Badge } from '@/components/ui/badge';
import type { InfraRunbookMeta } from './types';

type InfraRunbookHeaderProps = {
  meta: InfraRunbookMeta;
};

/**
 * Structured info panel shown above the markdown body on
 * `type: infra-runbook` pages. Renders every populated field from
 * `frontmatter.infra` as a compact key/value grid so 담당자 can scan
 * 접속·DB·SVN·계정 정보 바로 보고, 아래 본문에서 절차·이력을 읽는다.
 *
 * Fields without data are omitted entirely (not shown as "(정보 없음)")
 * to keep the panel dense.
 */
export function InfraRunbookHeader({ meta }: InfraRunbookHeaderProps) {
  const rows: Array<{ label: string; value: string; mono?: boolean }> = [];

  if (meta.companyCd) rows.push({ label: '회사 코드', value: meta.companyCd });
  if (meta.envType) rows.push({ label: '환경', value: meta.envType });
  if (meta.connectCd) rows.push({ label: '접속 방식', value: meta.connectCd });
  if (meta.domainAddr) {
    rows.push({ label: '도메인 / URL', value: meta.domainAddr, mono: true });
  }
  if (meta.loginInfo) {
    rows.push({ label: '로그인 계정', value: meta.loginInfo, mono: true });
  }
  if (meta.dbConnectInfo) {
    rows.push({ label: 'DB 접속', value: meta.dbConnectInfo, mono: true });
  }
  if (meta.dbUserInfo) {
    rows.push({ label: 'DB 계정', value: meta.dbUserInfo, mono: true });
  }
  if (meta.svnAddr) rows.push({ label: 'SVN', value: meta.svnAddr, mono: true });
  if (meta.srcInfo) {
    rows.push({ label: '소스 경로', value: meta.srcInfo, mono: true });
  }
  if (meta.classInfo) {
    rows.push({ label: '클래스 / WAR', value: meta.classInfo, mono: true });
  }
  if (
    meta.vpnFileSeq !== null &&
    meta.vpnFileSeq !== undefined &&
    String(meta.vpnFileSeq).length > 0
  ) {
    rows.push({ label: 'VPN 파일 SEQ', value: String(meta.vpnFileSeq), mono: true });
  }

  if (rows.length === 0) return null;

  return (
    <aside
      className="rounded-lg border border-surface-200 bg-surface-50 p-4 space-y-3"
      aria-label="인프라 메타 정보"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">infra-runbook</Badge>
        {meta.companyCd && (
          <Badge variant="secondary">company/{meta.companyCd.toLowerCase()}</Badge>
        )}
        {meta.envType && <Badge variant="secondary">env/{meta.envType}</Badge>}
      </div>
      <dl className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-x-4 gap-y-2 text-sm">
        {rows.map((row) => (
          <div key={row.label} className="contents">
            <dt className="text-surface-500 font-medium sm:text-right">{row.label}</dt>
            <dd
              className={
                row.mono
                  ? 'text-surface-800 font-mono break-all'
                  : 'text-surface-800 break-words'
              }
            >
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}
