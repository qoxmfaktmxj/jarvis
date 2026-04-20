"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { LeaveAddModal } from "./LeaveAddModal";

type LeaveRow = {
  id: string;
  startDate: string;
  endDate: string;
  type: string;
  hours: string | number;
  reason: string | null;
};

type Detail = {
  user: { id: string; name: string; employeeId: string };
  activeContract: {
    id: string;
    startDate: string;
    endDate: string;
    generatedLeaveHours: string;
    additionalLeaveHours: string;
    note: string | null;
  } | null;
  contracts: unknown[];
  leaves: LeaveRow[];
};

export function ContractorDrawer({
  userId,
  onClose,
  isAdmin
}: {
  userId: string;
  onClose: () => void;
  isAdmin: boolean;
}) {
  const t = useTranslations("Contractors");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [showLeaveModal, setShowLeaveModal] = useState(false);

  const load = () => {
    fetch(`/api/contractors/${userId}`)
      .then((r) => r.json())
      .then(setDetail);
  };

  useEffect(() => {
    load();
  }, [userId]);

  if (!detail) {
    return <aside style={{ padding: 16 }}>로딩…</aside>;
  }

  const issued = detail.activeContract
    ? Number(detail.activeContract.generatedLeaveHours) +
      Number(detail.activeContract.additionalLeaveHours)
    : 0;
  const used = detail.leaves.reduce(
    (s: number, l: LeaveRow) => s + Number(l.hours || 0),
    0
  );
  const remaining = issued - used;
  const days = Math.floor(remaining / 8);

  return (
    <aside
      style={{
        background: "var(--panel)",
        border: "1px solid var(--line)",
        borderRadius: 8,
        padding: 16,
        position: "sticky",
        top: 24,
        maxHeight: "calc(100vh - 48px)",
        overflow: "auto"
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }}
      >
        <h3 style={{ margin: 0, fontSize: 16 }}>{detail.user.name}</h3>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: 0,
            cursor: "pointer",
            fontSize: 18
          }}
        >
          ×
        </button>
      </div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>
        {detail.user.employeeId}
      </div>

      {detail.activeContract ? (
        <section style={{ marginBottom: 16 }}>
          <div
            style={{
              fontSize: 11,
              color: "var(--muted)",
              textTransform: "uppercase",
              letterSpacing: ".05em",
              marginBottom: 6
            }}
          >
            계약
          </div>
          <div style={{ fontSize: 13, marginBottom: 4 }}>
            {detail.activeContract.startDate} ~ {detail.activeContract.endDate}
          </div>
          <div style={{ fontSize: 13, marginBottom: 4 }}>
            발행 {issued}h · 사용 {used}h
          </div>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: remaining < 0 ? "red" : "inherit"
            }}
          >
            잔여 {days}일 ({remaining}시간)
          </div>
          {detail.activeContract.note && (
            <div
              style={{
                fontSize: 12,
                color: "var(--muted)",
                marginTop: 6,
                whiteSpace: "pre-wrap"
              }}
            >
              {detail.activeContract.note}
            </div>
          )}
        </section>
      ) : (
        <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16 }}>
          활성 계약이 없습니다.
        </div>
      )}

      <section>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 8
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: "var(--muted)",
              textTransform: "uppercase",
              letterSpacing: ".05em"
            }}
          >
            세부 근태 이력
          </div>
          <button
            onClick={() => setShowLeaveModal(true)}
            style={{
              background: "var(--ink)",
              color: "white",
              border: 0,
              padding: "4px 10px",
              borderRadius: 4,
              fontSize: 12,
              cursor: "pointer"
            }}
            disabled={!detail.activeContract}
          >
            {t("actions.addLeave")}
          </button>
        </div>
        {detail.leaves.length === 0 && (
          <div style={{ fontSize: 12, color: "var(--muted)" }}>없음</div>
        )}
        {detail.leaves.map((l) => (
          <div
            key={l.id}
            style={{
              borderTop: "1px solid var(--line)",
              padding: "6px 0",
              fontSize: 12
            }}
          >
            <div>
              {l.startDate}
              {l.endDate !== l.startDate ? ` ~ ${l.endDate}` : ""}
            </div>
            <div
              style={{ display: "flex", gap: 6, marginTop: 2 }}
            >
              <span
                style={{
                  background: "var(--line2, #eee)",
                  padding: "1px 6px",
                  borderRadius: 3,
                  fontSize: 11
                }}
              >
                {t(`types.${l.type}` as Parameters<typeof t>[0])}
              </span>
              <span>{Number(l.hours)}h</span>
              {isAdmin && (
                <button
                  onClick={() => {
                    if (!confirm("취소하시겠습니까?")) return;
                    fetch(`/api/leave-requests/${l.id}`, {
                      method: "DELETE"
                    }).then(load);
                  }}
                  style={{
                    marginLeft: "auto",
                    background: "none",
                    border: 0,
                    color: "var(--muted)",
                    fontSize: 11,
                    cursor: "pointer"
                  }}
                >
                  {t("actions.delete")}
                </button>
              )}
            </div>
            {l.reason && (
              <div style={{ color: "var(--muted)", marginTop: 2 }}>
                {l.reason}
              </div>
            )}
          </div>
        ))}
      </section>

      {showLeaveModal && detail.activeContract && (
        <LeaveAddModal
          userId={userId}
          onClose={() => setShowLeaveModal(false)}
          onCreated={() => {
            setShowLeaveModal(false);
            load();
          }}
        />
      )}
    </aside>
  );
}
