import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { PriorityChip } from "./PriorityChip";

describe("PriorityChip", () => {
  it("P1 renders with red palette and border", () => {
    const html = renderToStaticMarkup(<PriorityChip priority="P1" />);
    expect(html).toContain("bg-[--color-red-50]");
    expect(html).toContain("text-[--color-red-500]");
    expect(html).toContain("border-[--color-red-200]");
    expect(html).toContain(">P1<");
  });

  it("P2 renders with orange palette", () => {
    const html = renderToStaticMarkup(<PriorityChip priority="P2" />);
    expect(html).toContain("bg-[--color-orange-50]");
    expect(html).toContain("text-[--color-orange]");
  });

  it("P3 renders with neutral palette", () => {
    const html = renderToStaticMarkup(<PriorityChip priority="P3" />);
    expect(html).toContain("bg-[--bg-surface]");
    expect(html).toContain("text-[--fg-secondary]");
  });

  it("uses uppercase tracking-wide typography (not StatusChip shape)", () => {
    const html = renderToStaticMarkup(<PriorityChip priority="P1" />);
    expect(html).toContain("uppercase");
    expect(html).toContain("tracking-[0.08em]");
  });

  it("does not render a dot (priority is static, not stateful)", () => {
    const html = renderToStaticMarkup(<PriorityChip priority="P1" />);
    // chip has rounded-full; there should be NO second rounded-full (no dot).
    expect(html.match(/rounded-full/g)?.length).toBe(1);
  });
});
