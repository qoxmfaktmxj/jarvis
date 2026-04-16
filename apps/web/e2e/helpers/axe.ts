import type { Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { expect } from "@playwright/test";

/**
 * Run axe-core WCAG 2.1 AA audit on the current page state.
 * Fails test if any violations are found.
 *
 * Usage:
 *   await expectNoA11yViolations(page);
 *   await expectNoA11yViolations(page, "dashboard loaded state");
 */
export async function expectNoA11yViolations(
  page: Page,
  context: string = "a11y audit",
): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .disableRules([
      // Disable rules that fire noise on React apps during dev
      "color-contrast", // let explicit design review handle; tokens are OKLCH engineered
    ])
    .analyze();

  if (results.violations.length > 0) {
    const summary = results.violations
      .map(
        (v) =>
          `  [${v.impact}] ${v.id}: ${v.help}\n    nodes: ${v.nodes.length}\n    first: ${v.nodes[0]?.target.join(" ") ?? "?"}`,
      )
      .join("\n");
    throw new Error(`Axe found ${results.violations.length} a11y violations in "${context}":\n${summary}`);
  }

  expect(results.violations, `a11y violations (${context})`).toEqual([]);
}

/**
 * Lenient version: log violations as warnings but don't fail the test.
 * Use during migration when some violations are known.
 */
export async function reportA11yViolations(
  page: Page,
  context: string = "a11y audit",
): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();

  if (results.violations.length > 0) {
    console.warn(
      `\n[axe] ${results.violations.length} violations in "${context}":\n` +
        results.violations.map((v) => `  [${v.impact}] ${v.id}: ${v.help}`).join("\n"),
    );
  }
}
