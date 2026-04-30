/**
 * Public API for `@jarvis/external-signals`.
 *
 * 외부 시그널 어댑터 (환율, 날씨). DB·캐시·LLM 의존 없음 — pure adapter.
 * worker(`apps/worker/src/jobs/external-signal-fetch.ts`)와 RSC layer가 사용.
 */

export type {
  FxAdapterResult,
  FxRates,
  WeatherAdapterResult,
  SkyLabel,
  PtyLabel
} from "./types.js";

export { fetchKrwRates } from "./exchangerate.js";
export { fetchVilageFcst, computeKmaBaseDateTime } from "./kma.js";
