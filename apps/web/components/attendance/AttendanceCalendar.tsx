'use client';

import * as React from 'react';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { AttendanceRecord } from '@/lib/queries/attendance';
import { format, parseISO } from 'date-fns';

type StatusColor = {
  bg: string;
  dot: string;
  label: string;
};

const STATUS_COLORS: Record<string, StatusColor> = {
  present:    { bg: 'bg-green-100',  dot: 'bg-green-500',  label: 'Present' },
  late:       { bg: 'bg-yellow-100', dot: 'bg-yellow-500', label: 'Late' },
  absent:     { bg: 'bg-red-100',    dot: 'bg-red-500',    label: 'Absent' },
  remote:     { bg: 'bg-blue-100',   dot: 'bg-blue-500',   label: 'Remote' },
  'half-day': { bg: 'bg-purple-100', dot: 'bg-purple-500', label: 'Half-day' },
};

interface AttendanceCalendarProps {
  records: AttendanceRecord[];
  month: string; // YYYY-MM
}

function formatTime(ts: Date | string | null): string {
  if (!ts) return '—';
  const d = typeof ts === 'string' ? new Date(ts) : ts;
  return format(d, 'HH:mm');
}

function formatDuration(checkIn: Date | string | null, checkOut: Date | string | null): string {
  if (!checkIn || !checkOut) return '—';
  const inMs = new Date(checkIn).getTime();
  const outMs = new Date(checkOut).getTime();
  const diffMin = Math.round((outMs - inMs) / 60000);
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  return `${h}h ${m}m`;
}

export function AttendanceCalendar({ records, month }: AttendanceCalendarProps) {
  const parts = month.split('-');
  const year = Number(parts[0]);
  const mon = Number(parts[1]);
  const displayMonth = new Date(year, mon - 1, 1);

  // Build a map: dateStr (YYYY-MM-DD) -> record
  const recordMap = React.useMemo(() => {
    const map: Record<string, AttendanceRecord> = {};
    for (const r of records) {
      map[r.attendDate] = r;
    }
    return map;
  }, [records]);

  function DayContent({ date, displayMonth: dm }: { date: Date; displayMonth: Date }) {
    if (date.getMonth() !== dm.getMonth()) return <div />;

    const dateStr = format(date, 'yyyy-MM-dd');
    const record = recordMap[dateStr];
    const status = record?.status ?? null;
    const colors = status ? STATUS_COLORS[status] : null;

    return (
      <Popover>
        <PopoverTrigger asChild>
          <div
            className={cn(
              'relative flex h-full w-full flex-col items-center justify-start rounded-md pt-1',
              colors?.bg,
              record && 'cursor-pointer',
            )}
          >
            <span className="text-sm font-medium leading-none">{date.getDate()}</span>
            {colors && (
              <span
                className={cn('mt-1 h-1.5 w-1.5 rounded-full', colors.dot)}
                aria-hidden="true"
              />
            )}
          </div>
        </PopoverTrigger>
        {record && (
          <PopoverContent className="w-56 p-3" side="bottom" align="center">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span
                  className={cn('h-2 w-2 rounded-full', colors?.dot ?? 'bg-gray-400')}
                  aria-hidden="true"
                />
                <span className="text-sm font-semibold">
                  {colors?.label ?? record.status}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-3 text-xs text-gray-500">
                <span>Check-in</span>
                <span className="font-medium text-gray-900">
                  {formatTime(record.checkIn)}
                </span>
                <span>Check-out</span>
                <span className="font-medium text-gray-900">
                  {formatTime(record.checkOut)}
                </span>
                <span>Duration</span>
                <span className="font-medium text-gray-900">
                  {formatDuration(record.checkIn, record.checkOut)}
                </span>
              </div>
              {record.note && (
                <p className="text-xs text-gray-500 border-t pt-1 mt-1">{record.note}</p>
              )}
            </div>
          </PopoverContent>
        )}
      </Popover>
    );
  }

  return (
    <div className="w-full overflow-auto">
      <Calendar
        mode="single"
        month={displayMonth}
        onMonthChange={() => {}}
        components={{ Day: DayContent }}
        classNames={{
          months: 'flex flex-col sm:flex-row gap-4',
          month: 'space-y-4 w-full',
          table: 'w-full border-collapse',
          head_row: 'flex',
          head_cell: 'text-gray-500 rounded-md w-full font-normal text-xs',
          row: 'flex w-full mt-2',
          cell: cn(
            'relative h-16 w-full p-0 text-center text-sm focus-within:relative focus-within:z-20',
          ),
          day: 'h-full w-full p-0 font-normal',
          day_outside: 'opacity-30',
          day_disabled: 'text-gray-400 opacity-50',
        }}
      />
      {/* Legend */}
      <div className="mt-4 flex flex-wrap gap-3">
        {Object.entries(STATUS_COLORS).map(([key, val]) => (
          <div key={key} className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className={cn('h-2.5 w-2.5 rounded-full', val.dot)} />
            {val.label}
          </div>
        ))}
      </div>
    </div>
  );
}
