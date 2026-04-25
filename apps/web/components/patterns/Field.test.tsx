import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { Field } from "./Field";

describe("Field", () => {
  it("renders label with uppercase tracking typography", () => {
    const html = renderToStaticMarkup(
      <Field label="Title">
        <input />
      </Field>
    );
    expect(html).toContain("uppercase");
    expect(html).toContain("tracking-[0.12em]");
    expect(html).toContain("text-[10px]");
    expect(html).toContain(">Title<");
  });

  it("wraps in <label> for click-to-focus", () => {
    const html = renderToStaticMarkup(
      <Field label="Email">
        <input />
      </Field>
    );
    expect(html).toMatch(/^<label/);
  });

  it("applies md:col-span-2 when span=2", () => {
    const html = renderToStaticMarkup(
      <Field label="Description" span={2}>
        <textarea />
      </Field>
    );
    expect(html).toContain("md:col-span-2");
  });

  it("renders error slot when error prop is set", () => {
    const html = renderToStaticMarkup(
      <Field label="Email" error="이메일 형식이 올바르지 않습니다">
        <input />
      </Field>
    );
    expect(html).toContain("이메일 형식이 올바르지 않습니다");
    expect(html).toContain("text-[--color-red-500]");
  });

  it("does not render error slot when error is undefined", () => {
    const html = renderToStaticMarkup(
      <Field label="Email">
        <input />
      </Field>
    );
    expect(html).not.toContain("text-[--color-red-500]");
  });

  it("label gets --fg-secondary color", () => {
    const html = renderToStaticMarkup(
      <Field label="Title">
        <input />
      </Field>
    );
    expect(html).toContain("text-[--fg-secondary]");
  });
});
