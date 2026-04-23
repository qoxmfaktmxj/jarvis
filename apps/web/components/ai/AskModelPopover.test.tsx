import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { AskModelPopover, type AskModelOption } from "./AskModelPopover";

const OPTIONS: AskModelOption[] = [
  { value: "gpt-5.4-mini", label: "Mini", description: "빠름 · 기본" },
  { value: "gpt-5.4", label: "Full", description: "정밀 · 약 10배 비용" },
];

describe("AskModelPopover", () => {
  it("renders the current selection label in the trigger", () => {
    const html = renderToStaticMarkup(
      <AskModelPopover value="gpt-5.4" onChange={() => {}} options={OPTIONS} />,
    );
    expect(html).toContain("Full");
  });

  it("falls back to the first option when value is unknown", () => {
    const html = renderToStaticMarkup(
      <AskModelPopover value="nope" onChange={() => {}} options={OPTIONS} />,
    );
    expect(html).toContain("Mini");
  });

  it("renders nothing when the options list is empty", () => {
    const html = renderToStaticMarkup(
      <AskModelPopover value="x" onChange={() => {}} options={[]} />,
    );
    expect(html).toBe("");
  });
});
