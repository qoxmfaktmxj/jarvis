"use client";
import { Button } from "@/components/ui/button";

type Props = {
  dirtyCount: number;
  saving: boolean;
  insertLabel?: string;
  copyLabel?: string;
  saveLabel?: string;
  savingLabel?: string;
  onInsert: () => void;
  onCopy?: () => void;
  onSave: () => void;
  /** 다운로드 버튼이 활성화되려면 onExport가 제공되어야 한다. 위치는 [입력 / 복사 / 저장] 우측. */
  onExport?: () => void | Promise<void>;
  isExporting?: boolean;
  exportLabel?: string;
  exportingLabel?: string;
};

export function GridToolbar({
  dirtyCount,
  saving,
  insertLabel = "입력",
  copyLabel = "복사",
  saveLabel = "저장",
  savingLabel = "저장 중…",
  onInsert,
  onCopy,
  onSave,
  onExport,
  isExporting = false,
  exportLabel = "다운로드",
  exportingLabel = "다운로드 중…",
}: Props) {
  return (
    <div className="ml-auto flex items-center gap-2">
      <Button size="sm" variant="outline" onClick={onInsert} disabled={saving}>
        {insertLabel}
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={onCopy}
        disabled={saving || !onCopy}
      >
        {copyLabel}
      </Button>
      <Button size="sm" disabled={dirtyCount === 0 || saving} onClick={onSave}>
        {saving ? savingLabel : dirtyCount > 0 ? `${saveLabel} (${dirtyCount})` : saveLabel}
      </Button>
      {onExport && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => void onExport()}
          disabled={isExporting || saving}
        >
          {isExporting ? exportingLabel : exportLabel}
        </Button>
      )}
    </div>
  );
}
