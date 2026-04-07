'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { LogIn, LogOut, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import type { AttendanceRecord } from '@/lib/queries/attendance';

interface CheckInButtonProps {
  todayRecord: AttendanceRecord | null;
}

export function CheckInButton({ todayRecord }: CheckInButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const [currentTime, setCurrentTime] = React.useState<string>('');
  const [hovered, setHovered] = React.useState(false);

  React.useEffect(() => {
    const tick = () => setCurrentTime(format(new Date(), 'HH:mm:ss'));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const hasCheckedIn = Boolean(todayRecord?.checkIn);
  const hasCheckedOut = Boolean(todayRecord?.checkOut);
  const action: 'check-in' | 'check-out' | null = !hasCheckedIn
    ? 'check-in'
    : !hasCheckedOut
    ? 'check-out'
    : null;

  async function handleClick() {
    if (!action || loading) return;
    setLoading(true);
    try {
      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error ?? 'Failed to record attendance');
        return;
      }
      router.refresh();
    } catch {
      alert('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (!action) {
    return (
      <div className="flex items-center gap-2 rounded-lg border bg-gray-50 px-4 py-2 text-sm text-gray-500">
        <LogOut className="h-4 w-4" aria-hidden="true" />
        <span>Checked out at {format(new Date(todayRecord!.checkOut!), 'HH:mm')}</span>
      </div>
    );
  }

  return (
    <Button
      variant={action === 'check-in' ? 'default' : 'secondary'}
      onClick={handleClick}
      disabled={loading}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn('gap-2 min-w-36', action === 'check-in' && 'bg-green-600 hover:bg-green-700')}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : action === 'check-in' ? (
        <LogIn className="h-4 w-4" aria-hidden="true" />
      ) : (
        <LogOut className="h-4 w-4" aria-hidden="true" />
      )}
      {hovered ? currentTime : action === 'check-in' ? 'Check In' : 'Check Out'}
    </Button>
  );
}
