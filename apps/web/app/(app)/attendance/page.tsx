import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { getSession } from '@jarvis/auth/session';
import { hasPermission } from '@jarvis/auth/rbac';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { getMonthlyAttendance } from '@/lib/queries/attendance';
import { AttendanceCalendar } from '@/components/attendance/AttendanceCalendar';
import { AttendanceTable } from '@/components/attendance/AttendanceTable';
import { CheckInButton } from '@/components/attendance/CheckInButton';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/patterns/PageHeader';
import { isoWeekNumber } from '@/lib/date-utils';
import type { PageProps } from '@jarvis/shared/types/page';
import { format } from 'date-fns';

export const metadata = { title: '출퇴근' };

async function AttendanceContent({ month, userId, workspaceId }: {
  month: string;
  userId: string;
  workspaceId: string;
}) {
  const t = await getTranslations("Attendance");
  const records = await getMonthlyAttendance(workspaceId, userId, month);
  const today = format(new Date(), 'yyyy-MM-dd');
  const todayRecord = records.find((r) => r.attendDate === today) ?? null;

  return (
    <div className="space-y-6">
      {/* Check-in/out action */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{t("todayFormat", { date: format(new Date(), 'MMMM d, yyyy') })}</p>
          {todayRecord?.checkIn && (
            <p className="text-xs text-surface-400 mt-0.5">
              {t("checkedIn", { time: format(new Date(todayRecord.checkIn), 'HH:mm') })}
            </p>
          )}
        </div>
        <CheckInButton todayRecord={todayRecord} />
      </div>

      {/* Calendar */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          {t("monthlyOverview")}
        </h2>
        <AttendanceCalendar records={records} month={month} />
      </section>

      {/* Table */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          {t("dailyRecords")}
        </h2>
        <AttendanceTable records={records} month={month} />
      </section>
    </div>
  );
}

export default async function AttendancePage({ searchParams }: PageProps) {
  const t = await getTranslations("Attendance");
  const cookieStore = await cookies();
  const sessionId = cookieStore.get('sessionId')?.value;
  const session = sessionId ? await getSession(sessionId) : null;
  if (!session) redirect('/login');
  if (!hasPermission(session, PERMISSIONS.ATTENDANCE_READ)) redirect('/dashboard');

  const sp = await searchParams;
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const month =
    typeof sp?.month === 'string' && /^\d{4}-\d{2}$/.test(sp.month)
      ? sp.month
      : defaultMonth;

  return (
    <div className="container mx-auto max-w-5xl py-6 space-y-8">
      <PageHeader
        accent={`W${isoWeekNumber(new Date())}`}
        eyebrow="Attendance"
        title={t("title")}
        description={t("description")}
      />

      <Suspense
        fallback={
          <div className="space-y-4">
            <Skeleton className="h-[340px] w-full rounded-xl" />
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        }
      >
        <AttendanceContent
          month={month}
          userId={session.userId}
          workspaceId={session.workspaceId}
        />
      </Suspense>
    </div>
  );
}
