import Link from 'next/link';
import {
  Plus,
  ArrowRight,
  Rocket,
  Users,
  Wrench,
  HelpCircle,
  BookText,
  GitBranch,
  ClipboardCheck,
  AlertTriangle,
  FileText,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';
import { requirePageSession } from '@/lib/server/page-auth';
import { hasPermission } from '@jarvis/auth/rbac';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { getPagesByType } from '@/lib/queries/knowledge';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/patterns/PageHeader';

export const dynamic = 'force-dynamic';

type SectionKey =
  | 'onboarding'
  | 'hr-policy'
  | 'tool-guide'
  | 'faq'
  | 'glossary'
  | 'runbook'
  | 'decision'
  | 'incident';

interface HubSection {
  label: string;
  type: SectionKey;
  href: string;
  Icon: React.ComponentType<{ className?: string }>;
  blurb: string;
}

const HUB_SECTIONS: readonly HubSection[] = [
  { label: 'Onboarding', type: 'onboarding', href: '/knowledge/onboarding', Icon: Rocket, blurb: '입사/이동 첫 30일' },
  { label: 'HR Policies', type: 'hr-policy', href: '/knowledge/hr', Icon: Users, blurb: '근태·휴가·복리후생' },
  { label: 'Tool Guides', type: 'tool-guide', href: '/knowledge/tools', Icon: Wrench, blurb: '사내 시스템 사용법' },
  { label: 'FAQ', type: 'faq', href: '/knowledge/faq', Icon: HelpCircle, blurb: '자주 묻는 질문' },
  { label: 'Glossary', type: 'glossary', href: '/knowledge/glossary', Icon: BookText, blurb: '용어 정리' },
  { label: 'Runbooks', type: 'runbook', href: '/knowledge?pageType=runbook', Icon: GitBranch, blurb: '운영 절차' },
  { label: 'Decisions', type: 'decision', href: '/knowledge?pageType=decision', Icon: ClipboardCheck, blurb: '의사결정 로그' },
  { label: 'Incidents', type: 'incident', href: '/knowledge?pageType=incident', Icon: AlertTriangle, blurb: '장애 포스트모텀' },
];

export default async function KnowledgeHomePage() {
  const session = await requirePageSession(PERMISSIONS.KNOWLEDGE_READ, '/dashboard');

  const canCreate = hasPermission(session, PERMISSIONS.KNOWLEDGE_CREATE);

  const sectionData = await Promise.all(
    HUB_SECTIONS.map(async (section, idx) => ({
      ...section,
      pages: await getPagesByType(
        session.workspaceId,
        session.permissions ?? [],
        section.type,
        idx < 2 ? 4 : 3,
      ),
    })),
  );

  const hero = sectionData.slice(0, 2);
  const reference = sectionData.slice(2, 5);
  const operations = sectionData.slice(5);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <PageHeader
        kicker="Knowledge"
        title="Knowledge Base"
        subtitle="회사의 모든 문서·가이드·의사결정이 한곳에."
        actions={
          canCreate ? (
            <Button asChild>
              <Link href="/knowledge/new">
                <Plus className="h-4 w-4" />
                새 페이지
              </Link>
            </Button>
          ) : null
        }
      />

      <div className="space-y-10">
        {/* ── Hero: Onboarding + HR Policies ── */}
        <section>
          <SectionEyebrow label="Get started" count={hero.reduce((a, s) => a + s.pages.length, 0)} />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {hero.map((section) => (
              <HeroCard key={section.type} section={section} />
            ))}
          </div>
        </section>

        {/* ── Reference: FAQ / Glossary / Tools ── */}
        <section>
          <SectionEyebrow label="Reference" count={reference.reduce((a, s) => a + s.pages.length, 0)} />
          <div className="overflow-hidden rounded-md border border-surface-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
            {reference.map((section, idx) => (
              <ReferenceRow
                key={section.type}
                section={section}
                isLast={idx === reference.length - 1}
              />
            ))}
          </div>
        </section>

        {/* ── Operations: Runbooks / Decisions / Incidents ── */}
        <section>
          <SectionEyebrow label="Operations" count={operations.reduce((a, s) => a + s.pages.length, 0)} />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {operations.map((section) => (
              <OperationsCard key={section.type} section={section} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function SectionEyebrow({ label, count }: { label: string; count: number }) {
  return (
    <div className="mb-3 flex items-baseline justify-between">
      <div className="flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-isu-500" aria-hidden />
        <p className="text-display text-[10px] font-semibold uppercase tracking-[0.18em] text-surface-700">
          {label}
        </p>
      </div>
      <span className="text-display text-[10px] tabular-nums text-surface-400">
        {count} 문서
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

type SectionWithPages = HubSection & {
  pages: Array<{ id: string; title: string; updatedAt?: Date | string | null }>;
};

function HeroCard({ section }: { section: SectionWithPages }) {
  const { Icon } = section;
  return (
    <article className="group relative overflow-hidden rounded-md border border-surface-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-all hover:-translate-y-[1px] hover:border-isu-200 hover:shadow-[0_10px_28px_-14px_rgba(28,77,167,0.18)]">
      {/* Accent stripe */}
      <span className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-isu-500/70 via-isu-500/40 to-transparent" aria-hidden />

      <header className="flex items-start justify-between gap-3 border-b border-surface-100 px-5 pb-3 pt-5">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-isu-50 text-isu-600 ring-1 ring-inset ring-isu-200">
            <Icon className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-[15px] font-semibold text-surface-900">{section.label}</h3>
            <p className="text-[12px] text-surface-500">{section.blurb}</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" asChild>
          <Link href={section.href} className="gap-1 text-isu-600 hover:text-isu-700">
            전체 <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </header>

      <div className="divide-y divide-surface-100 px-2 py-1.5">
        {section.pages.length === 0 ? (
          <p className="px-3 py-6 text-center text-[13px] italic text-surface-400">
            아직 문서가 없습니다.
          </p>
        ) : (
          section.pages.map((page) => (
            <Link
              key={page.id}
              href={`/knowledge/${page.id}`}
              className="flex items-center justify-between gap-3 rounded-[5px] px-3 py-2 text-[13px] transition-colors hover:bg-isu-50/60"
            >
              <span className="flex min-w-0 items-center gap-2">
                <FileText className="h-3.5 w-3.5 shrink-0 text-surface-400" />
                <span className="truncate font-medium text-surface-800 group-hover:text-isu-700">
                  {page.title}
                </span>
              </span>
              <span className="text-display shrink-0 text-[11px] tabular-nums text-surface-400">
                {formatRelative(page.updatedAt)}
              </span>
            </Link>
          ))
        )}
      </div>
    </article>
  );
}

/* -------------------------------------------------------------------------- */

function ReferenceRow({ section, isLast }: { section: SectionWithPages; isLast: boolean }) {
  const { Icon } = section;
  return (
    <article
      className={`grid grid-cols-1 items-center gap-x-5 gap-y-2 px-5 py-4 md:grid-cols-[240px_1fr_auto] ${
        isLast ? '' : 'border-b border-surface-100'
      }`}
    >
      <div className="flex items-center gap-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-surface-50 text-surface-600 ring-1 ring-inset ring-surface-200">
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div>
          <h3 className="text-[13px] font-semibold text-surface-900">{section.label}</h3>
          <p className="text-display text-[11px] text-surface-400">{section.blurb}</p>
        </div>
      </div>

      <div className="flex min-w-0 flex-wrap gap-x-4 gap-y-1 text-[13px]">
        {section.pages.length === 0 ? (
          <span className="italic text-surface-400">아직 없음</span>
        ) : (
          section.pages.map((page) => (
            <Link
              key={page.id}
              href={`/knowledge/${page.id}`}
              className="max-w-[28ch] truncate text-surface-700 decoration-isu-400 underline-offset-[3px] hover:text-isu-700 hover:underline"
            >
              {page.title}
            </Link>
          ))
        )}
      </div>

      <Link
        href={section.href}
        className="text-display inline-flex items-center gap-1 text-[11px] font-semibold text-isu-600 hover:text-isu-700 md:justify-self-end"
      >
        전체 보기
        <ArrowRight className="h-3 w-3" />
      </Link>
    </article>
  );
}

/* -------------------------------------------------------------------------- */

function OperationsCard({ section }: { section: SectionWithPages }) {
  const { Icon } = section;
  return (
    <article className="flex flex-col rounded-md border border-surface-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-[5px] bg-surface-50 text-surface-600 ring-1 ring-inset ring-surface-200">
            <Icon className="h-3 w-3" />
          </span>
          <h3 className="text-[13px] font-semibold text-surface-900">{section.label}</h3>
        </div>
        <span className="text-display rounded-full bg-surface-50 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-surface-600 ring-1 ring-inset ring-surface-200">
          {section.pages.length}
        </span>
      </header>

      <div className="mt-3 flex-1 space-y-0.5">
        {section.pages.length === 0 ? (
          <p className="py-4 text-center text-[12px] italic text-surface-400">없음</p>
        ) : (
          section.pages.map((page) => (
            <Link
              key={page.id}
              href={`/knowledge/${page.id}`}
              className="flex items-center justify-between gap-2 rounded px-2 py-1.5 text-[12.5px] transition-colors hover:bg-isu-50/60"
            >
              <span className="truncate font-medium text-surface-800 hover:text-isu-700">
                {page.title}
              </span>
              <span className="text-display shrink-0 text-[10px] tabular-nums text-surface-400">
                {formatRelative(page.updatedAt)}
              </span>
            </Link>
          ))
        )}
      </div>

      <Link
        href={section.href}
        className="text-display mt-3 inline-flex items-center gap-1 self-start text-[11px] font-semibold text-isu-600 hover:text-isu-700"
      >
        전체 보기 <ArrowRight className="h-3 w-3" />
      </Link>
    </article>
  );
}

/* -------------------------------------------------------------------------- */

function formatRelative(d: Date | string | null | undefined): string {
  if (!d) return '';
  return formatDistanceToNow(new Date(d), { addSuffix: true, locale: ko });
}
