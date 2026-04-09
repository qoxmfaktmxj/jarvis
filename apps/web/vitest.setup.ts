import { vi } from "vitest";

// Translates using namespace-qualified keys so tests can assert on predictable strings.
// e.g. getTranslations("Dashboard") → t("title") returns "Dashboard.title"
//      useTranslations("Dashboard.QuickLinks") → t("title") returns "Dashboard.QuickLinks.title"
function makeTranslator(namespace: string) {
  return (key: string, _params?: Record<string, unknown>) =>
    `${namespace}.${key}`;
}

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn().mockImplementation((namespace: string) =>
    Promise.resolve(makeTranslator(namespace))
  ),
  getLocale: vi.fn().mockResolvedValue("ko"),
  getMessages: vi.fn().mockResolvedValue({}),
  getNow: vi.fn().mockResolvedValue(new Date()),
  getTimeZone: vi.fn().mockResolvedValue("Asia/Seoul"),
}));

vi.mock("next-intl", () => ({
  useTranslations: vi.fn().mockImplementation((namespace: string) =>
    makeTranslator(namespace)
  ),
  NextIntlClientProvider: ({ children }: { children: unknown }) => children,
}));
