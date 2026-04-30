"use client";
import { useState, useMemo, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { LeaveRequestModal } from "./LeaveRequestModal";
import { LeaveDetailModal, type LeaveDetailLeave } from "./LeaveDetailModal";

type Leave = {
  id: string;
  userId: string;
  userName: string;
  type: string;
  startDate: string;
  endDate: string;
  hours: string;
  reason?: string | null;
  status?: string;
  timeFrom?: string | null;
  timeTo?: string | null;
};
type Holiday = { date: string; name: string };

const TYPE_TONE: Record<string, { bg: string; fg: string; border: string }> = {
  day_off: {
    bg: "var(--status-done-bg)",
    fg: "var(--status-done-fg)",
    border: "color-mix(in srgb, var(--status-done-fg) 30%, transparent)",
  },
  half_am: {
    bg: "var(--status-warn-bg)",
    fg: "var(--status-warn-fg)",
    border: "color-mix(in srgb, var(--status-warn-fg) 30%, transparent)",
  },
  half_pm: {
    bg: "var(--status-warn-bg)",
    fg: "var(--status-warn-fg)",
    border: "color-mix(in srgb, var(--status-warn-fg) 30%, transparent)",
  },
  hourly: {
    bg: "var(--status-active-bg)",
    fg: "var(--status-active-fg)",
    border: "color-mix(in srgb, var(--status-active-fg) 30%, transparent)",
  },
  sick: {
    bg: "var(--status-danger-bg)",
    fg: "var(--status-danger-fg)",
    border: "color-mix(in srgb, var(--status-danger-fg) 30%, transparent)",
  },
  public: {
    bg: "var(--status-decorative-purple-bg)",
    fg: "var(--status-decorative-purple-fg)",
    border: "color-mix(in srgb, var(--status-decorative-purple-fg) 30%, transparent)",
  },
};

const FALLBACK_TONE = TYPE_TONE.day_off;

export function ScheduleCalendar({
  month,
  leaves,
  holidays,
  currentUserId,
  currentUserName,
  isAdmin,
}: {
  month: string;
  leaves: Leave[];
  holidays: Holiday[];
  currentUserId: string;
  currentUserName: string;
  isAdmin: boolean;
}) {
  const t = useTranslations("Contractors");
  const router = useRouter();
  const [, start] = useTransition();

  const [dragStart, setDragStart] = useState<string | null>(null);
  const [dragEnd, setDragEnd] = useState<string | null>(null);

  const [requestModal, setRequestModal] = useState<{ start: string; end: string } | null>(null);
  const [detailModal, setDetailModal] = useState<LeaveDetailLeave | null>(null);

  const [toast, setToast] = useState<{ message: string; undoId?: string } | null>(null);

  const [y, m] = month.split("-").map(Number) as [number, number];
  const firstDay = new Date(y, m - 1, 1);
  const lastDay = new Date(y, m, 0);
  const startDow = firstDay.getDay();
  const daysInMonth = lastDay.getDate();
  const todayKey = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

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

  const dateKey = (day: number) => `${month}-${String(day).padStart(2, "0")}`;

  const cells: Array<{ date: string | null; day: number | null }> = [];
  for (let i = 0; i < startDow; i++) cells.push({ date: null, day: null });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ date: dateKey(d), day: d });

  const handleMouseDown = useCallback((date: string) => {
    setDragStart(date);
    setDragEnd(date);
  }, []);
  const handleMouseEnter = useCallback(
    (date: string) => {
      if (dragStart) setDragEnd(date);
    },
    [dragStart],
  );
  const handleMouseUp = useCallback(
    (date: string) => {
      if (!dragStart) return;
      const sdate = dragStart < date ? dragStart : date;
      const edate = dragStart < date ? date : dragStart;
      setRequestModal({ start: sdate, end: edate });
      setDragStart(null);
      setDragEnd(null);
    },
    [dragStart],
  );

  const dateFromTouch = (touch: { clientX: number; clientY: number }): string | null => {
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    if (!el) return null;
    const cell = (el as HTMLElement).closest("[data-date]") as HTMLElement | null;
    return cell?.dataset.date ?? null;
  };
  const handleTouchStart = (e: React.TouchEvent) => {
    const t0 = e.touches[0];
    if (!t0) return;
    const d = dateFromTouch(t0);
    if (!d) return;
    setDragStart(d);
    setDragEnd(d);
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!dragStart) return;
    const t0 = e.touches[0];
    if (!t0) return;
    const d = dateFromTouch(t0);
    if (d) setDragEnd(d);
  };
  const handleTouchEnd = () => {
    if (!dragStart || !dragEnd) {
      setDragStart(null);
      setDragEnd(null);
      return;
    }
    const sdate = dragStart < dragEnd ? dragStart : dragEnd;
    const edate = dragStart < dragEnd ? dragEnd : dragStart;
    setRequestModal({ start: sdate, end: edate });
    setDragStart(null);
    setDragEnd(null);
  };

  const navigateMonth = (delta: number) => {
    const d = new Date(y, m - 1 + delta, 1);
    const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    router.push(`/contractors/schedule?month=${next}`);
  };

  function showToast(message: string, undoId?: string) {
    setToast({ message, undoId });
    setTimeout(() => setToast(null), 3000);
  }

  async function undo() {
    if (!toast?.undoId) return;
    await fetch(`/api/leave-requests/${toast.undoId}`, { method: "DELETE" });
    setToast(null);
    start(() => router.refresh());
  }

  const isToday = (d: string) => d === todayKey;
  const dowFor = (day: number) => (startDow + (day - 1)) % 7;

  return (
    <div
      onMouseUp={() => {
        setDragStart(null);
        setDragEnd(null);
      }}
    >
      {/* Header: month nav + title */}
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <button
          onClick={() => navigateMonth(-1)}
          aria-label="이전 달"
          style={navBtnStyle}
        >
          ‹
        </button>
        <button
          onClick={() => navigateMonth(1)}
          aria-label="다음 달"
          style={navBtnStyle}
        >
          ›
        </button>
        <button
          onClick={() => router.push("/contractors/schedule")}
          style={{ ...navBtnStyle, padding: "6px 14px" }}
        >
          {t("messages.today")}
        </button>
        <h2
          style={{
            margin: 0,
            flex: 1,
            textAlign: "center",
            fontSize: 18,
            fontWeight: 600,
            letterSpacing: "-0.01em",
            color: "var(--fg-primary)",
          }}
        >
          {y}년 {m}월
        </h2>
        <Legend t={t} />
      </div>

      {/* Calendar grid */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          border: "1px solid var(--border-default)",
          borderRadius: 12,
          overflow: "hidden",
          background: "var(--bg-page)",
          boxShadow: "var(--shadow-flat)",
          touchAction: "none",
        }}
      >
        {["일", "월", "화", "수", "목", "금", "토"].map((w, i) => (
          <div
            key={w}
            style={{
              padding: "10px 0",
              textAlign: "center",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              background: "var(--bg-surface)",
              borderBottom: "1px solid var(--border-default)",
              color:
                i === 0
                  ? "var(--status-danger-fg)"
                  : i === 6
                    ? "var(--status-active-fg)"
                    : "var(--fg-secondary)",
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
                  minHeight: 110,
                  background: "var(--bg-surface)",
                  borderRight:
                    (idx + 1) % 7 === 0 ? "none" : "1px solid var(--border-soft)",
                  borderBottom: "1px solid var(--border-soft)",
                }}
              />
            );
          const dow = dowFor(c.day!);
          const isWeekend = dow === 0 || dow === 6;
          const isSun = dow === 0;
          const holidayName = holidayMap.get(c.date);
          const inDrag =
            dragStart &&
            dragEnd &&
            ((dragStart <= c.date && c.date <= dragEnd) ||
              (dragEnd <= c.date && c.date <= dragStart));
          const dayLeaves = leavesByDate.get(c.date) ?? [];
          const today = isToday(c.date);
          const isLastCol = (idx + 1) % 7 === 0;
          const isLastRow = idx >= cells.length - ((cells.length % 7) || 7);

          return (
            <div
              key={idx}
              data-date={c.date}
              onMouseDown={() => handleMouseDown(c.date!)}
              onMouseEnter={() => handleMouseEnter(c.date!)}
              onMouseUp={() => handleMouseUp(c.date!)}
              style={{
                position: "relative",
                minHeight: 110,
                padding: 6,
                borderRight: isLastCol ? "none" : "1px solid var(--border-soft)",
                borderBottom: isLastRow ? "none" : "1px solid var(--border-soft)",
                background: inDrag
                  ? "color-mix(in srgb, var(--brand-primary) 14%, transparent)"
                  : holidayName
                    ? "color-mix(in srgb, var(--status-danger-fg) 6%, transparent)"
                    : isWeekend
                      ? "var(--bg-surface)"
                      : "var(--bg-page)",
                userSelect: "none",
                cursor: "pointer",
                transition: "background 120ms var(--ease-out-quart)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  marginBottom: 4,
                }}
              >
                <span
                  style={{
                    fontFamily: today ? "var(--font-mono)" : undefined,
                    fontSize: 12,
                    fontWeight: today ? 700 : 500,
                    width: today ? 22 : "auto",
                    height: today ? 22 : "auto",
                    display: today ? "inline-flex" : "inline",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: today ? 999 : 0,
                    background: today ? "var(--brand-primary)" : "transparent",
                    color: today
                      ? "#fff"
                      : holidayName || isSun
                        ? "var(--status-danger-fg)"
                        : dow === 6
                          ? "var(--status-active-fg)"
                          : "var(--fg-primary)",
                  }}
                >
                  {c.day}
                </span>
                {holidayName ? (
                  <span
                    style={{
                      fontSize: 10,
                      color: "var(--status-danger-fg)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      flex: 1,
                    }}
                    title={holidayName}
                  >
                    {holidayName}
                  </span>
                ) : null}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {dayLeaves.slice(0, 3).map((l) => {
                  const tone = (TYPE_TONE[l.type] ?? FALLBACK_TONE)!;
                  return (
                    <button
                      key={l.id}
                      type="button"
                      onMouseDown={(e) => {
                        e.stopPropagation();
                      }}
                      onMouseUp={(e) => {
                        e.stopPropagation();
                      }}
                      onTouchStart={(e) => {
                        e.stopPropagation();
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setDetailModal(l);
                      }}
                      style={{
                        textAlign: "left",
                        background: tone.bg,
                        color: tone.fg,
                        border: `1px solid ${tone.border}`,
                        padding: "1px 6px",
                        borderRadius: 4,
                        fontSize: 10.5,
                        fontWeight: 500,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        cursor: "pointer",
                        lineHeight: 1.5,
                      }}
                      title={`${l.userName} · ${t(`types.${l.type}` as Parameters<typeof t>[0])} (${Number(l.hours)}h)${l.reason ? "\n" + l.reason : ""}`}
                    >
                      {l.userName} ·{" "}
                      {t(`types.${l.type}` as Parameters<typeof t>[0])}
                      {l.type !== "sick" &&
                        l.type !== "public" &&
                        ` ${Number(l.hours)}h`}
                    </button>
                  );
                })}
                {dayLeaves.length > 3 && (
                  <div
                    style={{
                      fontSize: 10,
                      color: "var(--fg-secondary)",
                      paddingLeft: 4,
                    }}
                  >
                    +{dayLeaves.length - 3} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div
        style={{
          marginTop: 10,
          fontSize: 11,
          color: "var(--fg-secondary)",
        }}
      >
        {t("messages.dragHint")}
      </div>

      <LeaveRequestModal
        open={requestModal !== null}
        onOpenChange={(v) => (v ? null : setRequestModal(null))}
        applicantId={currentUserId}
        applicantName={currentUserName}
        start={requestModal?.start ?? ""}
        end={requestModal?.end ?? ""}
        holidays={holidays}
        onCreated={(created) => {
          showToast(
            t("messages.appliedToast", {
              type: t(`types.${created.type}` as Parameters<typeof t>[0]),
              hours: Number(created.hours),
            }),
            created.id,
          );
          start(() => router.refresh());
        }}
        onError={(kind) => {
          if (kind === "no_active_contract") {
            alert(t("errors.noActiveContract"));
          } else {
            alert("신청 실패");
          }
        }}
      />

      <LeaveDetailModal
        open={detailModal !== null}
        onOpenChange={(v) => (v ? null : setDetailModal(null))}
        leave={detailModal}
        canEdit={
          !!detailModal &&
          (isAdmin || detailModal.userId === currentUserId)
        }
        onChanged={(kind) => {
          const messages: Record<typeof kind, string> = {
            saved: t("messages.savedToast", {
              type: detailModal
                ? t(`types.${detailModal.type}` as Parameters<typeof t>[0])
                : "",
            }),
            deleted: t("messages.deletedToast"),
          };
          showToast(messages[kind]);
          start(() => router.refresh());
        }}
        onError={(msg) => alert(msg)}
      />

      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            background: "var(--fg-primary)",
            color: "var(--bg-page)",
            padding: "10px 16px",
            borderRadius: 10,
            display: "flex",
            gap: 12,
            alignItems: "center",
            zIndex: 50,
            boxShadow: "var(--shadow-deep)",
            fontSize: 13,
          }}
        >
          <span>{toast.message}</span>
          {toast.undoId && (
            <button
              onClick={undo}
              style={{
                background: "transparent",
                color: "var(--brand-primary-bg)",
                border: "1px solid color-mix(in srgb, var(--bg-page) 30%, transparent)",
                padding: "3px 10px",
                borderRadius: 6,
                cursor: "pointer",
                fontSize: 12,
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

const navBtnStyle: React.CSSProperties = {
  padding: "6px 12px",
  border: "1px solid var(--border-default)",
  background: "var(--bg-page)",
  borderRadius: 6,
  fontSize: 13,
  cursor: "pointer",
  color: "var(--fg-primary)",
  lineHeight: 1,
};

function Legend({ t }: { t: ReturnType<typeof useTranslations> }) {
  const items: Array<{ key: keyof typeof TYPE_TONE; label: string }> = [
    { key: "day_off", label: t("types.day_off") },
    { key: "half_am", label: t("types.half_am") },
    { key: "hourly", label: t("types.hourly") },
    { key: "sick", label: t("types.sick") },
  ];
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 11 }}>
      {items.map((it) => {
        const tone = (TYPE_TONE[it.key] ?? FALLBACK_TONE)!;
        return (
          <span key={it.key} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 3,
                background: tone.bg,
                border: `1px solid ${tone.border}`,
              }}
            />
            <span style={{ color: "var(--fg-secondary)" }}>{it.label}</span>
          </span>
        );
      })}
    </div>
  );
}
