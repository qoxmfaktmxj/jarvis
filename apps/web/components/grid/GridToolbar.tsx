"use client";
import { Button } from "@/components/ui/button";

type Props = {
  dirtyCount: number;
  saving: boolean;
  insertLabel?: string;
  copyLabel?: string;
  saveLabel?: string;
  onInsert: () => void;
  onCopy?: () => void;
  onSave: () => void;
};

export function GridToolbar({
  dirtyCount,
  saving,
  insertLabel = "입력",
  copyLabel = "복사",
  saveLabel = "저장",
  onInsert,
  onCopy,
  onSave,
}: Props) {
  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="outline" onClick={onInsert} disabled={saving}>
        {insertLabel}
      </Button>
      {onCopy && (
        <Button size="sm" variant="outline" onClick={onCopy} disabled={saving}>
          {copyLabel}
        </Button>
      )}
      <Button size="sm" disabled={dirtyCount === 0 || saving} onClick={onSave}>
        {saving ? "..." : saveLabel}
        {!saving && dirtyCount > 0 && ` (${dirtyCount})`}
      </Button>
    </div>
  );
}
