"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function UnsavedChangesDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>저장되지 않은 변경사항</DialogTitle>
          <DialogDescription>저장하지 않은 변경사항이 있습니다. 계속 진행할까요?</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="secondary" onClick={() => props.onOpenChange(false)}>
            취소
          </Button>
          <Button onClick={props.onConfirm}>계속</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
