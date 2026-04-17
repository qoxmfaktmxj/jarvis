"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut, Palette, UserCircle2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function UserMenu({ userName }: { userName: string }) {
  const t = useTranslations("Common");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-isu-600 text-xs font-medium text-white">
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
          className="absolute right-0 top-full mt-2 w-60 rounded-2xl border border-surface-200 bg-card p-2 shadow-xl"
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
            disabled
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-surface-400"
          >
            <Palette className="h-4 w-4" />
            <span className="flex-1">테마 설정</span>
            <Badge variant="warning" className="px-2 py-0.5 text-[11px]">
              준비 중
            </Badge>
          </button>

          <div className="my-2 border-t border-surface-100" />

          <form action="/api/auth/logout" method="post">
            <button
              type="submit"
              role="menuitem"
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-rose-600 transition-colors hover:bg-rose-50"
            >
              <LogOut className="h-4 w-4" />
              <span>로그아웃</span>
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
