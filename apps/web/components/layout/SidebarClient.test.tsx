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

const groupedItems = [{
  id: "work",
  code: "nav.work",
  label: "업무",
  icon: null,
  kind: "group" as const,
  routePath: null,
  sortOrder: 10,
  children: [{
    id: "leave",
    code: "nav.leave",
    label: "휴가 신청",
    icon: null,
    kind: "page" as const,
    routePath: "/ask",
    sortOrder: 20,
    children: [],
  }],
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
    const railLink = [...container.querySelectorAll<HTMLAnchorElement>('a[href="/ask"]')].find(
      (link) => link.title === "Ask AI",
    );
    expect(railLink).toHaveAttribute("title", "Ask AI");
  });

  it("starts in rail mode when it first hydrates on a nested Ask route", async () => {
    pathname = "/ask/conversations/1";
    localStorage.setItem("jarvis.sidebar.mode", "expanded");

    await act(async () => root.render(<SidebarClient items={items} labels={labels} />));

    expect(localStorage.getItem("jarvis.sidebar.mode")).toBe("rail");
    expect(container.querySelector('[data-testid="panel-left-open"]')).toBeInTheDocument();
  });

  it("collapses when navigating from a non-Ask route to a nested Ask route", async () => {
    await act(async () => root.render(<SidebarClient items={items} labels={labels} />));
    pathname = "/ask/conversations/1";

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

  it("keeps a manual reopen while navigating within Ask routes", async () => {
    pathname = "/ask";
    await act(async () => root.render(<SidebarClient items={items} labels={labels} />));
    const toggle = container.querySelector('button[aria-label="사이드바 펼치기"]') as HTMLButtonElement;

    await act(async () => toggle.click());
    pathname = "/ask/conversations/1";
    await act(async () => root.render(<SidebarClient items={items} labels={labels} />));

    expect(localStorage.getItem("jarvis.sidebar.mode")).toBe("expanded");
    expect(container.querySelector('[data-testid="panel-left-close"]')).toBeInTheDocument();
  });

  it("keeps the grouped horizontal mobile menu when desktop is in rail mode", async () => {
    await act(async () => root.render(<SidebarClient items={groupedItems} labels={labels} />));
    const toggle = container.querySelector('button[aria-label="사이드바 접기"]') as HTMLButtonElement;
    await act(async () => toggle.click());

    const mobileMenu = [...container.querySelectorAll("ul")].find(
      (element) => element.className === "flex gap-1 lg:hidden",
    );
    const groupHeader = [...(mobileMenu?.querySelectorAll("div") ?? [])].find(
      (element) => element.textContent === "업무",
    );
    const child = mobileMenu?.querySelector('a[href="/ask"] span');

    expect(groupHeader).toBeInTheDocument();
    expect(child).toHaveStyle({ paddingLeft: "12px" });
  });
});
