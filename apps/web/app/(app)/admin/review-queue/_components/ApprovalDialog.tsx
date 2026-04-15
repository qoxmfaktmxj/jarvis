"use client";

import { useState, type ReactNode } from "react";
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
import { approve, defer, reject } from "../actions";

type ActionKind = "approve" | "reject" | "defer";

interface ApprovalDialogProps {
  item: {
    id: string;
    pageTitle?: string | null;
    status: string;
    kind?: string | null;
    requesterName?: string | null;
  };
  action: ActionKind;
  children: ReactNode;
}

export function ApprovalDialog({ item, action, children }: ApprovalDialogProps) {
  const t = useTranslations("Admin.ReviewQueue");
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setComment("");
    setReason("");
    setError(null);
    setSubmitting(false);
  }

  function handleOpenChange(next: boolean) {
    if (submitting) return;
    setOpen(next);
    if (!next) reset();
  }

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      let result: { ok: boolean; error?: string };
      if (action === "approve") {
        result = await approve(item.id, comment.trim() || undefined);
      } else if (action === "reject") {
        if (!reason.trim()) {
          setError(t("reasonLabel"));
          setSubmitting(false);
          return;
        }
        result = await reject(item.id, reason.trim());
      } else {
        result = await defer(item.id);
      }

      if (!result.ok) {
        setError(result.error ?? t("errorOccurred"));
        setSubmitting(false);
        return;
      }

      setOpen(false);
      reset();
    } catch (err) {
      console.error("ApprovalDialog submit failed:", err);
      setError(t("errorOccurred"));
      setSubmitting(false);
    }
  }

  const title =
    action === "approve"
      ? t("approveConfirm")
      : action === "reject"
        ? t("rejectConfirm")
        : t("deferConfirm");

  const submitVariant: "default" | "secondary" =
    action === "approve" ? "default" : "secondary";
  const submitClassName = action === "reject" ? "bg-red-600 text-white hover:bg-red-700" : undefined;

  const submitLabel = action === "approve" ? t("approve") : action === "reject" ? t("reject") : t("defer");

  return (
    <>
      <span onClick={() => setOpen(true)} className="inline-flex">
        {children}
      </span>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {item.pageTitle ? (
              <p className="text-sm text-muted-foreground mt-1 truncate">
                {item.pageTitle}
              </p>
            ) : null}
          </DialogHeader>

          <div className="space-y-3">
            {action === "approve" && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="approval-comment">
                  {t("commentLabel")}
                </label>
                <Textarea
                  id="approval-comment"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={3}
                  disabled={submitting}
                />
              </div>
            )}

            {action === "reject" && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="approval-reason">
                  {t("reasonLabel")}
                </label>
                <Textarea
                  id="approval-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  disabled={submitting}
                  required
                />
              </div>
            )}

            {error && (
              <p className="text-sm text-red-600" role="alert">
                {error}
              </p>
            )}
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
              disabled={submitting || (action === "reject" && !reason.trim())}
            >
              {submitting ? t("processing") : submitLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
