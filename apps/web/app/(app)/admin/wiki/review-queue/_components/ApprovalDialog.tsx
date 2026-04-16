"use client";

/**
 * apps/web/app/(app)/admin/wiki/review-queue/_components/ApprovalDialog.tsx
 *
 * Phase-W3 T5 — Approve / Reject modal for wiki_review_queue items.
 *
 * - Approve: optional `notes` textarea → `approveReviewItem(id, notes?)`.
 * - Reject: required `reason` textarea → `rejectReviewItem(id, reason)`.
 * - 성공 시 `router.refresh()`로 RSC 재-렌더 + server action의 revalidatePath 보강.
 * - shadcn/ui Dialog + Textarea 사용 (기존 `admin/review-queue/ApprovalDialog`와 패턴 일치).
 */

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import { approveReviewItem, rejectReviewItem } from "../actions";

interface ApprovalDialogProps {
  itemId: string;
  kind: string;
  description: string | null;
  onComplete?: () => void;
  children?: ReactNode;
}

export function ApprovalDialog({
  itemId,
  kind,
  description,
  onComplete,
  children,
}: ApprovalDialogProps) {
  const t = useTranslations("Admin.WikiReviewQueue");
  const router = useRouter();

  const [mode, setMode] = useState<"approve" | "reject" | null>(null);
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = mode !== null;

  function reset() {
    setNotes("");
    setReason("");
    setError(null);
    setSubmitting(false);
  }

  function handleOpenChange(next: boolean) {
    if (submitting) return;
    if (!next) {
      setMode(null);
      reset();
    }
  }

  async function handleSubmit() {
    if (!mode) return;
    setError(null);

    if (mode === "reject" && reason.trim().length === 0) {
      setError(t("reasonRequired"));
      return;
    }

    setSubmitting(true);
    try {
      const result =
        mode === "approve"
          ? await approveReviewItem(itemId, notes.trim() || undefined)
          : await rejectReviewItem(itemId, reason.trim());

      if (!result.ok) {
        setError(t("errorOccurred"));
        setSubmitting(false);
        return;
      }

      setMode(null);
      reset();
      onComplete?.();
      router.refresh();
    } catch (err) {
      console.error("wiki ApprovalDialog submit failed:", err);
      setError(t("errorOccurred"));
      setSubmitting(false);
    }
  }

  const title =
    mode === "approve"
      ? t("approveConfirm")
      : mode === "reject"
        ? t("rejectConfirm")
        : "";

  const submitLabel =
    mode === "approve" ? t("approve") : mode === "reject" ? t("reject") : "";

  const submitClassName =
    mode === "reject" ? "bg-red-600 text-white hover:bg-red-700" : undefined;

  const submitVariant: "default" | "secondary" =
    mode === "approve" ? "default" : "secondary";

  return (
    <>
      <div className="flex gap-2 shrink-0">
        <Button
          type="button"
          size="sm"
          variant="default"
          onClick={() => setMode("approve")}
        >
          {t("approve")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => setMode("reject")}
        >
          {t("reject")}
        </Button>
        {children}
      </div>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <p className="text-xs text-muted-foreground mt-1">
              <span className="font-mono">{kind}</span>
              {description ? ` · ${description}` : ""}
            </p>
          </DialogHeader>

          <div className="space-y-3">
            {mode === "approve" ? (
              <div className="space-y-1.5">
                <label
                  className="text-sm font-medium"
                  htmlFor="wiki-approve-notes"
                >
                  {t("notesLabel")}
                </label>
                <Textarea
                  id="wiki-approve-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={t("notesPlaceholder")}
                  rows={4}
                  disabled={submitting}
                />
              </div>
            ) : null}

            {mode === "reject" ? (
              <div className="space-y-1.5">
                <label
                  className="text-sm font-medium"
                  htmlFor="wiki-reject-reason"
                >
                  {t("reasonLabel")}
                </label>
                <Textarea
                  id="wiki-reject-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={t("reasonPlaceholder")}
                  rows={4}
                  disabled={submitting}
                />
              </div>
            ) : null}

            {error ? (
              <p className="text-sm text-red-600" role="alert">
                {error}
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={submitting}
            >
              {t("cancel")}
            </Button>
            <Button
              type="button"
              variant={submitVariant}
              className={submitClassName}
              onClick={handleSubmit}
              disabled={
                submitting ||
                (mode === "reject" && reason.trim().length === 0)
              }
            >
              {submitting ? t("processing") : submitLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
