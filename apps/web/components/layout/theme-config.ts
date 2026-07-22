export const THEME_COLORS = [
  { id: "blue", hex: "#2D8CDB" },
  { id: "forest", hex: "#176B4D" },
  { id: "red", hex: "#A33A3A" },
] as const;

export type ThemeColorId = (typeof THEME_COLORS)[number]["id"];
export type ThemeMode = "light" | "dark";

export const DEFAULT_THEME: ThemeMode = "light";
export const DEFAULT_THEME_COLOR: ThemeColorId = "blue";
export const THEME_STORAGE_KEY = "jv.theme";
export const THEME_COLOR_STORAGE_KEY = "jv.themeColor";

export function resolveTheme(value: unknown): ThemeMode {
  return value === "dark" ? "dark" : DEFAULT_THEME;
}

export function resolveThemeColor(value: unknown): ThemeColorId {
  return THEME_COLORS.some(({ id }) => id === value) ? (value as ThemeColorId) : DEFAULT_THEME_COLOR;
}

export const UI_PREFS_BOOTSTRAP = `
(function(){
  var root=document.documentElement;
  var theme='${DEFAULT_THEME}';
  var color='${DEFAULT_THEME_COLOR}';
  try {
    theme=localStorage.getItem('${THEME_STORAGE_KEY}')==='dark'?'dark':'${DEFAULT_THEME}';
    var savedColor=localStorage.getItem('${THEME_COLOR_STORAGE_KEY}');
    color=${JSON.stringify(THEME_COLORS.map(({ id }) => id))}.indexOf(savedColor)>=0?savedColor:'${DEFAULT_THEME_COLOR}';
  } catch (error) {}
  root.setAttribute('data-theme',theme);
  root.setAttribute('data-theme-color',color);
})();
`.trim();
