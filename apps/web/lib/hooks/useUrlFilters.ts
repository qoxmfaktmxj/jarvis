"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useRef } from "react";

export type UseUrlFiltersOptions<T extends Record<string, string>> = {
  defaults: T;
};

export type UseUrlFiltersResult<T extends Record<string, string>> = {
  values: T;
  setValue: <K extends keyof T>(key: K, value: T[K]) => void;
  /**
   * Batch update multiple keys with a single `router.replace` call.
   *
   * Use this instead of calling `setValue` multiple times in sequence — multi-
   * `router.replace` fires multiple RSC re-renders and can cancel in-flight
   * server actions registered via `useTransition` (Next.js 15 RSC behavior).
   * `setValues({ a: "x", b: "y" })` issues exactly one URL navigation.
   *
   * Empty strings or `null` clear the param (same semantics as `setValue`).
   */
  setValues: (partial: Partial<T>) => void;
  reset: () => void;
};

export function useUrlFilters<T extends Record<string, string>>(
  options: UseUrlFiltersOptions<T>,
): UseUrlFiltersResult<T> {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Tracks the last-written search string within a tick so that rapid
  // sequential setValue calls compose (rather than clobber) each other.
  // Reset whenever searchParams changes (i.e. after a navigation/re-render).
  const pendingRef = useRef<string | null>(null);

  const values = useMemo(() => {
    // A new searchParams means the URL has actually updated — clear pending.
    pendingRef.current = null;
    const out = { ...options.defaults };
    for (const key of Object.keys(options.defaults) as (keyof T)[]) {
      const v = searchParams.get(String(key));
      if (v !== null) out[key] = v as T[keyof T];
    }
    return out;
  }, [searchParams, options.defaults]);

  const setValue = useCallback(
    <K extends keyof T>(key: K, value: T[K]) => {
      // Use the last-written string as base (if available) so that rapid
      // calls in the same tick compose rather than overwrite each other.
      const base = pendingRef.current ?? searchParams.toString();
      const params = new URLSearchParams(base);
      if (value === "" || value == null) params.delete(String(key));
      else params.set(String(key), String(value));
      const qs = params.toString();
      pendingRef.current = qs;
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const setValues = useCallback(
    (partial: Partial<T>) => {
      // Defensive early-return: callers should not pass `{}`, but if they do
      // we skip the unnecessary `router.replace` (which would still trigger an
      // RSC re-render with identical URL).
      if (Object.keys(partial).length === 0) return;
      // Single router.replace for N keys — avoids the multi-`replace` RSC race
      // that can cancel in-flight server actions registered via useTransition.
      const base = pendingRef.current ?? searchParams.toString();
      const params = new URLSearchParams(base);
      for (const key of Object.keys(partial) as (keyof T)[]) {
        const value = partial[key];
        if (value === "" || value == null) params.delete(String(key));
        else params.set(String(key), String(value));
      }
      const qs = params.toString();
      pendingRef.current = qs;
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const reset = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    for (const key of Object.keys(options.defaults) as (keyof T)[]) {
      const v = options.defaults[key];
      if (v === "" || v == null) params.delete(String(key));
      else params.set(String(key), String(v));
    }
    const qs = params.toString();
    pendingRef.current = qs;
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [options.defaults, pathname, router, searchParams]);

  return { values, setValue, setValues, reset };
}
