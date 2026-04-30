"use client";
import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { breakdownDayOff } from "@jarvis/shared/leave-compute";

type LeaveType = "day_off" | "half_am" | "half_pm" | "hourly" | "sick" | "public";

const TYPE_OPTIONS: ReadonlyArray<{ value: LeaveType; tone: string }> = [
  { value: "day_off", tone: "emerald" },
  { value: "half_am", tone: "amber" },
  { value: "half_pm", tone: "amber" },
  { value: "hourly", tone: "sky" },
  { value: "sick", tone: "rose" },
  { value: "public", tone: "violet" },
];

const TONE_STYLES: Record<string, { bg: string; fg: string; ring: string }> = {
  emerald: { bg: "var(--status-done-bg)", fg: "var(--status-done-fg)", ring: "var(--status-done-fg)" },
  amber: { bg: "var(--status-warn-bg)", fg: "var(--status-warn-fg)", ring: "var(--status-warn-fg)" },
  sky: { bg: "var(--status-active-bg)", fg: "var(--status-active-fg)", ring: "var(--status-active-fg)" },
  rose: { bg: "var(--status-danger-bg)", fg: "var(--status-danger-fg)", ring: "var(--status-danger-fg)" },
  violet: {
    bg: "var(--status-decorative-purple-bg)",
    fg: "var(--status-decorative-purple-fg)",
    ring: "var(--status-decorative-purple-fg)",
  },
};

export interface LeaveRequestModalProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  applicantId: string;
  applicantName: string;
  start: string;
  end: string;
  holidays: Array<{ date: string }>;
  onCreated: (created: { id: string; hours: string; type: string }) => void;
  onError: (kind: "no_active_contract" | "generic", detail?: string) => void;
}

export function LeaveRequestModal({
  open,
  onOpenChange,
  applicantId,
  applicantName,
  start,
  end,
  holidays,
  onCreated,
  onError,
}: LeaveRequestModalProps) {
  const t = useTranslations("Contractors");
  const [type, setType] = useState<LeaveType>("day_off");
  const [timeFrom, setTimeFrom] = useState("09:00");
  const [timeTo, setTimeTo] = useState("11:00");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [validationMsg, setValidationMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setType("day_off");
    setReason("");
    setSubmitting(false);
    setValidationMsg(null);
    setTimeFrom("09:00");
    setTimeTo("11:00");
  }, [open, start, end]);

  const isMultiDay = start !== end;
  const effectiveStart = type === "hourly" ? start : start;
  const effectiveEnd = type === "hourly" ? start : end;

  const holSet = useMemo(() => new Set(holidays.map((h) => h.date)), [holidays]);
  const breakdown = useMemo(
    () =>
      breakdownDayOff({
        startDate: new Date(`${effectiveStart}T00:00:00Z`),
        endDate: new Date(`${effectiveEnd}T00:00:00Z`),
        holidays: holSet,
      }),
    [effectiveStart, effectiveEnd, holSet],
  );

  const hourlyDuration = useMemo(() => {
    if (type !== "hourly") return 0;
    const fparts = timeFrom.split(":").map(Number);
    const tparts = timeTo.split(":").map(Number);
    const fh = fparts[0] ?? 0;
    const fm = fparts[1] ?? 0;
    const th = tparts[0] ?? 0;
    const tm = tparts[1] ?? 0;
    return (th * 60 + tm - (fh * 60 + fm)) / 60;
  }, [timeFrom, timeTo, type]);

  function validate(): string | null {
    if (type === "hourly") {
      if (hourlyDuration <= 0) return t("validation.timeOrderInvalid");
      if (hourlyDuration < 1) return t("validation.timeRangeMin");
      if (hourlyDuration > 8) return t("validation.timeRangeMax");
    }
    if (type === "day_off" && breakdown.workDays === 0) {
      return t("validation.rangeWeekendOnly");
    }
    return null;
  }

  async function handleSubmit() {
    const err = validate();
    if (err) {
      setValidationMsg(err);
      return;
    }
    setValidationMsg(null);
    setSubmitting(true);

    const body: Record<string, unknown> = {
      type,
      startDate: effectiveStart,
      endDate: effectiveEnd,
      reason: reason.trim() || undefined,
    };
    if (type === "hourly") {
      body.timeFrom = new Date(`${start}T${timeFrom}:00+09:00`).toISOString();
      body.timeTo = new Date(`${start}T${timeTo}:00+09:00`).toISOString();
    }

    try {
      const res = await fetch(`/api/contractors/${applicantId}/leave-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 409) {
        onError("no_active_contract");
        onOpenChange(false);
        return;
      }
      if (!res.ok) {
        onError("generic");
        return;
      }
      const created = await res.json();
      onCreated(created);
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }

  const periodLabel =
    type === "hourly"
      ? `${start}${isMultiDay ? "  ·  " + t("modal.applyToSingleDay", { date: start }) : ""}`
      : isMultiDay
        ? `${start} ~ ${end}`
        : start;

  return (
    <Dialog open={open} onOpenChange={(v) => (submitting ? void 0 : onOpenChange(v))}>
      <DialogContent className="!max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{t("modal.newTitle")}</DialogTitle>
          <DialogDescription>{t("messages.dragHint")}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-[88px_1fr] gap-x-4 gap-y-2 text-[13px]">
          <div className="text-(--fg-secondary)">{t("modal.applicantLabel")}</div>
          <div className="font-medium text-(--fg-primary)">{applicantName}</div>
          <div className="text-(--fg-secondary)">
            {type === "hourly" ? t("modal.singleDayLabel") : t("modal.periodLabel")}
          </div>
          <div className="font-medium text-(--fg-primary)">{periodLabel}</div>
          {type === "day_off" && isMultiDay ? (
            <>
              <div className="text-(--fg-secondary)">{t("modal.summaryLabel")}</div>
              <div className="text-(--fg-primary)">
                {t("messages.hoursBreakdown", {
                  totalDays: breakdown.totalDays,
                  holidayDays: breakdown.holidayDays,
                  effectiveDays: breakdown.workDays,
                  hours: breakdown.hours,
                })}
              </div>
            </>
          ) : null}
        </div>

        <div>
          <div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-(--fg-secondary)">
            {t("modal.typeLabel")}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {TYPE_OPTIONS.map((opt) => {
              const tone = TONE_STYLES[opt.tone] ?? TONE_STYLES.emerald!;
              const active = type === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setType(opt.value)}
                  className="rounded-md border px-3 py-2 text-left transition-colors"
                  style={{
                    borderColor: active ? tone.ring : "var(--border-default)",
                    background: active ? tone.bg : "var(--bg-page)",
                    color: active ? tone.fg : "var(--fg-primary)",
                    boxShadow: active ? `inset 0 0 0 1px ${tone.ring}` : undefined,
                  }}
                >
                  <div className="text-[13px] font-semibold">
                    {t(`types.${opt.value}` as Parameters<typeof t>[0])}
                  </div>
                  <div className="mt-0.5 text-[11px] opacity-80">
                    {opt.value === "day_off" && `${breakdown.hours}h`}
                    {(opt.value === "half_am" || opt.value === "half_pm") && "4h"}
                    {opt.value === "hourly" &&
                      (hourlyDuration > 0 ? `${hourlyDuration}h` : "—")}
                    {(opt.value === "sick" || opt.value === "public") && "0h"}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {type === "hourly" ? (
          <div className="grid grid-cols-2 gap-3">
            <label className="text-[12px] text-(--fg-secondary)">
              <span className="block mb-1">{t("modal.timeFromLabel")}</span>
              <input
                type="time"
                value={timeFrom}
                onChange={(e) => setTimeFrom(e.currentTarget.value)}
                className="w-full rounded-md border border-(--border-default) bg-(--bg-page) px-2 py-1.5 text-[13px] text-(--fg-primary)"
              />
            </label>
            <label className="text-[12px] text-(--fg-secondary)">
              <span className="block mb-1">{t("modal.timeToLabel")}</span>
              <input
                type="time"
                value={timeTo}
                onChange={(e) => setTimeTo(e.currentTarget.value)}
                className="w-full rounded-md border border-(--border-default) bg-(--bg-page) px-2 py-1.5 text-[13px] text-(--fg-primary)"
              />
            </label>
            {isMultiDay ? (
              <div className="col-span-2 rounded-md bg-(--status-warn-bg) px-3 py-2 text-[12px] text-(--status-warn-fg)">
                {t("validation.hourlyMustBeSingleDay", { date: start })}
              </div>
            ) : null}
          </div>
        ) : null}

        <label className="block text-[12px] text-(--fg-secondary)">
          <span className="block mb-1">{t("modal.reasonLabel")}</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.currentTarget.value)}
            placeholder={t("modal.reasonPlaceholder")}
            rows={3}
            className="w-full resize-none rounded-md border border-(--border-default) bg-(--bg-page) px-3 py-2 text-[13px] text-(--fg-primary) placeholder:text-(--fg-muted)"
          />
        </label>

        {validationMsg ? (
          <div className="rounded-md bg-(--status-danger-bg) px-3 py-2 text-[12px] text-(--status-danger-fg)">
            {validationMsg}
          </div>
        ) : null}

        <DialogFooter>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "…" : t("modal.submit")}
          </Button>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            {t("modal.cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
