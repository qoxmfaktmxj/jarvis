"use client";

/**
 * SidebarCapy — Sidebar 하단 이스터에그 마스코트 (테마 카드).
 *
 * 마운트마다 [astronaut, diver] 중 하나를 랜덤 선택.
 * 카드 전체가 테마(우주 / 수중)로 배경 처리되고 그 위에 카피바라가 떠 있다.
 *  - astronaut: 짙은 우주 그라데이션 + 깜빡이는 별
 *  - diver:     깊은 바다 그라데이션 + 떠오르는 거품
 * 클릭 시 다른 카피바라로 re-roll (직전 결과는 회피).
 * SSR 시점에는 placeholder 영역만 렌더해 hydration mismatch 회피.
 * Sidebar expanded 모드에서만 표시 (rail 모드는 공간 절약).
 */

import { useEffect, useState } from "react";
import { Capy } from "./Capy";

const POOL = ["astronaut", "diver"] as const;
type CapyChoice = (typeof POOL)[number];

const CAPTION: Record<CapyChoice, string> = {
  astronaut: "우주 산책 중 🚀",
  diver:     "수중 탐험 중 🤿",
};

function rollCapy(prev?: CapyChoice): CapyChoice {
  const pick = POOL[Math.floor(Math.random() * POOL.length)] ?? POOL[0];
  if (prev && pick === prev && POOL.length > 1) {
    return POOL[(POOL.indexOf(prev) + 1) % POOL.length] ?? prev;
  }
  return pick;
}

const CARD_HEIGHT = 140;

export function SidebarCapy() {
  const [name, setName] = useState<CapyChoice | null>(null);

  useEffect(() => {
    setName(rollCapy());
  }, []);

  if (!name) {
    return (
      <div
        aria-hidden
        className="shrink-0"
        style={{ height: CARD_HEIGHT, padding: 8 }}
      />
    );
  }

  return (
    <div className="shrink-0" style={{ padding: 8 }}>
      <button
        type="button"
        onClick={() => setName((prev) => rollCapy(prev ?? undefined))}
        aria-label={CAPTION[name]}
        title={CAPTION[name]}
        className="relative block w-full overflow-hidden rounded-xl border-0 p-0 transition-transform active:scale-[0.98]"
        style={{ height: CARD_HEIGHT - 16, cursor: "pointer" }}
      >
        {name === "astronaut" ? <SpaceScene /> : <OceanScene />}

        {/* Capybara 마스코트 — 카드 중앙 */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-end justify-center"
          style={{ paddingBottom: 22 }}
        >
          <Capy
            name={name}
            size={72}
            className="drop-shadow-[0_4px_10px_rgba(0,0,0,0.4)]"
          />
        </span>

        {/* Caption */}
        <span
          className="pointer-events-none absolute inset-x-0 bottom-1.5 text-center text-[10.5px] font-medium tracking-tight text-white/85"
          style={{ textShadow: "0 1px 2px rgba(0,0,0,0.6)" }}
        >
          {CAPTION[name]}
        </span>
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scene backgrounds — pure CSS, GPU-friendly (no JS frames).
// ---------------------------------------------------------------------------

function SpaceScene() {
  return (
    <>
      {/* Deep space gradient */}
      <span
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 80% at 30% 20%, #1e1b4b 0%, #0a0a23 55%, #050514 100%)",
        }}
      />
      {/* Distant nebula glow */}
      <span
        aria-hidden
        className="absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(60% 40% at 80% 80%, rgba(139,92,246,0.35), transparent 70%), radial-gradient(40% 30% at 15% 70%, rgba(59,130,246,0.28), transparent 70%)",
        }}
      />
      {/* Stars layer 1 — large + slow twinkle */}
      <span aria-hidden className="absolute inset-0 capy-stars-a" />
      {/* Stars layer 2 — small + offset twinkle */}
      <span aria-hidden className="absolute inset-0 capy-stars-b" />

      <style jsx>{`
        .capy-stars-a {
          background-image:
            radial-gradient(1.5px 1.5px at 12% 18%, #fff 0, transparent 100%),
            radial-gradient(1.5px 1.5px at 68% 28%, #fff 0, transparent 100%),
            radial-gradient(1.5px 1.5px at 88% 12%, #fde68a 0, transparent 100%),
            radial-gradient(1.5px 1.5px at 22% 78%, #fff 0, transparent 100%),
            radial-gradient(1.5px 1.5px at 50% 58%, #c4b5fd 0, transparent 100%);
          animation: capy-twinkle 3.2s ease-in-out infinite alternate;
        }
        .capy-stars-b {
          background-image:
            radial-gradient(1px 1px at 32% 12%, #fff 0, transparent 100%),
            radial-gradient(1px 1px at 80% 42%, #fff 0, transparent 100%),
            radial-gradient(1px 1px at 8% 48%, #fff 0, transparent 100%),
            radial-gradient(1px 1px at 92% 72%, #fff 0, transparent 100%),
            radial-gradient(1px 1px at 60% 88%, #fff 0, transparent 100%),
            radial-gradient(1px 1px at 40% 35%, #fff 0, transparent 100%);
          animation: capy-twinkle 2.1s ease-in-out 0.7s infinite alternate;
          opacity: 0.85;
        }
        @keyframes capy-twinkle {
          0% { opacity: 0.35; }
          100% { opacity: 1; }
        }
      `}</style>
    </>
  );
}

function OceanScene() {
  return (
    <>
      {/* Sunlight-tinted ocean gradient */}
      <span
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, #38bdf8 0%, #0284c7 35%, #075985 75%, #082f49 100%)",
        }}
      />
      {/* Caustic light rays */}
      <span
        aria-hidden
        className="absolute inset-0 opacity-40"
        style={{
          background:
            "linear-gradient(170deg, rgba(255,255,255,0.4) 0%, transparent 35%), linear-gradient(190deg, rgba(255,255,255,0.25) 0%, transparent 30%)",
        }}
      />
      {/* Bubble columns — animated rise */}
      <span aria-hidden className="absolute inset-0 capy-bubbles" />

      <style jsx>{`
        .capy-bubbles {
          background-image:
            radial-gradient(3px 3px at 18% 90%, rgba(255,255,255,0.85) 0, transparent 60%),
            radial-gradient(2px 2px at 36% 95%, rgba(255,255,255,0.75) 0, transparent 60%),
            radial-gradient(2.5px 2.5px at 58% 90%, rgba(255,255,255,0.8) 0, transparent 60%),
            radial-gradient(2px 2px at 78% 92%, rgba(255,255,255,0.7) 0, transparent 60%),
            radial-gradient(1.5px 1.5px at 88% 88%, rgba(255,255,255,0.6) 0, transparent 60%);
          background-repeat: no-repeat;
          animation: capy-rise 3.5s ease-in-out infinite;
        }
        @keyframes capy-rise {
          0%   { transform: translateY(8px);  opacity: 0;   }
          15%  { opacity: 1; }
          85%  { opacity: 0.6; }
          100% { transform: translateY(-110%); opacity: 0; }
        }
      `}</style>
    </>
  );
}
