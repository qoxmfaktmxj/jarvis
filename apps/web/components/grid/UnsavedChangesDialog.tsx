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
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>저장되지 않은 변경사항</DialogTitle>
          <DialogDescription>
            저장되지 않은 변경사항이 {count}건 있습니다. 계속하시겠습니까?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:justify-end">
          <Button variant="ghost" onClick={onCancel}>
            취소
          </Button>
          <Button variant="outline" onClick={onDiscardAndContinue}>
            변경사항 무시하고 계속
          </Button>
          <Button onClick={onSaveAndContinue}>저장 후 계속</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
