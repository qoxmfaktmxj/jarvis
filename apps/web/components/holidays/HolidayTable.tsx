"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { HolidayFormModal } from "./HolidayFormModal";

type HolidayRow = {
  id: string;
  date: string;
  name: string;
  note: string | null;
};

export function HolidayTable({
  initialYear,
  initialRows,
}: {
  initialYear: number;
  initialRows: HolidayRow[];
}) {
  const t = useTranslations("Holidays");
  const router = useRouter();
  const [, start] = useTransition();
  const [year, setYear] = useState(initialYear);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<HolidayRow | null>(null);

  const currentYear = new Date().getFullYear();
  const years = [currentYear - 1, currentYear, currentYear + 1];

  const refresh = () => start(() => router.refresh());

  const onDelete = async (id: string) => {
    if (!confirm("삭제하시겠습니까?")) return;
    const res = await fetch(`/api/holidays/${id}`, { method: "DELETE" });
    if (!res.ok) {
      alert("삭제 실패");
      return;
    }
    refresh();
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <select
          value={year}
          onChange={(e) => {
            const y = Number(e.currentTarget.value);
            setYear(y);
            start(() => router.replace(`/holidays?year=${y}`));
          }}
          style={{
            padding: "6px 10px",
            border: "1px solid var(--line)",
            borderRadius: 6,
          }}
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}년
            </option>
          ))}
        </select>
        <button
          onClick={() => setShowAdd(true)}
          style={{
            marginLeft: "auto",
            padding: "6px 14px",
            background: "var(--ink)",
            color: "white",
            border: 0,
            borderRadius: 6,
            cursor: "pointer",
          }}
        >
          {t("actions.add")}
        </button>
      </div>
      <div
        style={{
          border: "1px solid var(--line)",
          borderRadius: 8,
          background: "white",
          overflow: "hidden",
        }}
      >
        <table
          style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}
        >
          <thead style={{ background: "var(--panel)", textAlign: "left" }}>
            <tr>
              <th style={{ padding: "10px" }}>{t("columns.date")}</th>
              <th style={{ padding: "10px" }}>{t("columns.name")}</th>
              <th style={{ padding: "10px" }}>{t("columns.note")}</th>
              <th style={{ padding: "10px", width: 140 }}></th>
            </tr>
          </thead>
          <tbody>
            {initialRows.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  style={{
                    padding: "32px 10px",
                    textAlign: "center",
                    color: "var(--muted)",
                  }}
                >
                  {year}년 등록된 공휴일이 없습니다.
                </td>
              </tr>
            )}
            {initialRows.map((r) => (
              <tr key={r.id} style={{ borderTop: "1px solid var(--line)" }}>
                <td
                  style={{
                    padding: "10px",
                    fontFamily: "var(--font-mono, monospace)",
                  }}
                >
                  {r.date}
                </td>
                <td style={{ padding: "10px", fontWeight: 600 }}>{r.name}</td>
                <td style={{ padding: "10px", color: "var(--muted)" }}>
                  {r.note ?? "—"}
                </td>
                <td style={{ padding: "10px", textAlign: "right" }}>
                  <button
                    onClick={() => setEditing(r)}
                    style={{
                      background: "none",
                      border: 0,
                      color: "var(--ink)",
                      cursor: "pointer",
                      marginRight: 10,
                      fontSize: 12,
                    }}
                  >
                    {t("actions.edit")}
                  </button>
                  <button
                    onClick={() => onDelete(r.id)}
                    style={{
                      background: "none",
                      border: 0,
                      color: "var(--muted)",
                      cursor: "pointer",
                      fontSize: 12,
                    }}
                  >
                    {t("actions.delete")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showAdd && (
        <HolidayFormModal
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            setShowAdd(false);
            refresh();
          }}
        />
      )}
      {editing && (
        <HolidayFormModal
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}
