"use client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * Generic unsaved-changes confirmation dialog.
 *
 * Two usage modes:
 *
 * 1. Legacy grid mode (existing callers): pass `count` + `onSaveAndContinue` +
 *    `onDiscardAndContinue` + `onCancel`. Korean strings used by default.
 *
 * 2. Tab-close mode (new): pass `title` + `body` + label props + `onSave` +
 *    `onDiscard` + `onCancel`. Use `showSave={false}` for batch close where
 *    save isn't supported.
 */
type Props = {
  open: boolean;

  // Legacy grid props (backwards-compat).
  count?: number;
  onSaveAndContinue?: () => void;
  onDiscardAndContinue?: () => void;

  // Generic tab/dialog props.
  title?: React.ReactNode;
  body?: React.ReactNode;
  discardLabel?: string;
  saveLabel?: string;
  cancelLabel?: string;
  showSave?: boolean;
  onSave?: () => void;
  onDiscard?: () => void;

  onCancel: () => void;
};

export function UnsavedChangesDialog({
  open,
  count,
  onSaveAndContinue,
  onDiscardAndContinue,
  title,
  body,
  discardLabel,
  saveLabel,
  cancelLabel,
  showSave,
  onSave,
  onDiscard,
  onCancel,
}: Props) {
  // Resolve which save/discard handler to use (new preferred, legacy fallback).
  const handleSave = onSave ?? onSaveAndContinue;
  const handleDiscard = onDiscard ?? onDiscardAndContinue;

  // Default strings preserve legacy behavior when count is provided.
  const resolvedTitle = title ?? "저장되지 않은 변경사항";
  const resolvedBody =
    body ??
    (typeof count === "number"
      ? `저장되지 않은 변경사항이 ${count}건 있습니다. 계속하시겠습니까?`
      : "저장되지 않은 변경사항이 있습니다. 계속하시겠습니까?");
  const resolvedDiscardLabel = discardLabel ?? "변경사항 무시하고 계속";
  const resolvedSaveLabel = saveLabel ?? "저장 후 계속";
  const resolvedCancelLabel = cancelLabel ?? "취소";

  // Show save button unless explicitly disabled (default true).
  const renderSave = showSave !== false && handleSave;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{resolvedTitle}</DialogTitle>
          <DialogDescription>{resolvedBody}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:justify-end">
          <Button variant="ghost" onClick={onCancel}>
            {resolvedCancelLabel}
          </Button>
          {handleDiscard ? (
            <Button variant="outline" onClick={handleDiscard}>
              {resolvedDiscardLabel}
            </Button>
          ) : null}
          {renderSave ? (
            <Button onClick={handleSave}>{resolvedSaveLabel}</Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
