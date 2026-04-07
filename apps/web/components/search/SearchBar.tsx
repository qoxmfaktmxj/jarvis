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
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={inputId}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => suggestions.length > 0 && setIsOpen(true)}
          placeholder="검색어를 입력하세요..."
          className="pl-9 pr-9"
          autoFocus={autoFocus}
          aria-label="검색"
        />
        {isLoading ? (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : query ? (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setSuggestions([]);
              setIsOpen(false);
              document.getElementById(inputId)?.focus();
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="검색어 지우기"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {isOpen && suggestions.length > 0 && (
        <div
          id="search-suggestions"
          role="listbox"
          aria-label="추천 검색어"
          className="absolute top-full z-50 mt-1 w-full rounded-md border bg-popover shadow-md"
        >
          <div className="p-1">
            <p className="px-2 py-1 text-xs font-medium text-muted-foreground">추천 검색어</p>
            {suggestions.map((suggestion, index) => (
              <button
                key={suggestion}
                role="option"
                aria-selected={selectedIndex === index}
                type="button"
                onClick={() => navigate(suggestion)}
                className={cn(
                  'flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm',
                  selectedIndex === index
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-accent hover:text-accent-foreground',
                )}
              >
                <Search className="h-3 w-3 text-muted-foreground" />
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
