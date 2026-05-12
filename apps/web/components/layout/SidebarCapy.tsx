"use client";

/**
 * SidebarCapy — Sidebar 하단 이스터에그 마스코트 (테마 카드 v3).
 *
 * 16종 카피바라 풀 (CAPY_REGISTRY) 전체를 사용하며, 각자 고유한:
 *   - 그라데이션 배경 (도서관, 해변, 우주, 들판 등)
 *   - 파티클 (먼지/별/거품/김/잎/연꽃/불꽃/음표)
 *   - 캡션 문구
 * 을 가진다.
 *
 * 카드 자체는 hover 시 살짝 떠오르고(translateY -2px) brightness 증가.
 * 카피바라는 끊김 없이 부드럽게 떠다니는 float 애니메이션.
 * 클릭마다 다른 카피바라로 re-roll (직전 결과는 회피).
 *
 * SSR 시점에는 placeholder 영역만 렌더해 hydration mismatch 회피.
 * Sidebar expanded 모드에서만 표시 (rail 모드는 공간 절약).
 */

import { useEffect, useState } from "react";
import { CAPY_NAMES, Capy, type CapyName } from "./Capy";

type ParticleKind =
  | "stars"
  | "bubbles"
  | "dust"
  | "steam"
  | "petals"
  | "leaves"
  | "embers"
  | "notes";

type Scene = {
  gradient: string;
  /** 가벼운 분위기 오버레이 (선택). gradient 위에 합성. */
  glow?: string;
  particles: ParticleKind;
  caption: string;
};

const SCENES: Record<CapyName, Scene> = {
  reading: {
    gradient: "linear-gradient(180deg, #fef3c7 0%, #d97706 55%, #78350f 100%)",
    glow: "radial-gradient(60% 50% at 30% 20%, rgba(255,255,255,0.35), transparent 70%)",
    particles: "dust",
    caption: "오늘은 독서 삼매경 📚",
  },
  basic: {
    gradient: "linear-gradient(180deg, #bef264 0%, #22c55e 60%, #14532d 100%)",
    glow: "radial-gradient(60% 50% at 50% 10%, rgba(255,255,255,0.35), transparent 70%)",
    particles: "leaves",
    caption: "오늘은 평범한 하루 🌿",
  },
  onsen: {
    gradient: "linear-gradient(180deg, #fbcfe8 0%, #f472b6 50%, #831843 100%)",
    glow: "radial-gradient(50% 40% at 50% 100%, rgba(255,255,255,0.4), transparent 70%)",
    particles: "steam",
    caption: "온천에서 힐링 중 ♨️",
  },
  watermelon: {
    gradient: "linear-gradient(180deg, #fde047 0%, #fb923c 40%, #e11d48 100%)",
    glow: "radial-gradient(70% 40% at 50% 0%, rgba(255,255,255,0.5), transparent 70%)",
    particles: "dust",
    caption: "한여름 수박 타임 🍉",
  },
  surprise: {
    gradient: "linear-gradient(180deg, #1e1b4b 0%, #6d28d9 60%, #1e1b4b 100%)",
    glow: "radial-gradient(50% 40% at 50% 50%, rgba(253,224,71,0.35), transparent 70%)",
    particles: "embers",
    caption: "어머 깜짝이야! ✨",
  },
  astronaut: {
    gradient:
      "radial-gradient(120% 80% at 30% 20%, #1e1b4b 0%, #0a0a23 55%, #050514 100%)",
    glow: "radial-gradient(60% 40% at 80% 80%, rgba(139,92,246,0.35), transparent 70%), radial-gradient(40% 30% at 15% 70%, rgba(59,130,246,0.28), transparent 70%)",
    particles: "stars",
    caption: "우주 산책 중 🚀",
  },
  bird: {
    gradient: "linear-gradient(180deg, #7dd3fc 0%, #16a34a 55%, #14532d 100%)",
    glow: "radial-gradient(50% 40% at 50% 0%, rgba(255,255,255,0.4), transparent 70%)",
    particles: "leaves",
    caption: "새와 수다 떠는 중 🐦",
  },
  snorkel: {
    gradient: "linear-gradient(180deg, #67e8f9 0%, #06b6d4 50%, #0e7490 100%)",
    glow: "linear-gradient(170deg, rgba(255,255,255,0.45) 0%, transparent 35%)",
    particles: "bubbles",
    caption: "스노클링 가즈아 🏊",
  },
  cabbage: {
    gradient: "linear-gradient(180deg, #d9f99d 0%, #65a30d 55%, #365314 100%)",
    glow: "radial-gradient(60% 40% at 50% 0%, rgba(255,255,255,0.35), transparent 70%)",
    particles: "leaves",
    caption: "양배추 농사 짓는 중 🥬",
  },
  zen: {
    gradient: "linear-gradient(180deg, #fce7f3 0%, #c084fc 50%, #4c1d95 100%)",
    glow: "radial-gradient(60% 50% at 50% 100%, rgba(255,255,255,0.3), transparent 70%)",
    particles: "petals",
    caption: "마음 비우는 중 🧘",
  },
  armchair: {
    gradient: "linear-gradient(180deg, #fed7aa 0%, #f97316 50%, #7c2d12 100%)",
    glow: "radial-gradient(60% 50% at 50% 100%, rgba(253,186,116,0.5), transparent 70%)",
    particles: "embers",
    caption: "안락의자에서 휴식 ☕",
  },
  garden: {
    gradient: "linear-gradient(180deg, #fbcfe8 0%, #f472b6 40%, #be185d 100%)",
    glow: "radial-gradient(60% 40% at 50% 0%, rgba(255,255,255,0.4), transparent 70%)",
    particles: "petals",
    caption: "정원 가꾸는 중 🌷",
  },
  chef: {
    gradient: "linear-gradient(180deg, #fef3c7 0%, #fbbf24 50%, #b45309 100%)",
    glow: "radial-gradient(50% 40% at 50% 100%, rgba(255,255,255,0.4), transparent 70%)",
    particles: "steam",
    caption: "요리 만드는 중 🍳",
  },
  music: {
    gradient: "linear-gradient(180deg, #c4b5fd 0%, #a855f7 45%, #581c87 100%)",
    glow: "radial-gradient(60% 40% at 50% 0%, rgba(255,255,255,0.4), transparent 70%)",
    particles: "notes",
    caption: "라이브 공연 중 🎸",
  },
  painter: {
    gradient: "linear-gradient(180deg, #fda4af 0%, #f59e0b 50%, #be123c 100%)",
    glow: "radial-gradient(60% 40% at 50% 0%, rgba(255,255,255,0.4), transparent 70%)",
    particles: "dust",
    caption: "그림 그리는 중 🎨",
  },
  diver: {
    gradient:
      "linear-gradient(180deg, #38bdf8 0%, #0284c7 35%, #075985 75%, #082f49 100%)",
    glow: "linear-gradient(170deg, rgba(255,255,255,0.4) 0%, transparent 35%), linear-gradient(190deg, rgba(255,255,255,0.25) 0%, transparent 30%)",
    particles: "bubbles",
    caption: "수중 탐험 중 🤿",
  },
};

function pickRandom(): CapyName {
  // CAPY_NAMES is non-empty (CAPY_REGISTRY has 16 entries) — index is safe.
  return CAPY_NAMES[Math.floor(Math.random() * CAPY_NAMES.length)] as CapyName;
}

function rollCapy(prev?: CapyName): CapyName {
  let pick = pickRandom();
  if (pick === prev && CAPY_NAMES.length > 1) {
    // One re-pick to bias against immediate repeat.
    pick = pickRandom();
    if (pick === prev) {
      const idx = CAPY_NAMES.indexOf(prev);
      pick = CAPY_NAMES[(idx + 1) % CAPY_NAMES.length] as CapyName;
    }
  }
  return pick;
}

const CARD_HEIGHT = 126;

export function SidebarCapy() {
  const [name, setName] = useState<CapyName | null>(null);

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

  const scene = SCENES[name];

  return (
    <div className="shrink-0" style={{ padding: 8 }}>
      <button
        type="button"
        onClick={() => setName((prev) => rollCapy(prev ?? undefined))}
        aria-label={scene.caption}
        title={`${scene.caption} (클릭해서 다른 카피바라)`}
        className="capy-card group relative block w-full overflow-hidden rounded-xl border-0 p-0 active:scale-[0.98]"
        style={{ height: CARD_HEIGHT - 16, cursor: "pointer" }}
      >
        {/* Layer 1: gradient base */}
        <span aria-hidden className="absolute inset-0" style={{ background: scene.gradient }} />
        {/* Layer 2: glow overlay (optional accent) */}
        {scene.glow ? (
          <span
            aria-hidden
            className="absolute inset-0 opacity-90"
            style={{ background: scene.glow }}
          />
        ) : null}
        {/* Layer 3: particles */}
        <span aria-hidden className={`absolute inset-0 capy-particle-${scene.particles}`} />

        {/* Capybara — float animation, centered */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
        >
          <span className="capy-float">
            <Capy
              name={name}
              size={64}
              className="drop-shadow-[0_4px_10px_rgba(0,0,0,0.45)]"
            />
          </span>
        </span>

        {/* Caption */}
        <span
          className="pointer-events-none absolute inset-x-0 bottom-1.5 text-center text-[10.5px] font-medium tracking-tight text-white"
          style={{ textShadow: "0 1px 3px rgba(0,0,0,0.65)" }}
        >
          {scene.caption}
        </span>
      </button>

      <style jsx>{`
        .capy-card {
          transition: transform 0.25s ease, filter 0.25s ease;
        }
        .capy-card:hover {
          transform: translateY(-2px);
          filter: brightness(1.06);
        }
        .capy-float {
          display: inline-block;
          animation: capy-float 3.4s ease-in-out infinite;
        }
        @keyframes capy-float {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-4px); }
        }

        /* ─────────────────── Particle layers ─────────────────── */

        /* stars: 2-layer twinkle */
        .capy-particle-stars {
          background-image:
            radial-gradient(1.5px 1.5px at 12% 18%, #fff 0, transparent 100%),
            radial-gradient(1.5px 1.5px at 68% 28%, #fff 0, transparent 100%),
            radial-gradient(1.5px 1.5px at 88% 12%, #fde68a 0, transparent 100%),
            radial-gradient(1.5px 1.5px at 22% 78%, #fff 0, transparent 100%),
            radial-gradient(1.5px 1.5px at 50% 58%, #c4b5fd 0, transparent 100%),
            radial-gradient(1px 1px at 32% 12%, #fff 0, transparent 100%),
            radial-gradient(1px 1px at 80% 42%, #fff 0, transparent 100%),
            radial-gradient(1px 1px at 8% 48%, #fff 0, transparent 100%),
            radial-gradient(1px 1px at 92% 72%, #fff 0, transparent 100%),
            radial-gradient(1px 1px at 60% 88%, #fff 0, transparent 100%);
          animation: capy-twinkle 3.2s ease-in-out infinite alternate;
        }
        @keyframes capy-twinkle {
          0%   { opacity: 0.4; }
          100% { opacity: 1; }
        }

        /* bubbles: rising from bottom */
        .capy-particle-bubbles {
          background-image:
            radial-gradient(3px 3px at 18% 90%, rgba(255,255,255,0.85) 0, transparent 60%),
            radial-gradient(2px 2px at 36% 95%, rgba(255,255,255,0.75) 0, transparent 60%),
            radial-gradient(2.5px 2.5px at 58% 90%, rgba(255,255,255,0.8) 0, transparent 60%),
            radial-gradient(2px 2px at 78% 92%, rgba(255,255,255,0.7) 0, transparent 60%),
            radial-gradient(1.5px 1.5px at 88% 88%, rgba(255,255,255,0.6) 0, transparent 60%);
          background-repeat: no-repeat;
          animation: capy-rise 3.6s ease-in-out infinite;
        }
        @keyframes capy-rise {
          0%   { transform: translateY(8px);  opacity: 0; }
          15%  { opacity: 1; }
          85%  { opacity: 0.55; }
          100% { transform: translateY(-110%); opacity: 0; }
        }

        /* dust: slow glittering motes */
        .capy-particle-dust {
          background-image:
            radial-gradient(1.5px 1.5px at 25% 25%, rgba(255,255,255,0.85) 0, transparent 60%),
            radial-gradient(1.5px 1.5px at 70% 18%, rgba(255,255,255,0.8) 0, transparent 60%),
            radial-gradient(1.5px 1.5px at 45% 65%, rgba(255,255,255,0.75) 0, transparent 60%),
            radial-gradient(1.5px 1.5px at 82% 55%, rgba(255,255,255,0.85) 0, transparent 60%),
            radial-gradient(1.5px 1.5px at 12% 78%, rgba(255,255,255,0.8) 0, transparent 60%);
          animation: capy-twinkle 4.5s ease-in-out infinite alternate;
        }

        /* steam: rising soft puff */
        .capy-particle-steam {
          background-image:
            radial-gradient(8px 12px at 30% 95%, rgba(255,255,255,0.35) 0, transparent 70%),
            radial-gradient(6px 9px at 55% 95%, rgba(255,255,255,0.32) 0, transparent 70%),
            radial-gradient(7px 11px at 78% 95%, rgba(255,255,255,0.32) 0, transparent 70%);
          background-repeat: no-repeat;
          filter: blur(2px);
          animation: capy-steam 5s ease-in-out infinite;
        }
        @keyframes capy-steam {
          0%   { transform: translateY(15px); opacity: 0; }
          20%  { opacity: 0.85; }
          80%  { opacity: 0.4; }
          100% { transform: translateY(-90%); opacity: 0; }
        }

        /* petals: slow drifting flower petals */
        .capy-particle-petals {
          background-image:
            radial-gradient(3px 2px at 20% 30%, rgba(255,230,235,0.85) 0, transparent 60%),
            radial-gradient(3px 2px at 70% 45%, rgba(255,210,220,0.8) 0, transparent 60%),
            radial-gradient(2.5px 1.5px at 45% 70%, rgba(255,230,235,0.75) 0, transparent 60%),
            radial-gradient(3px 2px at 85% 80%, rgba(255,210,220,0.85) 0, transparent 60%);
          animation: capy-drift 6s ease-in-out infinite;
        }
        @keyframes capy-drift {
          0%   { transform: translate(0, -10%); opacity: 0; }
          15%  { opacity: 0.9; }
          85%  { opacity: 0.5; }
          100% { transform: translate(8px, 110%); opacity: 0; }
        }

        /* leaves: same animation as petals but green tint */
        .capy-particle-leaves {
          background-image:
            radial-gradient(3px 2px at 18% 22%, rgba(220,252,180,0.85) 0, transparent 60%),
            radial-gradient(2px 3px at 62% 38%, rgba(190,242,140,0.85) 0, transparent 60%),
            radial-gradient(3px 2px at 38% 65%, rgba(180,232,130,0.8) 0, transparent 60%),
            radial-gradient(2.5px 2px at 82% 72%, rgba(220,252,180,0.85) 0, transparent 60%);
          animation: capy-drift 7s ease-in-out infinite;
        }

        /* embers: floating orange sparks rising */
        .capy-particle-embers {
          background-image:
            radial-gradient(2px 2px at 25% 88%, rgba(253,186,116,0.95) 0, transparent 60%),
            radial-gradient(1.5px 1.5px at 50% 92%, rgba(251,146,60,0.95) 0, transparent 60%),
            radial-gradient(2px 2px at 72% 88%, rgba(253,186,116,0.9) 0, transparent 60%),
            radial-gradient(1.5px 1.5px at 88% 92%, rgba(253,224,71,0.9) 0, transparent 60%);
          animation: capy-rise 4s ease-in-out infinite;
        }

        /* notes: musical notes drift */
        .capy-particle-notes {
          background-image:
            radial-gradient(3px 4px at 22% 30%, rgba(255,255,255,0.9) 0, transparent 60%),
            radial-gradient(2px 3px at 70% 40%, rgba(255,255,255,0.85) 0, transparent 60%),
            radial-gradient(3px 4px at 45% 65%, rgba(255,255,255,0.8) 0, transparent 60%),
            radial-gradient(2px 3px at 86% 75%, rgba(255,255,255,0.85) 0, transparent 60%);
          animation: capy-drift 5.2s ease-in-out infinite reverse;
        }
      `}</style>
    </div>
  );
}
