"use client";
import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { LeavePopover } from "./LeavePopover";

type Leave = {
  id: string;
  userId: string;
  userName: string;
  type: string;
  startDate: string;
  endDate: string;
  hours: string;
  reason?: string | null;
};
type Holiday = { date: string; name: string };

export function ScheduleCalendar({
  month,
  leaves,
  holidays,
  currentUserId,
}: {
  month: string;
  leaves: Leave[];
  holidays: Holiday[];
  currentUserId: string;
  isAdmin: boolean;
}) {
  const t = useTranslations("Contractors");
  const router = useRouter();
  const [, start] = useTransition();
  const [dragStart, setDragStart] = useState<string | null>(null);
  const [dragEnd, setDragEnd] = useState<string | null>(null);
  const [popover, setPopover] = useState<{
    start: string;
    end: string;
    x: number;
    y: number;
  } | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    undoId?: string;
  } | null>(null);

  const [y, m] = month.split("-").map(Number) as [number, number];
  const firstDay = new Date(y, m - 1, 1);
  const lastDay = new Date(y, m, 0);
  const startDow = firstDay.getDay();
  const daysInMonth = lastDay.getDate();

  const holidayMap = useMemo(() => {
    const s = new Map<string, string>();
    for (const h of holidays) s.set(h.date, h.name);
    return s;
  }, [holidays]);

  const leavesByDate = useMemo(() => {
    const map = new Map<string, Leave[]>();
    for (const l of leaves) {
      const startD = new Date(l.startDate);
      const endD = new Date(l.endDate);
      for (const d = new Date(startD); d <= endD; d.setDate(d.getDate() + 1)) {
        const key = d.toISOString().slice(0, 10);
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(l);
      }
    }
    return map;
  }, [leaves]);

  const dateKey = (day: number) =>
    `${month}-${String(day).padStart(2, "0")}`;

  const cells: Array<{ date: string | null; day: number | null }> = [];
  for (let i = 0; i < startDow; i++) cells.push({ date: null, day: null });
  for (let d = 1; d <= daysInMonth; d++)
    cells.push({ date: dateKey(d), day: d });

  const handleMouseDown = (date: string) => {
    setDragStart(date);
    setDragEnd(date);
  };
  const handleMouseEnter = (date: string) => {
    if (dragStart) setDragEnd(date);
  };
  const handleMouseUp = (date: string, e: React.MouseEvent) => {
    if (!dragStart) return;
    const sdate = dragStart < date ? dragStart : date;
    const edate = dragStart < date ? date : dragStart;
    setPopover({ start: sdate, end: edate, x: e.clientX, y: e.clientY });
    setDragStart(null);
    setDragEnd(null);
  };

  const apply = async (
    type: string,
    extra?: { timeFrom?: string; timeTo?: string }
  ) => {
    if (!popover) return;
    const res = await fetch(
      `/api/contractors/${currentUserId}/leave-requests`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          startDate: popover.start,
          endDate: popover.end,
          ...extra,
        }),
      }
    );
    if (res.status === 409) {
      alert(t("errors.noActiveContract"));
      setPopover(null);
      return;
    }
    if (!res.ok) {
      alert("신청 실패");
      setPopover(null);
      return;
    }
    const created = await res.json();
    setToast({
      message: t("messages.appliedToast", {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        type: t(`types.${type}` as any),
        hours: Number(created.hours),
      }),
      undoId: created.id,
    });
    setPopover(null);
    start(() => router.refresh());
    setTimeout(() => setToast(null), 3000);
  };

  const undo = async () => {
    if (!toast?.undoId) return;
    await fetch(`/api/leave-requests/${toast.undoId}`, { method: "DELETE" });
    setToast(null);
    start(() => router.refresh());
  };

  const navigateMonth = (delta: number) => {
    const d = new Date(y, m - 1 + delta, 1);
    const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    router.push(`/contractors/schedule?month=${next}`);
  };

  return (
    <div onMouseUp={() => { setDragStart(null); setDragEnd(null); }}>
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <button
          onClick={() => navigateMonth(-1)}
          style={{ padding: "6px 12px" }}
        >
          ‹
        </button>
        <button
          onClick={() => navigateMonth(1)}
          style={{ padding: "6px 12px" }}
        >
          ›
        </button>
        <button
          onClick={() => router.push("/contractors/schedule")}
          style={{ padding: "6px 12px" }}
        >
          오늘
        </button>
        <h2 style={{ margin: 0, flex: 1, textAlign: "center" }}>
          {y}년 {m}월
        </h2>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          border: "1px solid var(--line)",
          borderRadius: 6,
        }}
      >
        {["일", "월", "화", "수", "목", "금", "토"].map((w, i) => (
          <div
            key={w}
            style={{
              padding: 8,
              textAlign: "center",
              fontSize: 12,
              fontWeight: 600,
              background: "var(--panel)",
              borderBottom: "1px solid var(--line)",
              color: i === 0 || i === 6 ? "red" : undefined,
            }}
          >
            {w}
          </div>
        ))}
        {cells.map((c, idx) => {
          if (!c.date)
            return (
              <div
                key={idx}
                style={{
                  minHeight: 100,
                  background: "var(--surface-50, #fafafa)",
                }}
              />
            );
          const dow = (startDow + (c.day! - 1)) % 7;
          const isWeekend = dow === 0 || dow === 6;
          const holidayName = holidayMap.get(c.date);
          const inDrag =
            dragStart &&
            dragEnd &&
            ((dragStart <= c.date && c.date <= dragEnd) ||
              (dragEnd <= c.date && c.date <= dragStart));
          const dayLeaves = leavesByDate.get(c.date) ?? [];
          return (
            <div
              key={idx}
              data-date={c.date}
              onMouseDown={() => handleMouseDown(c.date!)}
              onMouseEnter={() => handleMouseEnter(c.date!)}
              onMouseUp={(e) => handleMouseUp(c.date!, e)}
              style={{
                minHeight: 100,
                padding: 6,
                borderRight: "1px solid var(--line)",
                borderBottom: "1px solid var(--line)",
                background: inDrag
                  ? "rgba(0,112,243,0.12)"
                  : holidayName
                  ? "rgba(255,0,0,0.08)"
                  : isWeekend
                  ? "rgba(255,0,0,0.04)"
                  : "white",
                userSelect: "none",
                cursor: "pointer",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  color:
                    isWeekend || holidayName ? "red" : "var(--ink)",
                }}
              >
                {c.day}
                {holidayName && (
                  <span
                    style={{ fontSize: 10, marginLeft: 4, color: "red" }}
                  >
                    {holidayName}
                  </span>
                )}
              </div>
              {dayLeaves.slice(0, 3).map((l) => (
                <div
                  key={l.id}
                  style={{
                    marginTop: 2,
                    background: "#e8f5e9",
                    color: "#1b5e20",
                    padding: "1px 4px",
                    borderRadius: 3,
                    fontSize: 10.5,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {l.userName}: {t(`types.${l.type}` as any)}
                  {l.type !== "sick" &&
                    l.type !== "public" &&
                    ` (${Number(l.hours)}h)`}
                </div>
              ))}
              {dayLeaves.length > 3 && (
                <div style={{ fontSize: 10, color: "var(--muted)" }}>
                  +{dayLeaves.length - 3}…
                </div>
              )}
            </div>
          );
        })}
      </div>
      {popover && (
        <LeavePopover
          start={popover.start}
          end={popover.end}
          x={popover.x}
          y={popover.y}
          holidays={holidays}
          onPick={(type, extra) => apply(type, extra)}
          onCancel={() => setPopover(null)}
        />
      )}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            background: "#111",
            color: "white",
            padding: "10px 16px",
            borderRadius: 8,
            display: "flex",
            gap: 12,
            alignItems: "center",
            zIndex: 50,
          }}
        >
          <span>{toast.message}</span>
          {toast.undoId && (
            <button
              onClick={undo}
              style={{
                background: "#444",
                color: "#ff9",
                border: 0,
                padding: "4px 10px",
                borderRadius: 4,
                cursor: "pointer",
              }}
            >
              {t("messages.undo")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
