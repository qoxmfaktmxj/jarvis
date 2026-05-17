"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut, Palette, UserCircle2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { LoadingOverlay } from "@/components/layout/LoadingOverlay";
import { ThemeColorPicker } from "./ThemeColorPicker";
import { cn } from "@/lib/utils";

export function UserMenu({ userName }: { userName: string }) {
  const t = useTranslations("Common");
  const [open, setOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [themePickerOpen, setThemePickerOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  async function handleLogout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // swallow — still redirect to login so user isn't stranded
    }
    window.location.assign("/login");
  }

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  useEffect(() => {
    if (!open) {
      setThemePickerOpen(false);
    }
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "flex items-center gap-2 rounded-lg px-3 py-2 transition-colors",
          open ? "bg-surface-100" : "hover:bg-surface-100"
        )}
      >
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-(--brand-primary) text-xs font-medium text-white">
          {userName.charAt(0)}
        </div>
        <span className="text-sm text-surface-700">{userName}</span>
        <ChevronDown
          className={cn("h-4 w-4 text-surface-400 transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-60 rounded-xl border border-surface-200 bg-card p-2 shadow-xl"
        >
          <Link
            href="/profile"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-surface-700 transition-colors hover:bg-surface-50"
          >
            <UserCircle2 className="h-4 w-4 text-surface-500" />
            <span>{t("profile")}</span>
          </Link>

          <button
            type="button"
            role="menuitem"
            aria-expanded={themePickerOpen}
            onClick={() => setThemePickerOpen((v) => !v)}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-surface-700 transition-colors hover:bg-surface-50"
          >
            <Palette className="h-4 w-4 text-surface-500" />
            <span className="flex-1">{t("themeColor")}</span>
            <ChevronDown
              className={cn(
                "h-4 w-4 text-surface-400 transition-transform",
                themePickerOpen && "rotate-180"
              )}
            />
          </button>
          {themePickerOpen ? (
            <div className="my-1 rounded-xl border border-surface-200 bg-surface-50">
              <ThemeColorPicker />
            </div>
          ) : null}

          <div className="my-2 border-t border-surface-100" />

          <form onSubmit={handleLogout}>
            <button
              type="submit"
              role="menuitem"
              disabled={isLoggingOut}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-(--color-danger) transition-colors hover:bg-(--color-danger-subtle) disabled:cursor-not-allowed disabled:opacity-60"
            >
              <LogOut className="h-4 w-4" />
              <span>로그아웃</span>
            </button>
          </form>
        </div>
      )}

      {isLoggingOut && <LoadingOverlay label="로그아웃 중…" />}
    </div>
  );
}
