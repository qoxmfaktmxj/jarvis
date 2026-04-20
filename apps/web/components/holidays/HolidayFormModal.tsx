"use client";
import { useState } from "react";

type HolidayRow = {
  id: string;
  date: string;
  name: string;
  note: string | null;
};

export function HolidayFormModal({
  initial,
  onClose,
  onSaved,
}: {
  initial?: HolidayRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [date, setDate] = useState(initial?.date ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    const body: Record<string, string> = { date, name };
    if (note) body.note = note;
    const url = initial ? `/api/holidays/${initial.id}` : "/api/holidays";
    const method = initial ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.status === 409) {
      setError("같은 날짜가 이미 존재합니다.");
      setSubmitting(false);
      return;
    }
    if (!res.ok) {
      setError("저장 실패");
      setSubmitting(false);
      return;
    }
    onSaved();
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
      }}
    >
      <div
        style={{
          background: "white",
          padding: 20,
          borderRadius: 8,
          minWidth: 360,
        }}
      >
        <h3 style={{ margin: "0 0 12px" }}>
          {initial ? "공휴일 수정" : "공휴일 추가"}
        </h3>
        <div style={{ display: "grid", gap: 8 }}>
          <label>
            날짜
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.currentTarget.value)}
              style={{ width: "100%", padding: 6 }}
            />
          </label>
          <label>
            이름
            <input
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              placeholder="예: 어린이날"
              style={{ width: "100%", padding: 6 }}
            />
          </label>
          <label>
            비고 (선택)
            <input
              value={note}
              onChange={(e) => setNote(e.currentTarget.value)}
              style={{ width: "100%", padding: 6 }}
            />
          </label>
          {error && (
            <div style={{ color: "red", fontSize: 12 }}>{error}</div>
          )}
          <div
            style={{
              display: "flex",
              gap: 8,
              justifyContent: "flex-end",
              marginTop: 8,
            }}
          >
            <button onClick={onClose} style={{ padding: "6px 14px" }}>
              취소
            </button>
            <button
              onClick={submit}
              disabled={submitting || !date || !name}
              style={{
                padding: "6px 14px",
                background: "var(--ink)",
                color: "white",
                border: 0,
                borderRadius: 4,
              }}
            >
              저장
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
