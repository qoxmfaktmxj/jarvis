"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";

type LeaveType = "day_off" | "half_am" | "half_pm" | "hourly" | "sick" | "public";

export function LeaveAddModal({
  userId,
  onClose,
  onCreated
}: {
  userId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const t = useTranslations("Contractors");
  const [type, setType] = useState<LeaveType>("day_off");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [timeFrom, setTimeFrom] = useState("09:00");
  const [timeTo, setTimeTo] = useState("11:00");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    const body: Record<string, unknown> = {
      type,
      startDate,
      endDate: endDate || startDate,
      reason: reason || undefined
    };
    if (type === "hourly") {
      body.timeFrom = `${startDate}T${timeFrom}:00.000Z`;
      body.timeTo = `${startDate}T${timeTo}:00.000Z`;
    }
    const res = await fetch(`/api/contractors/${userId}/leave-requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (res.status === 409) {
      setError(t("errors.noActiveContract"));
      setSubmitting(false);
      return;
    }
    if (!res.ok) {
      setError("저장 실패");
      setSubmitting(false);
      return;
    }
    onCreated();
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
        zIndex: 50
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "white",
          padding: 20,
          borderRadius: 8,
          minWidth: 360
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: "0 0 12px" }}>{t("actions.addLeave")}</h3>
        <div style={{ display: "grid", gap: 8 }}>
          <label>
            타입
            <select
              value={type}
              onChange={(e) => setType(e.currentTarget.value as LeaveType)}
              style={{ width: "100%", padding: 6 }}
            >
              <option value="day_off">{t("types.day_off")}</option>
              <option value="half_am">{t("types.half_am")}</option>
              <option value="half_pm">{t("types.half_pm")}</option>
              <option value="hourly">{t("types.hourly")}</option>
              <option value="sick">{t("types.sick")}</option>
              <option value="public">{t("types.public")}</option>
            </select>
          </label>
          <label>
            시작일
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.currentTarget.value)}
              style={{ width: "100%", padding: 6 }}
            />
          </label>
          <label>
            종료일 (비우면 당일)
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.currentTarget.value)}
              style={{ width: "100%", padding: 6 }}
            />
          </label>
          {type === "hourly" && (
            <div style={{ display: "flex", gap: 8 }}>
              <label style={{ flex: 1 }}>
                시작 시간
                <input
                  type="time"
                  value={timeFrom}
                  onChange={(e) => setTimeFrom(e.currentTarget.value)}
                  style={{ width: "100%", padding: 6 }}
                />
              </label>
              <label style={{ flex: 1 }}>
                종료 시간
                <input
                  type="time"
                  value={timeTo}
                  onChange={(e) => setTimeTo(e.currentTarget.value)}
                  style={{ width: "100%", padding: 6 }}
                />
              </label>
            </div>
          )}
          <label>
            사유
            <textarea
              value={reason}
              onChange={(e) => setReason(e.currentTarget.value)}
              rows={2}
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
              marginTop: 8
            }}
          >
            <button onClick={onClose} style={{ padding: "6px 14px" }}>
              취소
            </button>
            <button
              onClick={submit}
              disabled={submitting || !startDate}
              style={{
                padding: "6px 14px",
                background: "var(--ink)",
                color: "white",
                border: 0,
                borderRadius: 4
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
