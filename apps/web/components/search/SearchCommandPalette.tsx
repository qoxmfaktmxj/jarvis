import { getTranslations } from "next-intl/server";
import { SearchCommandPaletteClient } from "./SearchCommandPaletteClient";

export async function SearchCommandPalette() {
  const t = await getTranslations("Search.Command");
  return <SearchCommandPaletteClient labels={{
    dialogLabel: t("dialogLabel"),
    inputLabel: t("inputLabel"),
    placeholder: t("placeholder"),
    empty: t("empty"),
    loading: t("loading"),
    results: t("results"),
    close: t("close"),
    shortcut: t("shortcut"),
    keyboardHint: t("keyboardHint"),
  }} />;
}
