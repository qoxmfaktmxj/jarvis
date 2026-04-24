import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { StatusChip, STATUS_LABELS } from "./StatusChip";

describe("StatusChip", () => {
  it("renders done with green palette tokens", () => {
    const html = renderToStaticMarkup(<StatusChip status="done" />);
    expect(html).toContain("bg-[--status-done-bg]");
    expect(html).toContain("text-[--status-done-fg]");
    expect(html).toContain(STATUS_LABELS.done);
  });

  it("renders danger with red palette tokens and border", () => {
    const html = renderToStaticMarkup(<StatusChip status="danger" />);
    expect(html).toContain("bg-[--status-danger-bg]");
    expect(html).toContain("text-[--status-danger-fg]");
    expect(html).toContain("border-[--color-red-200]");
  });

  it("treats unknown status as neutral", () => {
    // @ts-expect-error intentionally wrong
    const html = renderToStaticMarkup(<StatusChip status="mystery" />);
    expect(html).toContain("bg-[--status-neutral-bg]");
  });

  it("respects size='lg' (T1) padding", () => {
    const html = renderToStaticMarkup(<StatusChip status="active" size="lg" />);
    expect(html).toContain("px-2.5");
    expect(html).toContain("text-[12px]");
  });

  it("defaults to T3 sm with 10.5px text", () => {
    const html = renderToStaticMarkup(<StatusChip status="active" />);
    expect(html).toContain("text-[10.5px]");
  });

  it("renders custom label prop over default", () => {
    const html = renderToStaticMarkup(<StatusChip status="done" label="닫힘" />);
    expect(html).toContain("닫힘");
    expect(html).not.toContain(STATUS_LABELS.done);
  });

  it("shows status dot by default", () => {
    const html = renderToStaticMarkup(<StatusChip status="progress" />);
    expect(html).toContain("rounded-full"); // dot + chip both full; chip has "rounded-full"
    expect(html.match(/rounded-full/g)?.length).toBeGreaterThanOrEqual(2); // dot + chip
  });

  it("hides status dot when dot={false}", () => {
    const html = renderToStaticMarkup(<StatusChip status="progress" dot={false} />);
    expect(html.match(/rounded-full/g)?.length).toBe(1); // only chip
  });
});
