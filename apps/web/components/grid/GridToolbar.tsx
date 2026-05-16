"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  dirtyCount: number;
  saving: boolean;
  insertLabel?: string;
  copyLabel?: string;
  saveLabel?: string;
  savingLabel?: string;
  /** [입력] 버튼 표시 여부 (default true). */
  allowInsert?: boolean;
  /** [복사] 버튼 표시 여부 (default true). */
  allowCopy?: boolean;
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
  allowInsert = true,
  allowCopy = true,
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

  // Hydration gate. `dirtyCount` 와 `saving` 은 부모가 `useTabState` 등
  // localStorage 기반 상태에서 client-only 값을 즉시 읽어오는 경우가 있어
  // server-render(0/false) 와 client mount 직후 값이 어긋날 수 있다.
  // mount 전에는 server-stable 값(0/false)을 사용해 hydration mismatch 회피.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const effectiveDirty = mounted ? dirtyCount : 0;
  const effectiveSaving = mounted ? saving : false;

  return (
    <div className="ml-auto flex items-center gap-2">
      {allowInsert && (
        <Button size="sm" variant="outline" onClick={onInsert} disabled={effectiveSaving}>
          {resolvedInsert}
        </Button>
      )}
      {allowCopy && (
        <Button
          size="sm"
          variant="outline"
          onClick={onCopy}
          disabled={effectiveSaving || !onCopy}
        >
          {resolvedCopy}
        </Button>
      )}
      {/*
        Variant C 저장 버튼: dirty > 0이면 brand-primary-bg + brand-primary-text
        tint 강조 (default solid primary보다 부드러움). dirty = 0이면 default
        variant disabled 그대로.
      */}
      <Button
        size="sm"
        disabled={effectiveDirty === 0 || effectiveSaving}
        onClick={onSave}
        className={cn(
          effectiveDirty > 0 &&
            "bg-(--brand-primary-bg) text-(--brand-primary-text) hover:bg-(--brand-primary-bg) hover:opacity-80",
        )}
      >
        {effectiveSaving
          ? resolvedSaving
          : effectiveDirty > 0
            ? `${resolvedSave} (${effectiveDirty})`
            : resolvedSave}
      </Button>
      {onExport && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => void onExport()}
          disabled={isExporting || effectiveSaving}
        >
          {isExporting ? resolvedExporting : resolvedExport}
        </Button>
      )}
    </div>
  );
}
