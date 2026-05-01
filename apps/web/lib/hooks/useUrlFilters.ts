"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

export type UseUrlFiltersOptions<T extends Record<string, string>> = {
  defaults: T;
};

export type UseUrlFiltersResult<T extends Record<string, string>> = {
  values: T;
  setValue: <K extends keyof T>(key: K, value: T[K]) => void;
  reset: () => void;
};

export function useUrlFilters<T extends Record<string, string>>(
  options: UseUrlFiltersOptions<T>,
): UseUrlFiltersResult<T> {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const values = useMemo(() => {
    const out = { ...options.defaults };
    for (const key of Object.keys(options.defaults) as (keyof T)[]) {
      const v = searchParams.get(String(key));
      if (v !== null) out[key] = v as T[keyof T];
    }
    return out;
  }, [searchParams, options.defaults]);

  const writeUrl = useCallback(
    (next: T) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const key of Object.keys(next) as (keyof T)[]) {
        const v = next[key];
        if (v === "" || v == null) params.delete(String(key));
        else params.set(String(key), String(v));
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const setValue = useCallback(
    <K extends keyof T>(key: K, value: T[K]) => {
      writeUrl({ ...values, [key]: value });
    },
    [values, writeUrl],
  );

  const reset = useCallback(() => {
    writeUrl(options.defaults);
  }, [options.defaults, writeUrl]);

  return { values, setValue, reset };
}
