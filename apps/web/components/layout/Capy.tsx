"use client";

/**
 * Capy — 카피바라 마스코트 렌더러
 *
 * 16종 PNG 에셋을 이름으로 참조. 모든 카피바라는 assets/capybara/ 에 위치.
 * 용도:
 *  - 빈 상태 일러스트
 *  - 성공 토스트 악센트
 *  - 로딩/환영 화면
 *  - 페이지 장식
 *
 * Next.js <Image>로 최적화, 지연 로드. priority는 above-fold에만.
 */

import Image from "next/image";
import { cn } from "@/lib/utils";

export type CapyName =
  | "reading"
  | "basic"
  | "onsen"
  | "watermelon"
  | "surprise"
  | "astronaut"
  | "bird"
  | "snorkel"
  | "cabbage"
  | "zen"
  | "armchair"
  | "garden"
  | "chef"
  | "music"
  | "painter"
  | "diver";

export const CAPY_REGISTRY: Record<CapyName, { src: string; alt: string }> = {
  reading:    { src: "/capybara/reading.png",    alt: "책 읽는 카피바라" },
  basic:      { src: "/capybara/basic.png",      alt: "기본 카피바라" },
  onsen:      { src: "/capybara/onsen.png",      alt: "온천 카피바라" },
  watermelon: { src: "/capybara/watermelon.png", alt: "수박을 든 카피바라" },
  surprise:   { src: "/capybara/surprise.png",   alt: "놀란 카피바라" },
  astronaut:  { src: "/capybara/astronaut.png",  alt: "우주복을 입은 카피바라" },
  bird:       { src: "/capybara/bird.png",       alt: "새와 함께한 카피바라" },
  snorkel:    { src: "/capybara/snorkel.png",    alt: "스노클링하는 카피바라" },
  cabbage:    { src: "/capybara/cabbage.png",    alt: "양배추를 든 카피바라" },
  zen:        { src: "/capybara/zen.png",        alt: "명상하는 카피바라" },
  armchair:   { src: "/capybara/armchair.png",   alt: "안락의자에 앉은 카피바라" },
  garden:     { src: "/capybara/garden.png",     alt: "정원을 돌보는 카피바라" },
  chef:       { src: "/capybara/chef.png",       alt: "요리하는 카피바라" },
  music:      { src: "/capybara/music.png",      alt: "기타 치는 카피바라" },
  painter:    { src: "/capybara/painter.png",    alt: "그림 그리는 카피바라" },
  diver:      { src: "/capybara/diver.png",      alt: "다이빙하는 카피바라" },
};

export const CAPY_NAMES = Object.keys(CAPY_REGISTRY) as CapyName[];

type CapyProps = {
  name: CapyName;
  size?: number;
  className?: string;
  alt?: string;
  priority?: boolean;
};

export function Capy({ name, size = 120, className, alt, priority = false }: CapyProps) {
  const entry = CAPY_REGISTRY[name];
  return (
    <Image
      src={entry.src}
      alt={alt ?? entry.alt}
      width={size}
      height={size}
      priority={priority}
      className={cn("select-none", className)}
      draggable={false}
    />
  );
}
