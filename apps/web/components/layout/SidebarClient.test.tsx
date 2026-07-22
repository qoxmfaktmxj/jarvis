import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SidebarClient } from "./SidebarClient";

let pathname = "/dashboard";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

vi.mock("lucide-react", () => ({
  Circle: (props: React.SVGProps<SVGSVGElement>) => <svg data-testid="menu-icon" {...props} />,
  PanelLeftClose: (props: React.SVGProps<SVGSVGElement>) => <svg data-testid="panel-left-close" {...props} />,
  PanelLeftOpen: (props: React.SVGProps<SVGSVGElement>) => <svg data-testid="panel-left-open" {...props} />,
}));

vi.mock("./icon-map", () => ({
  getMenuIcon: () => (props: React.SVGProps<SVGSVGElement>) => <svg data-testid="menu-icon" {...props} />,
}));

const items = [{
  id: "ask",
  code: "nav.ask",
  label: "Ask AI",
  icon: null,
  kind: "page" as const,
  routePath: "/ask",
  sortOrder: 10,
  children: [],
}];

const labels = {
  primary: "주 메뉴",
  productName: "Jarvis",
  collapseSidebar: "사이드바 접기",
  expandSidebar: "사이드바 펼치기",
  goDashboard: "대시보드로 이동",
};

describe("SidebarClient", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("React", React);
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    pathname = "/dashboard";
    localStorage.clear();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("renders the exact Jarvis dashboard brand and a close toggle", async () => {
    await act(async () => root.render(<SidebarClient items={items} labels={labels} />));

    const brand = container.querySelector('a[href="/dashboard"]');
    expect(brand).toHaveTextContent("Jarvis");
    expect(brand).toHaveAttribute("aria-label", "대시보드로 이동");
    expect(container.querySelector('[data-testid="panel-left-close"]')).toBeInTheDocument();
  });

  it("switches to rail mode and persists the selection", async () => {
    await act(async () => root.render(<SidebarClient items={items} labels={labels} />));
    const toggle = container.querySelector('button[aria-label="사이드바 접기"]') as HTMLButtonElement;

    await act(async () => toggle.click());

    expect(localStorage.getItem("jarvis.sidebar.mode")).toBe("rail");
    expect(container.querySelector('[data-testid="panel-left-open"]')).toBeInTheDocument();
    expect(container.querySelector('a[href="/ask"]')).toHaveAttribute("title", "Ask AI");
  });

  it("starts in rail mode when it first hydrates on /ask", async () => {
    pathname = "/ask";
    localStorage.setItem("jarvis.sidebar.mode", "expanded");

    await act(async () => root.render(<SidebarClient items={items} labels={labels} />));

    expect(localStorage.getItem("jarvis.sidebar.mode")).toBe("rail");
    expect(container.querySelector('[data-testid="panel-left-open"]')).toBeInTheDocument();
  });

  it("collapses when navigating from a non-Ask route to /ask", async () => {
    await act(async () => root.render(<SidebarClient items={items} labels={labels} />));
    pathname = "/ask";

    await act(async () => root.render(<SidebarClient items={items} labels={labels} />));

    expect(localStorage.getItem("jarvis.sidebar.mode")).toBe("rail");
    expect(container.querySelector('[data-testid="panel-left-open"]')).toBeInTheDocument();
  });

  it("keeps a manual reopen while the pathname remains /ask", async () => {
    pathname = "/ask";
    await act(async () => root.render(<SidebarClient items={items} labels={labels} />));
    const toggle = container.querySelector('button[aria-label="사이드바 펼치기"]') as HTMLButtonElement;

    await act(async () => toggle.click());

    expect(localStorage.getItem("jarvis.sidebar.mode")).toBe("expanded");
    expect(container.querySelector('[data-testid="panel-left-close"]')).toBeInTheDocument();
  });
});
