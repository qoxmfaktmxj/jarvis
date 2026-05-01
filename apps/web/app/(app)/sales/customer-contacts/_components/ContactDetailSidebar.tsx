"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { getContactTabCounts } from "../actions";
import { MemoModal } from "./MemoModal";

type Props = {
  contactId: string;
  contactName: string;
  customerId: string | null;
};

type Counts = {
  custCompanyCnt: number;
  opCnt: number;
  actCnt: number;
  comtCnt: number;
};

function TabButton({
  label,
  onClick,
  disabled,
  primary,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={[
        "flex items-center justify-center rounded px-3 py-2 text-sm font-medium transition-colors",
        primary
          ? "bg-slate-900 text-white hover:bg-slate-700 disabled:bg-slate-300"
          : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {label}
    </button>
  );
}

export function ContactDetailSidebar({
  contactId,
  contactName,
  customerId,
}: Props) {
  const t = useTranslations("Sales.CustomerContacts.Tabs");
  const router = useRouter();
  const [counts, setCounts] = useState<Counts | null>(null);
  const [memoOpen, setMemoOpen] = useState(false);
  const [, startTransition] = useTransition();

  const loadCounts = () => {
    startTransition(async () => {
      const res = await getContactTabCounts({ contactId });
      if (res.ok) {
        setCounts({
          custCompanyCnt: res.custCompanyCnt,
          opCnt: res.opCnt,
          actCnt: res.actCnt,
          comtCnt: res.comtCnt,
        });
      }
    });
  };

  useEffect(() => {
    loadCounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactId]);

  // custCompanyCnt: 1 if customerId is set, 0 otherwise (display value)
  const custCompanyCnt = customerId ? 1 : 0;
  const opCnt = counts?.opCnt ?? 0;
  const actCnt = counts?.actCnt ?? 0;
  const comtCnt = counts?.comtCnt ?? 0;

  return (
    <aside className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <TabButton
          label={t("customer", { count: custCompanyCnt })}
          onClick={() => {
            if (customerId) {
              router.push(`/sales/customers/${customerId}/edit`);
            }
          }}
          disabled={!customerId}
        />
        <TabButton
          label={t("opportunities", { count: opCnt })}
          onClick={() =>
            router.push(`/sales/opportunities?contactId=${contactId}`)
          }
          disabled={opCnt === 0}
        />
        <TabButton
          label={t("activities", { count: actCnt })}
          onClick={() =>
            router.push(`/sales/activities?contactId=${contactId}`)
          }
          disabled={actCnt === 0}
        />
        <TabButton
          label={t("memos", { count: comtCnt })}
          onClick={() => setMemoOpen(true)}
          primary
        />
      </div>

      {memoOpen && (
        <MemoModal
          contactId={contactId}
          contactName={contactName}
          onClose={() => setMemoOpen(false)}
          onCountChange={loadCounts}
        />
      )}
    </aside>
  );
}
