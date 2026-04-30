"use client";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

type Props = {
  dirtyCount: number;
  saving: boolean;
  onInsert: () => void;
  onCopy: () => void;
  onSave: () => void;
};

export function GridToolbar({ dirtyCount, saving, onInsert, onCopy, onSave }: Props) {
  const t = useTranslations("Admin.Companies.actions");
  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="outline" onClick={onInsert} disabled={saving}>
        {t("insert")}
      </Button>
      <Button size="sm" variant="outline" onClick={onCopy} disabled={saving}>
        {t("copy")}
      </Button>
      <Button size="sm" disabled={dirtyCount === 0 || saving} onClick={onSave}>
        {saving ? "..." : t("save")}
        {!saving && dirtyCount > 0 && ` (${dirtyCount})`}
      </Button>
    </div>
  );
}
