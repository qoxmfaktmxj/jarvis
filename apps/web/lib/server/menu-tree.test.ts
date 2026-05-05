import { describe, it, expect } from "vitest";
import { buildMenuTree, type FlatMenuItem } from "./menu-tree.js";

const baseRow = (over: Partial<FlatMenuItem>): FlatMenuItem => ({
  id: "id-" + Math.random().toString(36).slice(2),
  parentId: null,
  code: "code",
  kind: "menu",
  label: "Label",
  icon: null,
  routePath: null,
  sortOrder: 0,
  ...over,
});

describe("buildMenuTree — empty-group prune", () => {
  it("prunes group header (routePath='') with no children", () => {
    const flat: FlatMenuItem[] = [
      baseRow({ id: "h1", code: "group.knowledge", routePath: "", sortOrder: 1 }),
    ];
    const tree = buildMenuTree(flat);
    expect(tree).toHaveLength(0);
  });

  it("keeps group header when it has at least one visible child", () => {
    const flat: FlatMenuItem[] = [
      baseRow({ id: "h1", code: "group.knowledge", routePath: "", sortOrder: 1 }),
      baseRow({ id: "c1", parentId: "h1", code: "nav.ask", routePath: "/ask", sortOrder: 2 }),
    ];
    const tree = buildMenuTree(flat);
    expect(tree).toHaveLength(1);
    expect(tree[0]!.code).toBe("group.knowledge");
    expect(tree[0]!.children).toHaveLength(1);
    expect(tree[0]!.children[0]!.code).toBe("nav.ask");
  });

  it("keeps two-level group when leaf is under sub-group", () => {
    const flat: FlatMenuItem[] = [
      baseRow({ id: "h1", code: "group.sales", routePath: "", sortOrder: 1 }),
      baseRow({ id: "h2", parentId: "h1", code: "group.sales.master", routePath: "", sortOrder: 2 }),
      baseRow({ id: "c1", parentId: "h2", code: "sales.customers", routePath: "/sales/customers", sortOrder: 3 }),
    ];
    const tree = buildMenuTree(flat);
    expect(tree).toHaveLength(1);
    expect(tree[0]!.code).toBe("group.sales");
    expect(tree[0]!.children[0]!.code).toBe("group.sales.master");
    expect(tree[0]!.children[0]!.children[0]!.code).toBe("sales.customers");
  });

  it("prunes empty sub-group but keeps top-level when sibling sub-group has leaf", () => {
    const flat: FlatMenuItem[] = [
      baseRow({ id: "h1", code: "group.sales", routePath: "", sortOrder: 1 }),
      baseRow({ id: "h2", parentId: "h1", code: "group.sales.master", routePath: "", sortOrder: 2 }),
      baseRow({ id: "h3", parentId: "h1", code: "group.sales.empty", routePath: "", sortOrder: 3 }),
      baseRow({ id: "c1", parentId: "h2", code: "sales.customers", routePath: "/sales/customers", sortOrder: 4 }),
    ];
    const tree = buildMenuTree(flat);
    expect(tree[0]!.children).toHaveLength(1);
    expect(tree[0]!.children[0]!.code).toBe("group.sales.master");
  });
});
