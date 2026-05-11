"use client";
import { useTranslations } from "next-intl";
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
  insertLabel,
  copyLabel,
  saveLabel,
  savingLabel,
  onInsert,
  onCopy,
  onSave,
  onExport,
  isExporting = false,
  exportLabel,
  exportingLabel,
}: Props) {
  // Defaults pulled from `Common.Grid.*`. Any caller can still pass the prop
  // to override (e.g. domain-specific verb), but baseline grids no longer
  // surface raw Korean fallbacks.
  const t = useTranslations("Common.Grid");
  const resolvedInsert = insertLabel ?? t("insert");
  const resolvedCopy = copyLabel ?? t("copy");
  const resolvedSave = saveLabel ?? t("save");
  const resolvedSaving = savingLabel ?? t("saving");
  const resolvedExport = exportLabel ?? t("export");
  const resolvedExporting = exportingLabel ?? t("exporting");
  return (
    <div className="ml-auto flex items-center gap-2">
      <Button size="sm" variant="outline" onClick={onInsert} disabled={saving}>
        {resolvedInsert}
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={onCopy}
        disabled={saving || !onCopy}
      >
        {resolvedCopy}
      </Button>
      <Button size="sm" disabled={dirtyCount === 0 || saving} onClick={onSave}>
        {saving ? resolvedSaving : dirtyCount > 0 ? `${resolvedSave} (${dirtyCount})` : resolvedSave}
      </Button>
      {onExport && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => void onExport()}
          disabled={isExporting || saving}
        >
          {isExporting ? resolvedExporting : resolvedExport}
        </Button>
      )}
    </div>
  );
}
