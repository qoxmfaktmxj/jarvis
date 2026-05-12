"use client";

/**
 * SidebarCapy — Sidebar 하단 이스터에그 마스코트.
 *
 * 마운트마다 [astronaut, diver] 중 하나를 랜덤 선택.
 * SSR 시점에는 nothing(빈 placeholder)을 렌더해 hydration mismatch 회피.
 * 사이드바 expanded 모드에서만 표시(rail 모드는 공간 절약).
 *
 * 클릭하면 다른 카피바라로 한 번 더 굴린다(같은 결과 가능).
 */

import { useEffect, useState } from "react";
import { Capy } from "./Capy";

const POOL = ["astronaut", "diver"] as const;
type CapyChoice = (typeof POOL)[number];

const GREETING: Record<CapyChoice, string> = {
  astronaut: "오늘은 우주 산책 중이에요 🚀",
  diver:     "오늘은 수중 탐험 중이에요 🤿",
};

function rollCapy(prev?: CapyChoice): CapyChoice {
  // Re-roll uniformly; small chance of repeat is fine.
  const pick = POOL[Math.floor(Math.random() * POOL.length)] ?? POOL[0];
  if (prev && pick === prev && POOL.length > 1) {
    // Bias one re-roll for variety on click; SSR mount uses prev=undefined.
    return POOL[(POOL.indexOf(prev) + 1) % POOL.length] ?? prev;
  }
  return pick;
}

export function SidebarCapy() {
  const [name, setName] = useState<CapyChoice | null>(null);

  useEffect(() => {
    setName(rollCapy());
  }, []);

  if (!name) {
    // Reserve space pre-hydration so layout doesn't jump.
    return (
      <div
        aria-hidden
        className="flex shrink-0 items-center justify-center"
        style={{ height: 96, padding: "8px 0" }}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setName((prev) => rollCapy(prev ?? undefined))}
      aria-label={GREETING[name]}
      title={GREETING[name]}
      className="group flex shrink-0 items-center justify-center transition-opacity hover:opacity-80"
      style={{ height: 96, padding: "8px 0", border: "none", background: "transparent", cursor: "pointer" }}
    >
      <Capy name={name} size={72} className="rounded-full" />
    </button>
  );
}
