// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useNavTreeOpen, computeInitialOpen, NAV_TREE_KEY } from './useNavTreeOpen';
import type { MenuTreeNode } from '@/lib/server/menu-tree';

const mkNode = (over: Partial<MenuTreeNode>): MenuTreeNode => ({
  id: over.id ?? over.code ?? 'id',
  parentId: over.parentId ?? null,
  code: over.code ?? 'code',
  kind: 'menu',
  label: over.label ?? 'Label',
  icon: null,
  routePath: over.routePath ?? null,
  sortOrder: over.sortOrder ?? 0,
  badge: null,
  keywords: null,
  children: over.children ?? [],
});

const TREE: MenuTreeNode[] = [
  mkNode({
    code: 'group.knowledge',
    routePath: '',
    children: [
      mkNode({ code: 'nav.ask', routePath: '/ask' }),
      mkNode({ code: 'nav.wiki', routePath: '/wiki' }),
    ],
  }),
  mkNode({
    code: 'group.sales',
    routePath: '',
    children: [
      mkNode({
        code: 'group.sales.master',
        routePath: '',
        children: [mkNode({ code: 'sales.customers', routePath: '/sales/customers' })],
      }),
    ],
  }),
];

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => {
  window.localStorage.clear();
});

describe('computeInitialOpen', () => {
  it('opens only the active group when storage is empty', () => {
    const open = computeInitialOpen(TREE, '/ask', null);
    expect(open['group.knowledge']).toBe(true);
    expect(open['group.sales']).toBeFalsy();
  });

  it('opens both top-level and sub-group when active route is two levels deep', () => {
    const open = computeInitialOpen(TREE, '/sales/customers', null);
    expect(open['group.sales']).toBe(true);
    expect(open['group.sales.master']).toBe(true);
    expect(open['group.knowledge']).toBeFalsy();
  });

  it('respects stored values over active-route default', () => {
    const stored = { 'group.knowledge': false, 'group.sales': true };
    const open = computeInitialOpen(TREE, '/ask', stored);
    expect(open['group.knowledge']).toBe(false);
    expect(open['group.sales']).toBe(true);
  });
});

describe('useNavTreeOpen', () => {
  it('toggles open state and persists to localStorage', () => {
    const { result } = renderHook(() => useNavTreeOpen({ menus: TREE, pathname: '/ask' }));
    expect(result.current.isOpen('group.knowledge')).toBe(true);
    expect(result.current.isOpen('group.sales')).toBe(false);

    act(() => result.current.toggle('group.sales'));
    expect(result.current.isOpen('group.sales')).toBe(true);

    const raw = window.localStorage.getItem(NAV_TREE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed['group.sales']).toBe(true);
  });
});
