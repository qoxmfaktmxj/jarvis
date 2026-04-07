"use client";

import Link from "next/link";
import { Bell, ChevronDown, Search } from "lucide-react";

export function Topbar({ userName }: { userName: string }) {
  return (
    <header className="fixed left-0 right-0 top-0 z-50 flex h-[var(--topbar-height)] items-center border-b border-gray-200 bg-white px-4">
      <div className="flex w-[var(--sidebar-width)] items-center gap-3 pr-4">
        <Link href="/dashboard" className="text-xl font-bold text-blue-600">
          Jarvis
        </Link>
      </div>

      <div className="max-w-lg flex-1">
        <Link
          href="/search"
          className="flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-2 text-sm text-gray-500 transition-colors hover:bg-gray-200"
        >
          <Search className="h-4 w-4" />
          <span>Search knowledge...</span>
          <kbd className="ml-auto rounded bg-gray-200 px-1.5 py-0.5 text-xs">
            /
          </kbd>
        </Link>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          className="relative rounded-lg p-2 hover:bg-gray-100"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5 text-gray-600" />
        </button>
        <Link
          href="/profile"
          className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-gray-100"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-xs font-medium text-white">
            {userName.charAt(0)}
          </div>
          <span className="text-sm text-gray-700">{userName}</span>
          <ChevronDown className="h-4 w-4 text-gray-400" />
        </Link>
      </div>
    </header>
  );
}
