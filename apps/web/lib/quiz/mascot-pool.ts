/**
 * 시즌 첫 참여 시 자동 unlock — 누구나 가지는 baseline 3종.
 */
export const BASELINE_MASCOTS = ["basic", "reading", "zen"] as const;
export type BaselineMascot = (typeof BASELINE_MASCOTS)[number];

/**
 * 시즌 1위 보상 — 희귀.
 */
export const RARE_MASCOTS = ["astronaut"] as const;
export type RareMascot = (typeof RARE_MASCOTS)[number];

/**
 * 시즌 2-3위 보상 — 일반 풀.
 * /apps/web/public/capybara/{id}.png 에 실제 이미지 존재.
 */
export const COMMON_MASCOTS = [
  "armchair",
  "bird",
  "cabbage",
  "chef",
  "diver",
  "garden",
  "music",
  "onsen",
  "painter",
  "snorkel",
  "surprise",
  "watermelon"
] as const;
export type CommonMascot = (typeof COMMON_MASCOTS)[number];

export const ALL_MASCOTS = [
  ...BASELINE_MASCOTS,
  ...COMMON_MASCOTS,
  ...RARE_MASCOTS
] as const;
export type MascotId = (typeof ALL_MASCOTS)[number];

/**
 * 사용자가 이미 가진 mascot을 제외한 common 후보 중 하나를 결정론적으로 선택.
 * seed 값(예: seasonId + userId)으로 같은 입력은 같은 결과를 반환한다.
 * 모두 unlock한 경우 null.
 */
export function pickCommonMascot(owned: readonly string[], seed: string): string | null {
  const ownedSet = new Set(owned);
  const candidates = COMMON_MASCOTS.filter((m) => !ownedSet.has(m));
  if (candidates.length === 0) return null;
  const idx = hashSeed(seed) % candidates.length;
  return candidates[idx]!;
}

/**
 * 시즌 1위 보상. RARE 풀에서 결정론적으로 1개. 모두 unlock한 경우 common으로 fallback.
 */
export function pickRareMascot(owned: readonly string[], seed: string): string | null {
  const ownedSet = new Set(owned);
  const candidates = RARE_MASCOTS.filter((m) => !ownedSet.has(m));
  if (candidates.length === 0) {
    return pickCommonMascot(owned, seed);
  }
  const idx = hashSeed(seed) % candidates.length;
  return candidates[idx]!;
}

/**
 * djb2 변형 — 가벼운 결정론적 해시. crypto가 아니라 보상 분배용.
 */
export function hashSeed(input: string): number {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h * 33) ^ input.charCodeAt(i)) >>> 0;
  }
  return h;
}
