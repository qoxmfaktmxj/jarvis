import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getSession } from '@jarvis/auth/session';
import { hasPermission } from '@jarvis/auth/rbac';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { getMonthlyAttendance } from '@/lib/queries/attendance';
import { AttendanceCalendar } from '@/components/attendance/AttendanceCalendar';
import { AttendanceTable } from '@/components/attendance/AttendanceTable';
import { CheckInButton } from '@/components/attendance/CheckInButton';
import { Skeleton } from '@/components/ui/skeleton';
import type { PageProps } from '@jarvis/shared/types/page';
import { format } from 'date-fns';

export const metadata = { title: 'Attendance' };

async function AttendanceContent({ month, userId, workspaceId }: {
  month: string;
  userId: string;
  workspaceId: string;
}) {
  const records = await getMonthlyAttendance(workspaceId, userId, month);
  const today = format(new Date(), 'yyyy-MM-dd');
  const todayRecord = records.find((r) => r.attendDate === today) ?? null;

  return (
    <div className="space-y-6">
      {/* Check-in/out action */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">Today, {format(new Date(), 'MMMM d, yyyy')}</p>
          {todayRecord?.checkIn && (
            <p className="text-xs text-gray-400 mt-0.5">
              Checked in at {format(new Date(todayRecord.checkIn), 'HH:mm')}
            </p>
          )}
        </div>
        <CheckInButton todayRecord={todayRecord} />
      </div>

      {/* Calendar */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Monthly Overview
        </h2>
        <AttendanceCalendar records={records} month={month} />
      </section>

      {/* Table */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Daily Records
        </h2>
        <AttendanceTable records={records} month={month} />
      </section>
    </div>
  );
}

export default async function AttendancePage({ searchParams }: PageProps) {
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
    <div className="container mx-auto max-w-5xl py-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Attendance</h1>
          <p className="text-sm text-gray-500">Track your check-in / check-out records.</p>
        </div>
      </div>

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
