/**
 * scripts/tests/graphify-postprocess.test.ts
 *
 * Unit tests for graphify-postprocess (Task 15 — Graphify raw output → Jarvis derived/code 페이지).
 * Pure-function tests only — no filesystem I/O.
 *
 * Run:
 *   pnpm exec vitest run scripts/tests/graphify-postprocess.test.ts
 */

import { describe, it, expect } from "vitest";
import { addFrontmatter, inferKind, detectModule } from "../graphify-postprocess.js";

describe("addFrontmatter", () => {
  it("adds Jarvis-compatible frontmatter to raw Graphify markdown", () => {
    const raw = `# P_HRI_AFTER_PROC_EXEC\n\nSome body\n`;
    const out = addFrontmatter(raw, {
      name: "P_HRI_AFTER_PROC_EXEC",
      module: "HRM",
      kind: "procedure",
      source: "ehr5/procedures/hri/after_proc_exec.sql",
    });
    expect(out).toContain("---\n");
    expect(out).toContain('title: "P_HRI_AFTER_PROC_EXEC"');
    expect(out).toContain("type: derived");
    expect(out).toContain("authority: auto");
    expect(out).toContain("domain: code/HRM");
    expect(out).toContain("module: HRM");
    expect(out).toContain("kind: procedure");
    expect(out).toContain("aliases:");
  });

  it("includes 3 default aliases (identifier + kind 한국어 + module)", () => {
    const out = addFrontmatter("# P_SAL_CALC_EXEC\n", {
      name: "P_SAL_CALC_EXEC",
      module: "CPN",
      kind: "procedure",
      source: "ehr5/procedures/cpn/sal_calc.sql",
    });
    expect(out).toMatch(/- "P_SAL_CALC_EXEC"/);
    expect(out).toMatch(/- ".*프로시저"/); // kind 한국어
  });

  it("sets sensitivity to INTERNAL", () => {
    const out = addFrontmatter("# TB_EMPLOYEE\n", {
      name: "TB_EMPLOYEE",
      module: "HRM",
      kind: "table",
      source: "ehr5/tables/tb_employee.sql",
    });
    expect(out).toContain("sensitivity: INTERNAL");
  });

  it("includes source field in frontmatter", () => {
    const out = addFrontmatter("# V_EMP_MASTER\n", {
      name: "V_EMP_MASTER",
      module: "HRM",
      kind: "view",
      source: "ehr5/views/v_emp_master.sql",
    });
    expect(out).toContain('source: "ehr5/views/v_emp_master.sql"');
  });

  it("includes tags with derived/code, module, kind", () => {
    const out = addFrontmatter("# F_NEXT_APPROVER\n", {
      name: "F_NEXT_APPROVER",
      module: "APV",
      kind: "function",
      source: "ehr5/functions/f_next_approver.sql",
    });
    expect(out).toContain('"derived/code"');
    expect(out).toContain('"module/APV"');
    expect(out).toContain('"kind/function"');
  });

  it("includes linkedPages when callees are provided", () => {
    const out = addFrontmatter("# P_SUBMIT\n", {
      name: "P_SUBMIT",
      module: "APV",
      kind: "procedure",
      source: "ehr5/procedures/p_submit.sql",
      callees: ["F_NEXT_APPROVER", "TB_APPROVAL"],
    });
    expect(out).toContain("linkedPages:");
    expect(out).toContain("code/APV/functions/F_NEXT_APPROVER");
    expect(out).toContain("code/APV/tables/TB_APPROVAL");
  });

  it("includes calledBy when callers are provided", () => {
    const out = addFrontmatter("# F_HELPER\n", {
      name: "F_HELPER",
      module: "APV",
      kind: "function",
      source: "ehr5/functions/f_helper.sql",
      callers: ["P_SUBMIT"],
    });
    expect(out).toContain("calledBy:");
    expect(out).toContain("code/APV/procedures/P_SUBMIT");
  });

  it("omits linkedPages and calledBy when empty", () => {
    const out = addFrontmatter("# TB_SIMPLE\n", {
      name: "TB_SIMPLE",
      module: "HRM",
      kind: "table",
      source: "ehr5/tables/tb_simple.sql",
    });
    expect(out).not.toContain("linkedPages:");
    expect(out).not.toContain("calledBy:");
  });

  it("prepends frontmatter so raw body follows", () => {
    const raw = "# P_FOO\n\nBody content here.\n";
    const out = addFrontmatter(raw, {
      name: "P_FOO",
      module: "HRM",
      kind: "procedure",
      source: "ehr5/procedures/p_foo.sql",
    });
    // frontmatter가 먼저, 그 뒤 raw body
    const fmEnd = out.indexOf("---\n", 4); // 두 번째 ---
    expect(fmEnd).toBeGreaterThan(0);
    const bodyPart = out.slice(fmEnd + 4);
    expect(bodyPart).toContain("# P_FOO");
    expect(bodyPart).toContain("Body content here.");
  });
});

describe("inferKind", () => {
  it.each([
    ["P_HRI_SUBMIT", "procedure"],
    ["F_NEXT_APPROVER", "function"],
    ["TB_APPROVAL", "table"],
    ["V_EMPLOYEE_MASTER", "view"],
  ])("%s → %s", (name, expected) => {
    expect(inferKind(name)).toBe(expected);
  });

  it("returns 'unknown' for unrecognized pattern", () => {
    expect(inferKind("randomname")).toBe("unknown");
  });

  it("is case-insensitive for prefix matching", () => {
    expect(inferKind("p_lowercase")).toBe("procedure");
    expect(inferKind("f_lowercase")).toBe("function");
    expect(inferKind("tb_lowercase")).toBe("table");
    expect(inferKind("v_lowercase")).toBe("view");
  });
});

describe("detectModule", () => {
  it("extracts module from path segment", () => {
    expect(detectModule("HRM/procedures/foo.md")).toBe("HRM");
  });

  it("handles Windows-style backslash separators", () => {
    expect(detectModule("CPN\\functions\\bar.md")).toBe("CPN");
  });

  it("returns single segment as-is when no separator", () => {
    expect(detectModule("APV")).toBe("APV");
  });
});
