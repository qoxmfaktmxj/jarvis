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
});
