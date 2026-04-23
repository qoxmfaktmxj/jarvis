import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { AskContextGauge } from "./AskContextGauge";

describe("AskContextGauge", () => {
  it("renders the percentage label", () => {
    const html = renderToStaticMarkup(
      <AskContextGauge usedTokens={100_000} totalWindow={400_000} />,
    );
    expect(html).toContain("25%");
  });

  it("rounds to the nearest integer percent", () => {
    const html = renderToStaticMarkup(
      <AskContextGauge usedTokens={42_345} totalWindow={400_000} />,
    );
    expect(html).toContain("11%");
  });

  it("clamps percentages above 100 to 100", () => {
    const html = renderToStaticMarkup(
      <AskContextGauge usedTokens={500_000} totalWindow={400_000} />,
    );
    expect(html).toContain("100%");
  });

  it("renders 0% when no tokens have been used", () => {
    const html = renderToStaticMarkup(
      <AskContextGauge usedTokens={0} totalWindow={400_000} />,
    );
    expect(html).toContain("0%");
  });

  it("treats invalid window (<=0) as 0%", () => {
    const html = renderToStaticMarkup(
      <AskContextGauge usedTokens={5_000} totalWindow={0} />,
    );
    expect(html).toContain("0%");
  });

  it("includes an accessible label with used and total tokens", () => {
    const html = renderToStaticMarkup(
      <AskContextGauge usedTokens={100_000} totalWindow={400_000} />,
    );
    expect(html).toMatch(/aria-label="[^"]*100[,.]?000[^"]*400[,.]?000/);
  });
});
