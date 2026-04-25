import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { NativeSelect } from "./NativeSelect";

describe("NativeSelect", () => {
  const opts = [
    { value: "todo", label: "할 일" },
    { value: "done", label: "완료" },
  ];

  it("renders <select> with provided options", () => {
    const html = renderToStaticMarkup(
      <NativeSelect value="todo" onChange={() => {}} options={opts} />
    );
    expect(html).toContain("<select");
    expect(html).toContain(">할 일<");
    expect(html).toContain(">완료<");
  });

  it("applies 32px height in default (T3) size", () => {
    const html = renderToStaticMarkup(
      <NativeSelect value="todo" onChange={() => {}} options={opts} />
    );
    expect(html).toContain("h-8");
    expect(html).toContain("text-[13px]");
  });

  it("applies compact 28px height when compact prop is true", () => {
    const html = renderToStaticMarkup(
      <NativeSelect value="todo" onChange={() => {}} options={opts} compact />
    );
    expect(html).toContain("h-7");
    expect(html).toContain("text-[12px]");
  });

  it("uses --bg-page background and --border-default border", () => {
    const html = renderToStaticMarkup(
      <NativeSelect value="todo" onChange={() => {}} options={opts} />
    );
    expect(html).toContain("bg-[--bg-page]");
    expect(html).toContain("border-[--border-default]");
  });

  it("shows disabled state styling", () => {
    const html = renderToStaticMarkup(
      <NativeSelect value="todo" onChange={() => {}} options={opts} disabled />
    );
    expect(html).toContain("disabled");
    expect(html).toContain("opacity-60");
  });
});
