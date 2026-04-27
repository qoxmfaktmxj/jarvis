'use client';

import { Server, Terminal, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';
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

type Row = { label: string; value: string; mono?: boolean };

const ENV_STYLES: Record<string, string> = {
  prod: 'bg-red-50 text-red-700 ring-red-600/25',
  production: 'bg-red-50 text-red-700 ring-red-600/25',
  stg: 'bg-amber-50 text-amber-800 ring-amber-600/25',
  staging: 'bg-amber-50 text-amber-800 ring-amber-600/25',
  qa: 'bg-amber-50 text-amber-800 ring-amber-600/25',
  dev: 'bg-[--brand-primary-bg] text-[--brand-primary-text] ring-[--brand-primary]/25',
  local: 'bg-[--bg-surface] text-[--fg-primary] ring-[--border-default]',
};

export function InfraRunbookHeader({ meta }: InfraRunbookHeaderProps) {
  const rows: Row[] = [];

  if (meta.companyCd) rows.push({ label: '회사 코드', value: meta.companyCd });
  if (meta.connectCd) rows.push({ label: '접속 방식', value: meta.connectCd });
  if (meta.domainAddr) rows.push({ label: '도메인 / URL', value: meta.domainAddr, mono: true });
  if (meta.loginInfo) rows.push({ label: '로그인 계정', value: meta.loginInfo, mono: true });
  if (meta.dbConnectInfo) rows.push({ label: 'DB 접속', value: meta.dbConnectInfo, mono: true });
  if (meta.dbUserInfo) rows.push({ label: 'DB 계정', value: meta.dbUserInfo, mono: true });
  if (meta.svnAddr) rows.push({ label: 'SVN', value: meta.svnAddr, mono: true });
  if (meta.srcInfo) rows.push({ label: '소스 경로', value: meta.srcInfo, mono: true });
  if (meta.classInfo) rows.push({ label: '클래스 / WAR', value: meta.classInfo, mono: true });
  if (
    meta.vpnFileSeq !== null &&
    meta.vpnFileSeq !== undefined &&
    String(meta.vpnFileSeq).length > 0
  ) {
    rows.push({ label: 'VPN 파일 SEQ', value: String(meta.vpnFileSeq), mono: true });
  }

  if (rows.length === 0) return null;

  const envKey = meta.envType?.toLowerCase() ?? '';
  const envChip = ENV_STYLES[envKey] ?? 'bg-[--bg-surface] text-[--fg-primary] ring-[--border-default]';

  return (
    <aside
      className="overflow-hidden rounded-md border border-[--border-default] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]"
      aria-label="인프라 메타 정보"
    >
      {/* Header bar */}
      <div className="flex items-center gap-2 border-b border-[--border-default] bg-[--bg-surface]/70 px-4 py-2.5">
        <span className="flex h-6 w-6 items-center justify-center rounded-[5px] bg-[--brand-primary-bg] text-[--brand-primary] ring-1 ring-inset ring-[--brand-primary-bg]">
          <Server className="h-3.5 w-3.5" />
        </span>
        <span className="text-display text-[10px] font-semibold uppercase tracking-[0.14em] text-[--brand-primary]">
          Infra runbook
        </span>
        <span className="ml-auto flex flex-wrap items-center gap-1.5">
          {meta.companyCd && (
            <span className="inline-flex items-center rounded-full bg-[--bg-surface] px-2 py-0.5 text-[10px] font-semibold text-[--fg-secondary] ring-1 ring-inset ring-[--border-default]">
              company/{meta.companyCd.toLowerCase()}
            </span>
          )}
          {meta.envType && (
            <span
              className={cn(
                'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset',
                envChip,
              )}
            >
              {meta.envType}
            </span>
          )}
        </span>
      </div>

      {/* Grid body */}
      <dl className="grid grid-cols-1 gap-x-6 gap-y-0 px-4 py-1 sm:grid-cols-2">
        {rows.map((row, idx) => (
          <MetaRow key={row.label} row={row} isLast={idx === rows.length - 1} />
        ))}
      </dl>

      {/* Footer hint */}
      <div className="flex items-center gap-1.5 border-t border-[--border-soft] bg-[--bg-surface]/50 px-4 py-2 text-[11px] text-[--fg-secondary]">
        <Terminal className="h-3 w-3 text-[--fg-muted]" />
        <span className="text-display">
          명령·값은 클릭하여 복사하세요. 민감 정보는 Vault를 먼저 확인.
        </span>
      </div>
    </aside>
  );
}

function MetaRow({ row, isLast }: { row: Row; isLast: boolean }) {
  return (
    <div
      className={cn(
        'grid grid-cols-[auto_1fr] items-start gap-x-3 py-2 sm:border-b sm:border-[--border-soft]',
        isLast && 'sm:border-b-0',
      )}
    >
      <dt className="text-display w-[110px] shrink-0 pt-0.5 text-[11px] font-medium uppercase tracking-wide text-[--fg-secondary]">
        {row.label}
      </dt>
      <dd className="group flex min-w-0 items-start gap-1.5">
        <span
          className={cn(
            'min-w-0 break-all text-[13px] text-[--fg-primary]',
            row.mono && 'font-mono text-[12.5px] tabular-nums',
          )}
        >
          {row.value}
        </span>
        {row.mono && (
          <button
            type="button"
            onClick={() => {
              if (typeof navigator !== 'undefined' && navigator.clipboard) {
                void navigator.clipboard.writeText(row.value);
              }
            }}
            className="ml-auto mt-0.5 shrink-0 rounded p-0.5 text-[--fg-muted] opacity-0 transition-all hover:bg-[--bg-surface] hover:text-[--brand-primary] group-hover:opacity-100"
            aria-label={`${row.label} 복사`}
            title="복사"
          >
            <Copy className="h-3 w-3" />
          </button>
        )}
      </dd>
    </div>
  );
}
