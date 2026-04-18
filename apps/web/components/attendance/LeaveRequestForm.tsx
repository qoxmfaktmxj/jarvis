"use client";

import * as React from "react";
import { Send } from "lucide-react";
import { OnsenToast, type LeaveType } from "./OnsenToast";

type FormState = {
  type: LeaveType;
  from: string;
  to: string;
  reason: string;
};

const TYPE_OPTIONS: Array<{ value: LeaveType; label: string; color: string }> = [
  { value: "annual", label: "연차", color: "var(--mint)" },
  { value: "half", label: "반차", color: "var(--accent)" },
  { value: "sick", label: "병가", color: "var(--amber, var(--accent))" },
  { value: "official", label: "공가", color: "var(--ink2)" },
];

function daysBetween(from: string, to: string): number {
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 1;
  return Math.max(1, Math.round((b - a) / 86_400_000) + 1);
}

/**
 * LeaveRequestForm — matches app.jsx `Attendance` (lines 407–434) form block.
 *
 * Client-only submit (no server action yet). After submit we flash an
 * OnsenToast and auto-dismiss after 5.5s per the prototype spec.
 */
export function LeaveRequestForm() {
  const [form, setForm] = React.useState<FormState>({
    type: "annual",
    from: "2026-04-22",
    to: "2026-04-24",
    reason: "",
  });
  const [toast, setToast] = React.useState<null | { type: LeaveType; from: string; to: string }>(
    null
  );

  const days = daysBetween(form.from, form.to);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const next = { type: form.type, from: form.from, to: form.to };
    setToast(next);
    window.setTimeout(() => setToast(null), 5500);
  }

  return (
    <>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 14 }}>
        {/* Type picker */}
        <div>
          <div style={{ fontSize: 12.5, color: "var(--ink2)", fontWeight: 500, marginBottom: 8 }}>
            유형
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
            {TYPE_OPTIONS.map(({ value, label, color }) => {
              const selected = form.type === value;
              return (
                <button
                  type="button"
                  key={value}
                  onClick={() => setForm({ ...form, type: value })}
                  aria-pressed={selected}
                  style={{
                    padding: "12px 8px",
                    border: "1px solid " + (selected ? "var(--ink)" : "var(--line)"),
                    borderRadius: 10,
                    background: selected ? "var(--line2)" : "var(--panel)",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 6,
                    cursor: "pointer",
                  }}
                >
                  <span
                    style={{
                      display: "inline-block",
                      width: 8,
                      height: 8,
                      borderRadius: 99,
                      background: color,
                    }}
                  />
                  <span style={{ fontSize: 13, fontWeight: selected ? 600 : 500 }}>{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Dates */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12.5, color: "var(--ink2)", fontWeight: 500 }}>시작일</span>
            <input
              type="date"
              value={form.from}
              onChange={(e) => setForm({ ...form, from: e.target.value })}
              style={{
                padding: "10px 12px",
                border: "1px solid var(--line)",
                borderRadius: 8,
                fontSize: 14,
                background: "var(--panel)",
                color: "var(--ink)",
              }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12.5, color: "var(--ink2)", fontWeight: 500 }}>종료일</span>
            <input
              type="date"
              value={form.to}
              onChange={(e) => setForm({ ...form, to: e.target.value })}
              style={{
                padding: "10px 12px",
                border: "1px solid var(--line)",
                borderRadius: 8,
                fontSize: 14,
                background: "var(--panel)",
                color: "var(--ink)",
              }}
            />
          </label>
        </div>

        {/* Reason */}
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12.5, color: "var(--ink2)", fontWeight: 500 }}>사유 (선택)</span>
          <textarea
            value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
            rows={3}
            placeholder="개인 휴식"
            style={{
              padding: "10px 12px",
              border: "1px solid var(--line)",
              borderRadius: 8,
              fontSize: 14,
              background: "var(--panel)",
              color: "var(--ink)",
              resize: "vertical",
              fontFamily: "inherit",
            }}
          />
        </label>

        {/* Day summary strip */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "10px 14px",
            background: "var(--line2)",
            borderRadius: 8,
            fontSize: 13,
          }}
        >
          <span style={{ color: "var(--muted)" }}>신청 일수</span>
          <span className="mono" style={{ marginLeft: "auto", fontWeight: 600, fontSize: 15 }}>
            {days}d
          </span>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            type="button"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 13.5,
              fontWeight: 500,
              padding: "7px 12px",
              borderRadius: 8,
              background: "var(--panel)",
              border: "1px solid var(--line)",
              color: "var(--ink2)",
              cursor: "pointer",
            }}
          >
            임시저장
          </button>
          <button
            type="submit"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 13.5,
              fontWeight: 500,
              padding: "7px 12px",
              borderRadius: 8,
              background: "var(--accent)",
              color: "#fff",
              border: "1px solid transparent",
              cursor: "pointer",
            }}
          >
            <Send size={16} />
            결재 올리기
          </button>
        </div>
      </form>

      {toast ? (
        <OnsenToast
          type={toast.type}
          from={toast.from}
          to={toast.to}
          onClose={() => setToast(null)}
        />
      ) : null}
    </>
  );
}
