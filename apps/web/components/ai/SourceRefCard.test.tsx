import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SourceRefCard } from "./SourceRefCard";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: { date?: string }) =>
    ({
      sourceDocument: "원문 근거",
      wikiDocument: "Wiki 문서",
      effectiveFrom: `기준일 ${values?.date}`,
      openDocument: "문서 열기",
    })[key] ?? key,
}));

describe("SourceRefCard", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("React", React);
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("describes a Fact collection as a source document without exposing its locator", async () => {
    await act(async () => root.render(
      <SourceRefCard source={{
        kind: "source",
        label: "source-revision#fact-f-a00008",
        title: "2026 원천징수 검증 Fact 모음",
        locator: "fact-f-a00008",
        effectiveFrom: "2026-06-15T00:00:00.000Z",
      }} />,
    ));

    expect(container).toHaveTextContent("원문 근거");
    expect(container).toHaveTextContent("2026 원천징수 검증 Fact 모음");
    expect(container).toHaveTextContent("기준일 2026. 6. 15.");
    expect(container.querySelector("[data-testid='citation-locator']")).not.toBeInTheDocument();
  });
});
