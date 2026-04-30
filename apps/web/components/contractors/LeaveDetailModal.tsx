"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export interface LeaveDetailLeave {
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
}

export interface LeaveDetailModalProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  leave: LeaveDetailLeave | null;
  canEdit: boolean;
  onChanged: (kind: "saved" | "deleted") => void;
  onError: (msg: string) => void;
}

export function LeaveDetailModal({
  open,
  onOpenChange,
  leave,
  canEdit,
  onChanged,
  onError,
}: LeaveDetailModalProps) {
  const t = useTranslations("Contractors");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open && leave) setReason(leave.reason ?? "");
    if (!open) setBusy(false);
  }, [open, leave]);

  if (!leave) return null;

  const isCancelled = leave.status === "cancelled";
  const isMultiDay = leave.startDate !== leave.endDate;
  const periodLabel = isMultiDay ? `${leave.startDate} ~ ${leave.endDate}` : leave.startDate;
  const reasonChanged = reason.trim() !== (leave.reason ?? "").trim();

  function formatTime(iso: string | null | undefined) {
    if (!iso) return "";
    return new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(iso));
  }

  async function handleSave() {
    setBusy(true);
    try {
      const res = await fetch(`/api/leave-requests/${leave!.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() || undefined }),
      });
      if (!res.ok) {
        onError("저장 실패");
        return;
      }
      onChanged("saved");
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!confirm(t("modal.confirmDelete"))) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/leave-requests/${leave!.id}?hard=1`, { method: "DELETE" });
      if (!res.ok) {
        onError("삭제 실패");
        return;
      }
      onChanged("deleted");
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (busy ? void 0 : onOpenChange(v))}>
      <DialogContent className="!max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{t("modal.editTitle")}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-[88px_1fr] gap-x-4 gap-y-2 text-[13px]">
          <div className="text-(--fg-secondary)">{t("modal.applicantLabel")}</div>
          <div className="font-medium text-(--fg-primary)">{leave.userName}</div>

          <div className="text-(--fg-secondary)">{t("modal.typeLabel")}</div>
          <div className="text-(--fg-primary)">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {t(`types.${leave.type}` as any)}
            <span className="ml-2 text-(--fg-secondary)">
              ({Number(leave.hours)}h)
            </span>
          </div>

          <div className="text-(--fg-secondary)">{t("modal.periodLabel")}</div>
          <div className="text-(--fg-primary)">
            {periodLabel}
            {leave.type === "hourly" && leave.timeFrom && leave.timeTo ? (
              <span className="ml-2 text-(--fg-secondary)">
                {formatTime(leave.timeFrom)} – {formatTime(leave.timeTo)}
              </span>
            ) : null}
          </div>

          {isCancelled ? (
            <>
              <div className="text-(--fg-secondary)">상태</div>
              <div className="text-(--status-danger-fg)">{t("status.cancelled")}</div>
            </>
          ) : null}
        </div>

        <label className="block text-[12px] text-(--fg-secondary)">
          <span className="block mb-1">{t("modal.reasonLabel")}</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.currentTarget.value)}
            placeholder={t("modal.reasonPlaceholder")}
            rows={3}
            disabled={!canEdit || isCancelled}
            className="w-full resize-none rounded-md border border-(--border-default) bg-(--bg-page) px-3 py-2 text-[13px] text-(--fg-primary) placeholder:text-(--fg-muted) disabled:opacity-60"
          />
        </label>

        <DialogFooter className="!justify-between">
          <div className="flex gap-2">
            {canEdit && !isCancelled ? (
              <Button
                variant="outline"
                onClick={handleDelete}
                disabled={busy}
                className="!text-(--status-danger-fg) !border-(--status-danger-fg)/30 hover:!bg-(--status-danger-bg)"
              >
                {t("modal.deleteRequest")}
              </Button>
            ) : null}
          </div>
          <div className="flex gap-2">
            {canEdit && !isCancelled && reasonChanged ? (
              <Button onClick={handleSave} disabled={busy}>
                {t("modal.save")}
              </Button>
            ) : null}
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              {t("modal.close")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
