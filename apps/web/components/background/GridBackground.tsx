"use client";

import { useEffect, useRef, useState } from "react";
import { capDpr, nextGridMode, type GridMode } from "./grid-background-core";
import {
  BLINKING_CONFIG,
  KINETIC_CONFIG,
  createBlinkingScene,
  createKineticScene,
  drawBlinkingFrame,
  drawKineticFrame,
  type BlinkingScene,
  type KineticScene,
  type PointerState,
} from "./grid-renderers";

const STORAGE_KEY = "jarvis.gridBackground.mode";
type Scene =
  | { mode: "blinking"; value: BlinkingScene }
  | { mode: "kinetic"; value: KineticScene };

function readColors() {
  const style = getComputedStyle(document.documentElement);
  return {
    bgColor: style.getPropertyValue("--bg-page").trim() || "#ffffff",
    brandColor: style.getPropertyValue("--brand-primary").trim() || "#315c4c",
  };
}

function previousMode(): GridMode | null {
  try {
    const value = sessionStorage.getItem(STORAGE_KEY);
    return value === "blinking" || value === "kinetic" ? value : null;
  } catch {
    return null;
  }
}

export function GridBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<GridMode | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const selectedMode = nextGridMode(previousMode(), Math.random());
    try { sessionStorage.setItem(STORAGE_KEY, selectedMode); } catch { /* private mode */ }
    setMode(selectedMode);

    const pointer: PointerState = { x: 0, y: 0, active: false };
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let scene: Scene;
    let rafId: number | null = null;

    const rebuild = () => {
      const colors = readColors();
      const size = { width: window.innerWidth, height: window.innerHeight };
      scene = selectedMode === "blinking"
        ? { mode: "blinking", value: createBlinkingScene(size, { ...BLINKING_CONFIG, bgColor: colors.bgColor, cellColor: colors.brandColor }) }
        : { mode: "kinetic", value: createKineticScene(size, { ...KINETIC_CONFIG, bgColor: colors.bgColor, lineColor: colors.brandColor, dotColor: colors.brandColor }) };
    };
    const draw = (timeMs: number, isStatic: boolean) => {
      const frame = { time: timeMs / 1000, pointer, isStatic };
      if (scene.mode === "blinking") drawBlinkingFrame(ctx, scene.value, frame);
      else drawKineticFrame(ctx, scene.value, frame);
    };
    const animate = (timeMs: number) => {
      draw(timeMs, false);
      rafId = requestAnimationFrame(animate);
    };
    const stop = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = null;
    };
    const syncMotion = () => {
      stop();
      if (media.matches) draw(1000, true);
      else rafId = requestAnimationFrame(animate);
    };
    const resize = () => {
      const dpr = capDpr(window.devicePixelRatio);
      canvas.width = Math.max(1, Math.round(window.innerWidth * dpr));
      canvas.height = Math.max(1, Math.round(window.innerHeight * dpr));
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      rebuild();
      if (media.matches) draw(1000, true);
    };
    const move = (event: PointerEvent) => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.active = true;
    };
    const clear = () => { pointer.active = false; };

    resize();
    syncMotion();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerleave", clear);
    window.addEventListener("blur", clear);
    media.addEventListener("change", syncMotion);
    return () => {
      stop();
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerleave", clear);
      window.removeEventListener("blur", clear);
      media.removeEventListener("change", syncMotion);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      data-testid="grid-background"
      data-mode={mode ?? undefined}
      aria-hidden="true"
      style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }}
    />
  );
}
