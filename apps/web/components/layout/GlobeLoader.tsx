"use client";

/**
 * GlobeLoader — 회전하는 지구본 로더
 *
 * Ask AI 사고 중, 로그인 진행, 긴 검색 등 "생각하는 중" 상태에 사용.
 * Canvas 기반 정사영 투영 + 대륙 윤곽 + 외부 소용돌이 링.
 * 크기/색상 커스터마이즈 가능, prefers-reduced-motion 존중.
 */

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

type GlobeLoaderProps = {
  size?: number;
  className?: string;
  tone?: "brand" | "lime" | "muted" | "inverse";
  label?: string;
};

const TONES: Record<NonNullable<GlobeLoaderProps["tone"]>, {
  land: string;
  grid: string;
  ring: string;
  glow: string;
}> = {
  brand: {
    land: "oklch(0.40 0.157 260)",
    grid: "oklch(0.58 0.150 260 / 0.35)",
    ring: "oklch(0.65 0.190 134)",
    glow: "oklch(0.58 0.150 260 / 0.25)",
  },
  lime: {
    land: "oklch(0.55 0.160 134)",
    grid: "oklch(0.70 0.180 134 / 0.35)",
    ring: "oklch(0.40 0.157 260)",
    glow: "oklch(0.70 0.180 134 / 0.25)",
  },
  muted: {
    land: "oklch(0.44 0.018 260)",
    grid: "oklch(0.70 0.015 260 / 0.35)",
    ring: "oklch(0.55 0.018 260)",
    glow: "oklch(0.55 0.018 260 / 0.20)",
  },
  inverse: {
    land: "oklch(0.93 0.030 260)",
    grid: "oklch(0.85 0.060 260 / 0.5)",
    ring: "oklch(0.87 0.100 134)",
    glow: "oklch(0.93 0.030 260 / 0.35)",
  },
};

/**
 * 매우 단순화된 대륙 윤곽 (lon/lat 폴리곤).
 * 실제 지도 수준은 아니지만 "지구다움"을 내기에 충분.
 */
const CONTINENTS: Array<Array<[number, number]>> = [
  // 북미 러프
  [[-125, 50], [-100, 55], [-80, 50], [-75, 40], [-85, 28], [-100, 25], [-115, 32], [-125, 40]],
  // 남미 러프
  [[-75, 10], [-60, 5], [-45, -10], [-50, -30], [-70, -45], [-75, -30], [-80, -10]],
  // 유럽 / 아프리카 러프
  [[-10, 55], [10, 58], [25, 50], [40, 38], [35, 15], [45, -5], [35, -30], [20, -35], [10, -15], [0, 0], [-15, 10], [-18, 30], [-10, 45]],
  // 아시아 / 대양주 러프
  [[40, 55], [70, 55], [110, 50], [140, 45], [150, 30], [135, 10], [120, -5], [140, -25], [130, -35], [115, -30], [100, 10], [80, 20], [60, 30], [50, 40]],
];

function project(
  lon: number, lat: number, rotation: number, r: number, cx: number, cy: number
): [number, number, number] {
  const λ = ((lon + rotation) * Math.PI) / 180;
  const φ = (lat * Math.PI) / 180;
  const x = r * Math.cos(φ) * Math.sin(λ);
  const y = -r * Math.sin(φ);
  // z > 0: 앞면, z < 0: 뒷면
  const z = Math.cos(φ) * Math.cos(λ);
  return [cx + x, cy + y, z];
}

export function GlobeLoader({
  size = 56,
  className,
  tone = "brand",
  label,
}: GlobeLoaderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const s = size * dpr;
    canvas.width = s;
    canvas.height = s;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    ctx.scale(dpr, dpr);

    const colors = TONES[tone];
    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - size * 0.12;

    let rotation = 0;
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const draw = () => {
      ctx.clearRect(0, 0, size, size);

      // Glow
      const g = ctx.createRadialGradient(cx, cy, r * 0.6, cx, cy, r * 1.3);
      g.addColorStop(0, colors.glow);
      g.addColorStop(1, "transparent");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.3, 0, Math.PI * 2);
      ctx.fill();

      // Globe base disc
      ctx.fillStyle = "oklch(0.985 0.003 260)";
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();

      // Graticule — parallels
      ctx.strokeStyle = colors.grid;
      ctx.lineWidth = 0.6;
      for (let lat = -60; lat <= 60; lat += 30) {
        ctx.beginPath();
        for (let lon = -180; lon <= 180; lon += 6) {
          const [px, py, pz] = project(lon, lat, rotation, r, cx, cy);
          if (pz <= 0) continue;
          if (lon === -180) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
      // Graticule — meridians
      for (let lon = -180; lon <= 180; lon += 30) {
        ctx.beginPath();
        for (let lat = -90; lat <= 90; lat += 4) {
          const [px, py, pz] = project(lon, lat, rotation, r, cx, cy);
          if (pz <= 0) continue;
          if (lat === -90) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }

      // Continents (fill visible portion)
      ctx.fillStyle = colors.land;
      ctx.beginPath();
      for (const poly of CONTINENTS) {
        let started = false;
        for (const [lon, lat] of poly) {
          const [px, py, pz] = project(lon, lat, rotation, r, cx, cy);
          if (pz <= -0.05) { started = false; continue; }
          if (!started) { ctx.moveTo(px, py); started = true; }
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
      }
      ctx.fill();

      // Rim highlight
      ctx.strokeStyle = "oklch(0.85 0.060 260 / 0.5)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();

      // Outer orbit ring (animated dash offset)
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.strokeStyle = colors.ring;
      ctx.lineWidth = 1.25;
      ctx.setLineDash([size * 0.06, size * 0.04]);
      ctx.beginPath();
      ctx.arc(0, 0, r + size * 0.06, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      // Orbit marker
      ctx.fillStyle = colors.ring;
      ctx.beginPath();
      ctx.arc(r + size * 0.06, 0, size * 0.028, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      if (!prefersReduced) rotation = (rotation + 0.6) % 360;
      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current);
    };
  }, [size, tone]);

  return (
    <span
      className={cn("inline-flex items-center gap-3", className)}
      role="status"
      aria-label={label ?? "Loading"}
    >
      <canvas ref={canvasRef} aria-hidden />
      {label ? (
        <span className="text-sm font-medium text-surface-600">{label}</span>
      ) : null}
    </span>
  );
}
