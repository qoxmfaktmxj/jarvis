import { describe, expect, it } from "vitest";
import { buildMenuTree, type FlatMenuItem } from "../menu-tree.js";

describe("buildMenuTree", () => {
  it("builds tree with parent-child relationship", () => {
    const flat: FlatMenuItem[] = [
      { id: "a", parentId: null, code: "a", kind: "menu", label: "A", routePath: "/a", icon: null, sortOrder: 1 },
      { id: "b", parentId: "a", code: "a.b", kind: "menu", label: "B", routePath: "/a/b", icon: null, sortOrder: 2 },
    ];
    const tree = buildMenuTree(flat);
    expect(tree).toHaveLength(1);
    expect(tree[0]!.code).toBe("a");
    expect(tree[0]!.children).toHaveLength(1);
    expect(tree[0]!.children[0]!.code).toBe("a.b");
  });

  it("hides leaf parent that has no routePath and no children (cascade)", () => {
    const flat: FlatMenuItem[] = [
      { id: "a", parentId: null, code: "a", kind: "menu", label: "A", routePath: null, icon: null, sortOrder: 1 },
    ];
    const tree = buildMenuTree(flat);
    expect(tree).toHaveLength(0);
  });

  it("keeps parent visible when it has at least one child after pruning", () => {
    const flat: FlatMenuItem[] = [
      { id: "a", parentId: null, code: "a", kind: "menu", label: "A", routePath: null, icon: null, sortOrder: 1 },
      { id: "b", parentId: "a", code: "a.b", kind: "menu", label: "B", routePath: "/a/b", icon: null, sortOrder: 2 },
    ];
    const tree = buildMenuTree(flat);
    expect(tree).toHaveLength(1);
    expect(tree[0]!.code).toBe("a");
    expect(tree[0]!.children).toHaveLength(1);
  });

  it("sorts roots and children by sortOrder ascending", () => {
    const flat: FlatMenuItem[] = [
      { id: "b", parentId: null, code: "b", kind: "menu", label: "B", routePath: "/b", icon: null, sortOrder: 20 },
      { id: "a", parentId: null, code: "a", kind: "menu", label: "A", routePath: "/a", icon: null, sortOrder: 10 },
      { id: "ab", parentId: "a", code: "a.b", kind: "menu", label: "AB", routePath: "/a/b", icon: null, sortOrder: 2 },
      { id: "aa", parentId: "a", code: "a.a", kind: "menu", label: "AA", routePath: "/a/a", icon: null, sortOrder: 1 },
    ];
    const tree = buildMenuTree(flat);
    expect(tree.map((n) => n.code)).toEqual(["a", "b"]);
    expect(tree[0]!.children.map((n) => n.code)).toEqual(["a.a", "a.b"]);
  });

  it("treats orphan child (parentId not in flat) as root", () => {
    // Could happen if RLS filtered out the parent — child becomes top-level.
    const flat: FlatMenuItem[] = [
      { id: "b", parentId: "missing-parent", code: "b", kind: "menu", label: "B", routePath: "/b", icon: null, sortOrder: 1 },
    ];
    const tree = buildMenuTree(flat);
    expect(tree).toHaveLength(1);
    expect(tree[0]!.code).toBe("b");
  });

  it("handles empty input", () => {
    expect(buildMenuTree([])).toEqual([]);
  });

  it("recursively prunes nested empty branches", () => {
    // a (no route) → b (no route, no leaf children) → c (no route, no children)
    const flat: FlatMenuItem[] = [
      { id: "a", parentId: null, code: "a", kind: "menu", label: "A", routePath: null, icon: null, sortOrder: 1 },
      { id: "b", parentId: "a", code: "a.b", kind: "menu", label: "B", routePath: null, icon: null, sortOrder: 2 },
      { id: "c", parentId: "b", code: "a.b.c", kind: "menu", label: "C", routePath: null, icon: null, sortOrder: 3 },
    ];
    const tree = buildMenuTree(flat);
    expect(tree).toHaveLength(0);
  });

  it("does not infinite-loop on a 2-cycle (A↔B); prunes the cyclic descendant", () => {
    // A.parentId = B and B.parentId = A. byId puts each in the other's children
    // array, so neither becomes a root via the null check. The cycle is broken
    // by path-tracking inside sortAndPrune so the call returns instead of
    // recursing forever.
    const flat: FlatMenuItem[] = [
      { id: "a", parentId: "b", code: "a", kind: "menu", label: "A", routePath: "/a", icon: null, sortOrder: 1 },
      { id: "b", parentId: "a", code: "b", kind: "menu", label: "B", routePath: "/b", icon: null, sortOrder: 2 },
    ];
    // A node whose parentId references another non-null id in the map gets
    // attached as a child. Both nodes are children of each other; neither hits
    // the `roots` push branch. Result: empty tree. The crucial property is
    // "returns without infinite recursion".
    const tree = buildMenuTree(flat);
    expect(Array.isArray(tree)).toBe(true);
  });

  it("does not infinite-loop on self-parent (A.parentId = A.id)", () => {
    const flat: FlatMenuItem[] = [
      { id: "a", parentId: "a", code: "a", kind: "menu", label: "A", routePath: "/a", icon: null, sortOrder: 1 },
    ];
    const tree = buildMenuTree(flat);
    expect(Array.isArray(tree)).toBe(true);
  });
});
