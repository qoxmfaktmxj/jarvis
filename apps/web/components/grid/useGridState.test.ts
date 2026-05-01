// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useGridState } from './useGridState';

type Row = { id: string; name: string; note: string | null };

const seed: Row[] = [
  { id: 'a', name: 'Alpha', note: null },
  { id: 'b', name: 'Beta', note: 'hi' },
];

describe('useGridState.update', () => {
  it('marks the row dirty when a field actually changes', () => {
    const { result } = renderHook(() => useGridState<Row>(seed));
    act(() => result.current.update('a', 'name', 'Alpha2'));
    expect(result.current.rows.find((r) => r.data.id === 'a')?.state).toBe('dirty');
    expect(result.current.dirtyCount).toBe(1);
  });

  it('does NOT mark the row dirty when committing the same value (bug repro: cell blur with no edit)', () => {
    const { result } = renderHook(() => useGridState<Row>(seed));
    // Simulate EditableTextCell blur firing onCommit(draft) where draft === current value.
    act(() => result.current.update('a', 'name', 'Alpha'));
    expect(result.current.rows.find((r) => r.data.id === 'a')?.state).toBe('clean');
    expect(result.current.dirtyCount).toBe(0);
  });

  it('does NOT mark dirty when committing the same null value', () => {
    const { result } = renderHook(() => useGridState<Row>(seed));
    act(() => result.current.update('a', 'note', null));
    expect(result.current.rows.find((r) => r.data.id === 'a')?.state).toBe('clean');
  });

  it('keeps "new" state when updating a freshly inserted row', () => {
    const { result } = renderHook(() => useGridState<Row>(seed));
    act(() => result.current.insertBlank({ id: 'c', name: '', note: null }));
    act(() => result.current.update('c', 'name', 'Gamma'));
    expect(result.current.rows.find((r) => r.data.id === 'c')?.state).toBe('new');
  });

  it('reverts row from dirty to clean when the edited field returns to its original value', () => {
    const { result } = renderHook(() => useGridState<Row>(seed));
    // A → A1 (dirty)
    act(() => result.current.update('a', 'name', 'Alpha2'));
    expect(result.current.rows.find((r) => r.data.id === 'a')?.state).toBe('dirty');
    expect(result.current.dirtyCount).toBe(1);
    // A1 → A (back to original — should return to clean)
    act(() => result.current.update('a', 'name', 'Alpha'));
    const row = result.current.rows.find((r) => r.data.id === 'a');
    expect(row?.state).toBe('clean');
    expect(row?.original).toBeUndefined();
    expect(result.current.dirtyCount).toBe(0);
  });

  it('reverts to clean across nullable fields (null ↔ value ↔ null)', () => {
    const { result } = renderHook(() => useGridState<Row>(seed));
    // null → 'memo'
    act(() => result.current.update('a', 'note', 'memo'));
    expect(result.current.rows.find((r) => r.data.id === 'a')?.state).toBe('dirty');
    // 'memo' → null
    act(() => result.current.update('a', 'note', null));
    expect(result.current.rows.find((r) => r.data.id === 'a')?.state).toBe('clean');
  });

  it('stays dirty when one field reverts but another remains changed', () => {
    const { result } = renderHook(() => useGridState<Row>(seed));
    // change two fields
    act(() => result.current.update('b', 'name', 'Beta2'));
    act(() => result.current.update('b', 'note', 'changed'));
    expect(result.current.rows.find((r) => r.data.id === 'b')?.state).toBe('dirty');
    // revert only one
    act(() => result.current.update('b', 'name', 'Beta'));
    const row = result.current.rows.find((r) => r.data.id === 'b');
    // still dirty because note diverges
    expect(row?.state).toBe('dirty');
    expect(row?.data.note).toBe('changed');
    expect(row?.original?.note).toBe('hi');
  });

  it('toBatch produces no patch for a row that reverted to clean', () => {
    const { result } = renderHook(() => useGridState<Row>(seed));
    act(() => result.current.update('a', 'name', 'Alpha2'));
    act(() => result.current.update('a', 'name', 'Alpha'));
    const batch = result.current.toBatch();
    expect(batch.updates).toEqual([]);
    expect(batch.creates).toEqual([]);
    expect(batch.deletes).toEqual([]);
  });
});
