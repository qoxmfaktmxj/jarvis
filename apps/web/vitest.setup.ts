import { vi } from "vitest";
import koMessages from "./messages/ko.json";

// Returns undefined if the key path is not found
function resolve(obj: Record<string, unknown>, path: string): string | undefined {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "string" ? current : undefined;
}

// Apply ICU-style {variable} interpolation
function interpolate(template: string, params?: Record<string, unknown>): string {
  if (!params) return template;
  return Object.entries(params).reduce(
    (str, [k, v]) => str.replaceAll(`{${k}}`, () => String(v)),
    template
  );
}

function makeTranslator(namespace: string) {
  const namespaceObj = namespace.split(".").reduce<unknown>(
    (obj, key) =>
      obj != null && typeof obj === "object"
        ? (obj as Record<string, unknown>)[key]
        : undefined,
    koMessages
  );

  return (key: string, params?: Record<string, unknown>) => {
    const raw =
      namespaceObj != null && typeof namespaceObj === "object"
        ? resolve(namespaceObj as Record<string, unknown>, key)
        : undefined;
    const result = raw ?? `${namespace}.${key}`;
    return interpolate(result, params);
  };
}

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn().mockImplementation((namespace: string) =>
    Promise.resolve(makeTranslator(namespace))
  ),
  getLocale: vi.fn().mockResolvedValue("ko"),
  getMessages: vi.fn().mockResolvedValue(koMessages),
  getNow: vi.fn().mockResolvedValue(new Date()),
  getTimeZone: vi.fn().mockResolvedValue("Asia/Seoul"),
}));

vi.mock("next-intl", () => ({
  useTranslations: vi.fn().mockImplementation((namespace: string) =>
    makeTranslator(namespace)
  ),
  NextIntlClientProvider: ({ children }: { children: unknown }) => children,
}));
