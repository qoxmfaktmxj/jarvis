// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAskSidebarCollapsed } from './useAskSidebarCollapsed';

describe('useAskSidebarCollapsed', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  it('defaults to expanded (false) when localStorage is empty', () => {
    const { result } = renderHook(() => useAskSidebarCollapsed());
    expect(result.current[0]).toBe(false);
  });

  it('reads "true" from localStorage on mount', () => {
    window.localStorage.setItem('jv.askSidebar', 'collapsed');
    const { result } = renderHook(() => useAskSidebarCollapsed());
    expect(result.current[0]).toBe(true);
  });

  it('persists to localStorage when toggled', () => {
    const { result } = renderHook(() => useAskSidebarCollapsed());
    act(() => {
      result.current[1](true);
    });
    expect(window.localStorage.getItem('jv.askSidebar')).toBe('collapsed');
    act(() => {
      result.current[1](false);
    });
    expect(window.localStorage.getItem('jv.askSidebar')).toBe('expanded');
  });

  it('ignores unknown localStorage values', () => {
    window.localStorage.setItem('jv.askSidebar', 'gibberish');
    const { result } = renderHook(() => useAskSidebarCollapsed());
    expect(result.current[0]).toBe(false);
  });
});
