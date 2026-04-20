"use client";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { breakdownDayOff } from "@jarvis/shared/leave-compute";

export function LeavePopover({
  start,
  end,
  x,
  y,
  holidays,
  onPick,
  onCancel,
}: {
  start: string;
  end: string;
  x: number;
  y: number;
  holidays: Array<{ date: string }>;
  onPick: (type: string, extra?: { timeFrom?: string; timeTo?: string }) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("Contractors");
  const [mode, setMode] = useState<"main" | "hourly">("main");
  const [timeFrom, setTimeFrom] = useState("09:00");
  const [timeTo, setTimeTo] = useState("11:00");

  const holSet = useMemo(
    () => new Set(holidays.map((h) => h.date)),
    [holidays]
  );
  const breakdown = useMemo(
    () =>
      breakdownDayOff({
        startDate: new Date(start + "T00:00:00Z"),
        endDate: new Date(end + "T00:00:00Z"),
        holidays: holSet,
      }),
    [start, end, holSet]
  );

  return (
    <div
      style={{
        position: "fixed",
        top: y,
        left: x,
        background: "white",
        border: "1px solid var(--line)",
        boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
        borderRadius: 8,
        padding: 12,
        minWidth: 240,
        zIndex: 60,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ fontSize: 12, marginBottom: 8, fontWeight: 600 }}>
        {start}
        {start !== end ? ` ~ ${end}` : ""}
      </div>
      <div
        style={{ fontSize: 11, color: "var(--muted)", marginBottom: 10 }}
      >
        {t("messages.hoursBreakdown", {
          totalDays: breakdown.totalDays,
          holidayDays: breakdown.holidayDays,
          effectiveDays: breakdown.workDays,
          hours: breakdown.hours,
        })}
      </div>
      {mode === "main" ? (
        <div style={{ display: "grid", gap: 4 }}>
          <button
            onClick={() => onPick("day_off")}
            style={{ padding: "6px 10px", textAlign: "left" }}
          >
            {t("types.day_off")} ({breakdown.hours}h)
          </button>
          <button
            onClick={() => onPick("half_am")}
            style={{ padding: "6px 10px", textAlign: "left" }}
          >
            {t("types.half_am")} (4h)
          </button>
          <button
            onClick={() => onPick("half_pm")}
            style={{ padding: "6px 10px", textAlign: "left" }}
          >
            {t("types.half_pm")} (4h)
          </button>
          <button
            onClick={() => setMode("hourly")}
            style={{ padding: "6px 10px", textAlign: "left" }}
          >
            {t("types.hourly")}…
          </button>
          <button
            onClick={() => onPick("sick")}
            style={{ padding: "6px 10px", textAlign: "left" }}
          >
            {t("types.sick")}
          </button>
          <button
            onClick={() => onPick("public")}
            style={{ padding: "6px 10px", textAlign: "left" }}
          >
            {t("types.public")}
          </button>
        </div>
      ) : (
        <div>
          <div style={{ display: "flex", gap: 4 }}>
            <input
              type="time"
              value={timeFrom}
              onChange={(e) => setTimeFrom(e.currentTarget.value)}
            />
            <input
              type="time"
              value={timeTo}
              onChange={(e) => setTimeTo(e.currentTarget.value)}
            />
          </div>
          <button
            onClick={() =>
              onPick("hourly", {
                timeFrom: `${start}T${timeFrom}:00.000Z`,
                timeTo: `${start}T${timeTo}:00.000Z`,
              })
            }
            style={{ marginTop: 8, width: "100%", padding: "6px 10px" }}
          >
            저장
          </button>
          <button
            onClick={() => setMode("main")}
            style={{
              marginTop: 4,
              width: "100%",
              background: "none",
              border: 0,
              fontSize: 11,
              color: "var(--muted)",
            }}
          >
            뒤로
          </button>
        </div>
      )}
      <button
        onClick={onCancel}
        style={{
          marginTop: 8,
          width: "100%",
          background: "none",
          border: 0,
          fontSize: 11,
          color: "var(--muted)",
          cursor: "pointer",
        }}
      >
        닫기
      </button>
    </div>
  );
}
