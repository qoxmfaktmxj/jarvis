"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";

export function NewContractorModal({
  onClose,
  onCreated
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const t = useTranslations("Contractors");
  const [name, setName] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [enterCd, setEnterCd] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [additionalLeaveHours, setAdditionalLeaveHours] = useState("0");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/contractors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        employeeId,
        enterCd: enterCd || undefined,
        startDate,
        endDate,
        additionalLeaveHours: Number(additionalLeaveHours),
        note: note || undefined
      })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(
        data?.error ? JSON.stringify(data.error) : "저장 실패"
      );
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
          minWidth: 400
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: "0 0 12px" }}>{t("actions.addContractor")}</h3>
        <div style={{ display: "grid", gap: 8 }}>
          <label>
            이름
            <input
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              style={{ width: "100%", padding: 6 }}
            />
          </label>
          <label>
            사번
            <input
              value={employeeId}
              onChange={(e) => setEmployeeId(e.currentTarget.value)}
              style={{ width: "100%", padding: 6 }}
            />
          </label>
          <label>
            입사회사코드
            <input
              value={enterCd}
              onChange={(e) => setEnterCd(e.currentTarget.value)}
              style={{ width: "100%", padding: 6 }}
            />
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <label style={{ flex: 1 }}>
              계약시작
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.currentTarget.value)}
                style={{ width: "100%", padding: 6 }}
              />
            </label>
            <label style={{ flex: 1 }}>
              계약종료
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.currentTarget.value)}
                style={{ width: "100%", padding: 6 }}
              />
            </label>
          </div>
          <label>
            추가연차(시간)
            <input
              type="number"
              min="0"
              value={additionalLeaveHours}
              onChange={(e) => setAdditionalLeaveHours(e.currentTarget.value)}
              style={{ width: "100%", padding: 6 }}
            />
          </label>
          <label>
            비고
            <textarea
              value={note}
              onChange={(e) => setNote(e.currentTarget.value)}
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
              disabled={
                submitting || !name || !employeeId || !startDate || !endDate
              }
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
