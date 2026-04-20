"use client";
import { useState, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { ContractorDrawer } from "./ContractorDrawer";
import { NewContractorModal } from "./NewContractorModal";

type Row = {
  userId: string;
  employeeId: string;
  name: string;
  orgName: string | null;
  contractId: string | null;
  startDate: string | null;
  endDate: string | null;
  issuedHours: number;
  usedHours: number;
  remainingHours: number;
  contractStatus: string | null;
  updatedAt: string;
};

export function ContractorTable({
  initialData,
  isAdmin,
  initialQuery
}: {
  initialData: Row[];
  isAdmin: boolean;
  initialQuery: { q?: string; status?: string };
}) {
  const t = useTranslations("Contractors");
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [, start] = useTransition();
  const [selected, setSelected] = useState<Row | null>(null);
  const [showNew, setShowNew] = useState(false);

  const updateQuery = (patch: Record<string, string | undefined>) => {
    const sp = new URLSearchParams(searchParams?.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === "") sp.delete(k);
      else sp.set(k, v);
    }
    start(() => router.replace(`${pathname}?${sp.toString()}`));
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: selected ? "1fr 300px" : "1fr",
        gap: 16
      }}
    >
      <div>
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            marginBottom: 12
          }}
        >
          <input
            type="text"
            placeholder={`${t("columns.name")}·${t("columns.employeeId")} 검색`}
            defaultValue={initialQuery.q ?? ""}
            onBlur={(e) => updateQuery({ q: e.currentTarget.value })}
            style={{
              padding: "6px 10px",
              border: "1px solid var(--line)",
              borderRadius: 6,
              flex: 1,
              maxWidth: 280
            }}
          />
          <select
            defaultValue={initialQuery.status ?? "active"}
            onChange={(e) => updateQuery({ status: e.currentTarget.value })}
            style={{
              padding: "6px 10px",
              border: "1px solid var(--line)",
              borderRadius: 6
            }}
          >
            <option value="active">{t("status.active")}</option>
            <option value="expired">{t("status.expired")}</option>
            <option value="terminated">{t("status.terminated")}</option>
          </select>
          {isAdmin && (
            <button
              onClick={() => setShowNew(true)}
              style={{
                marginLeft: "auto",
                padding: "6px 14px",
                background: "var(--ink)",
                color: "white",
                border: 0,
                borderRadius: 6,
                cursor: "pointer"
              }}
            >
              {t("actions.addContractor")}
            </button>
          )}
        </div>
        <div
          style={{
            overflowX: "auto",
            border: "1px solid var(--line)",
            borderRadius: 8,
            background: "white"
          }}
        >
          <table
            style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}
          >
            <thead
              style={{ background: "var(--panel)", textAlign: "left" }}
            >
              <tr>
                <th style={{ padding: "10px" }}>{t("columns.employeeId")}</th>
                <th style={{ padding: "10px" }}>{t("columns.name")}</th>
                <th style={{ padding: "10px" }}>{t("columns.org")}</th>
                <th style={{ padding: "10px" }}>{t("columns.contractPeriod")}</th>
                <th style={{ padding: "10px", textAlign: "right" }}>
                  {t("columns.issuedHours")}
                </th>
                <th style={{ padding: "10px", textAlign: "right" }}>
                  {t("columns.usedHours")}
                </th>
                <th style={{ padding: "10px", textAlign: "right" }}>
                  {t("columns.remainingHours")}
                </th>
                <th style={{ padding: "10px" }}>{t("columns.status")}</th>
              </tr>
            </thead>
            <tbody>
              {initialData.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    style={{
                      padding: "40px 10px",
                      textAlign: "center",
                      color: "var(--muted)"
                    }}
                  >
                    인력 데이터가 없습니다.
                  </td>
                </tr>
              )}
              {initialData.map((r) => {
                const active = selected?.userId === r.userId;
                return (
                  <tr
                    key={r.userId}
                    onClick={() => setSelected(r)}
                    style={{
                      borderTop: "1px solid var(--line)",
                      background: active
                        ? "var(--accent-tint, #e8f0fe)"
                        : undefined,
                      cursor: "pointer"
                    }}
                  >
                    <td
                      style={{
                        padding: "10px",
                        fontFamily: "var(--font-mono, monospace)"
                      }}
                    >
                      {r.employeeId}
                    </td>
                    <td style={{ padding: "10px", fontWeight: 600 }}>
                      {r.name}
                    </td>
                    <td style={{ padding: "10px", color: "var(--muted)" }}>
                      {r.orgName ?? "—"}
                    </td>
                    <td style={{ padding: "10px", fontSize: 12 }}>
                      {r.startDate ?? "—"}
                      {r.startDate && r.endDate ? " ~ " : ""}
                      {r.endDate ?? ""}
                    </td>
                    <td style={{ padding: "10px", textAlign: "right" }}>
                      {r.issuedHours}h
                    </td>
                    <td style={{ padding: "10px", textAlign: "right" }}>
                      {r.usedHours}h
                    </td>
                    <td
                      style={{
                        padding: "10px",
                        textAlign: "right",
                        color:
                          r.remainingHours < 0
                            ? "var(--danger, red)"
                            : undefined,
                        fontWeight: 600
                      }}
                    >
                      {r.remainingHours}h
                    </td>
                    <td style={{ padding: "10px" }}>
                      {r.contractStatus
                        ? t(`status.${r.contractStatus}` as Parameters<typeof t>[0])
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {selected && (
        <ContractorDrawer
          userId={selected.userId}
          onClose={() => setSelected(null)}
          isAdmin={isAdmin}
        />
      )}
      {showNew && (
        <NewContractorModal
          onClose={() => setShowNew(false)}
          onCreated={() => {
            setShowNew(false);
            start(() => router.refresh());
          }}
        />
      )}
    </div>
  );
}
