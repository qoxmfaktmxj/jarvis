"use client";
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

/**
 * Generic unsaved-changes confirmation dialog.
 *
 * Two usage modes:
 *
 * 1. Legacy grid mode (existing callers): pass `count` + `onSaveAndContinue` +
 *    `onDiscardAndContinue` + `onCancel`. Default strings come from
 *    `Common.Grid.Unsaved.*` via next-intl.
 *
 * 2. Tab-close mode (new): pass `title` + `body` + label props + `onSave` +
 *    `onDiscard` + `onCancel`. Use `showSave={false}` for batch close where
 *    save isn't supported.
 *
 * Callers may still override any string by passing the corresponding prop —
 * defaults only kick in when the prop is `undefined`.
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
  const t = useTranslations("Common.Grid.Unsaved");

  // Resolve which save/discard handler to use (new preferred, legacy fallback).
  const handleSave = onSave ?? onSaveAndContinue;
  const handleDiscard = onDiscard ?? onDiscardAndContinue;

  // Default strings come from i18n; explicit prop overrides win.
  const resolvedTitle = title ?? t("title");
  const resolvedBody =
    body ??
    (typeof count === "number"
      ? t("bodyWithCount", { count })
      : t("bodyNoCount"));
  const resolvedDiscardLabel = discardLabel ?? t("discard");
  const resolvedSaveLabel = saveLabel ?? t("save");
  const resolvedCancelLabel = cancelLabel ?? t("cancel");

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
