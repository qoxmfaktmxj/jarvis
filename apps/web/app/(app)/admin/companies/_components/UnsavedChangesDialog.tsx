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

type Props = {
  open: boolean;
  count: number;
  onSaveAndContinue: () => void;
  onDiscardAndContinue: () => void;
  onCancel: () => void;
};

export function UnsavedChangesDialog({
  open,
  count,
  onSaveAndContinue,
  onDiscardAndContinue,
  onCancel,
}: Props) {
  const t = useTranslations("Admin.Companies.dialog");
  const ta = useTranslations("Admin.Companies.actions");
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("unsavedTitle")}</DialogTitle>
          <DialogDescription>{t("unsavedDescription", { count })}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:justify-end">
          <Button variant="ghost" onClick={onCancel}>
            {ta("cancel")}
          </Button>
          <Button variant="outline" onClick={onDiscardAndContinue}>
            {t("discardAndContinue")}
          </Button>
          <Button onClick={onSaveAndContinue}>{t("saveAndContinue")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
