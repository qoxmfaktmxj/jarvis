'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface SearchBarProps {
  defaultValue?: string;
  className?: string;
  autoFocus?: boolean;
}

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

export function SearchBar({ defaultValue = '', className, autoFocus }: SearchBarProps) {
  const router = useRouter();
  const inputId = 'search-bar-input';
  const containerRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState(defaultValue);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const debouncedQuery = useDebounce(query, 300);

  // Fetch suggestions when debounced query changes
  useEffect(() => {
    if (debouncedQuery.trim().length < 2) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    fetch(`/api/search/suggest?q=${encodeURIComponent(debouncedQuery)}`)
      .then((res) => res.json())
      .then((data: string[]) => {
        if (!cancelled) {
          setSuggestions(data);
          setIsOpen(data.length > 0);
          setSelectedIndex(-1);
        }
      })
      .catch(() => {
        if (!cancelled) setSuggestions([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const navigate = useCallback(
    (q: string) => {
      if (!q.trim()) return;
      setIsOpen(false);
      router.push(`/search?q=${encodeURIComponent(q.trim())}`);
    },
    [router],
  );

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      const selected = suggestions[selectedIndex];
      navigate(selected ?? query);
      return;
    }
    if (e.key === 'Escape') {
      setIsOpen(false);
      setSelectedIndex(-1);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, suggestions.length - 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, -1));
      return;
    }
  }

  return (
    <div ref={containerRef} className={cn('relative w-full', className)}>
      <div className="relative">
        <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400" />
        <Input
          id={inputId}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => suggestions.length > 0 && setIsOpen(true)}
          placeholder="위키, 런북, 회의록, 코드… 검색"
          className="h-12 rounded-md border-surface-200 bg-white pl-11 pr-11 text-[15px] shadow-[0_1px_2px_rgba(15,23,42,0.04)] placeholder:text-surface-400 focus-visible:border-isu-500 focus-visible:ring-isu-200"
          // eslint-disable-next-line jsx-a11y/no-autofocus -- intentional: primary focus target on mount
          autoFocus={autoFocus}
          aria-label="검색"
        />
        {isLoading ? (
          <Loader2 className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-surface-400" />
        ) : query ? (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setSuggestions([]);
              setIsOpen(false);
              document.getElementById(inputId)?.focus();
            }}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-surface-400 transition-colors hover:text-surface-700"
            aria-label="검색어 지우기"
          >
            <X className="h-4 w-4" />
          </button>
        ) : (
          <kbd className="text-display absolute right-4 top-1/2 hidden -translate-y-1/2 items-center gap-1 rounded border border-surface-200 bg-surface-50 px-1.5 py-0.5 text-[10px] font-medium text-surface-500 sm:inline-flex">
            <span className="text-[11px]">⌘</span>K
          </kbd>
        )}
      </div>

      {isOpen && suggestions.length > 0 && (
        <div
          id="search-suggestions"
          role="listbox"
          aria-label="추천 검색어"
          className="absolute top-full z-50 mt-2 w-full overflow-hidden rounded-md border border-surface-200 bg-white shadow-lg ring-1 ring-black/5"
        >
          <div className="p-1.5">
            <p className="text-display px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-surface-400">
              추천 검색어
            </p>
            {suggestions.map((suggestion, index) => (
              <button
                key={suggestion}
                role="option"
                aria-selected={selectedIndex === index}
                type="button"
                onClick={() => navigate(suggestion)}
                className={cn(
                  'flex w-full cursor-pointer items-center gap-2.5 rounded-[6px] px-2.5 py-2 text-sm transition-colors',
                  selectedIndex === index
                    ? 'bg-isu-50 text-isu-800'
                    : 'text-surface-700 hover:bg-surface-100',
                )}
              >
                <Search
                  className={cn(
                    'h-3.5 w-3.5',
                    selectedIndex === index ? 'text-isu-500' : 'text-surface-400',
                  )}
                />
                <span className="truncate">{suggestion}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
