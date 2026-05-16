/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import React, { createContext, useContext, type ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { ThemeColorPicker } from "./ThemeColorPicker";

type Messages = Record<string, unknown>;

const IntlCtx = createContext<Messages>({});

// Override setup.ts mock: inline messages를 NextIntlClientProvider props에서 읽도록
vi.mock("next-intl", () => {
  function MockNextIntlClientProvider({
    messages,
    children,
  }: {
    messages: Messages;
    locale: string;
    children: ReactNode;
  }) {
    return React.createElement(IntlCtx.Provider, { value: messages ?? {} }, children);
  }

  function resolve(obj: Record<string, unknown>, path: string): string | undefined {
    const parts = path.split(".");
    let current: unknown = obj;
    for (const part of parts) {
      if (current == null || typeof current !== "object") return undefined;
      current = (current as Record<string, unknown>)[part];
    }
    return typeof current === "string" ? current : undefined;
  }

  function mockUseTranslations(namespace: string) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const messages = useContext(IntlCtx);
    const nsObj = namespace.split(".").reduce<unknown>(
      (obj, key) =>
        obj != null && typeof obj === "object"
          ? (obj as Record<string, unknown>)[key]
          : undefined,
      messages
    );
    return (key: string) => {
      const raw =
        nsObj != null && typeof nsObj === "object"
          ? resolve(nsObj as Record<string, unknown>, key)
          : undefined;
      return raw ?? `${namespace}.${key}`;
    };
  }

  return { NextIntlClientProvider: MockNextIntlClientProvider, useTranslations: mockUseTranslations };
});

const messages = {
  Theme: {
    picker: {
      title: "테마 색상",
      aria: "테마 색상 선택",
    },
    colors: {
      blue: "Notion Blue",
      indigo: "Indigo",
      teal: "Teal",
      forest: "Forest",
      graphite: "Graphite",
    },
  },
};

function renderPicker() {
  return render(
    <NextIntlClientProvider locale="ko" messages={messages}>
      <ThemeColorPicker />
    </NextIntlClientProvider>
  );
}

describe("ThemeColorPicker", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme-color");
  });

  afterEach(() => {
    cleanup();
  });

  it("5개 swatch radio 렌더", () => {
    renderPicker();
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(5);
  });

  it("각 swatch가 aria-label로 색상 이름 노출", () => {
    renderPicker();
    expect(screen.getByRole("radio", { name: "Notion Blue" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Indigo" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Teal" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Forest" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Graphite" })).toBeTruthy();
  });

  it("초기 active = 'blue' (DEFAULT_THEME_COLOR)", () => {
    renderPicker();
    expect(screen.getByRole("radio", { name: "Notion Blue" }).getAttribute("aria-checked")).toBe(
      "true"
    );
  });

  it("swatch 클릭 시 localStorage + data-theme-color 업데이트", () => {
    renderPicker();
    fireEvent.click(screen.getByRole("radio", { name: "Forest" }));
    expect(window.localStorage.getItem("jv.themeColor")).toBe("forest");
    expect(document.documentElement.getAttribute("data-theme-color")).toBe("forest");
    expect(screen.getByRole("radio", { name: "Forest" }).getAttribute("aria-checked")).toBe(
      "true"
    );
  });

  it("radiogroup이 aria-label 가짐", () => {
    renderPicker();
    expect(screen.getByRole("radiogroup", { name: "테마 색상 선택" })).toBeTruthy();
  });
});
