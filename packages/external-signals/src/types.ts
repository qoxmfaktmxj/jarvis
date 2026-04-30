/**
 * Adapter result types — RSC 노출 타입과 분리.
 *
 * 어댑터는 외부 API의 raw payload를 정규화한 "현재 시점 측정값"만 반환한다.
 * 직전 fetch 대비 변화율(change) 계산은 worker가 DB의 직전 row를 조회해 수행한다.
 * (어댑터를 stateless하게 유지하려는 결정 — DB 의존을 어댑터 밖에 둔다.)
 */

export interface FxRates {
  USD: number;
  EUR: number;
  JPY: number;
}

export interface FxAdapterResult {
  base: "KRW";
  rates: FxRates;
  /** 어댑터가 측정한 시점 (서버 시계). */
  fetchedAt: Date;
}

export type SkyLabel = "맑음" | "구름많음" | "흐림";
export type PtyLabel = "없음" | "비" | "눈" | "비/눈" | "소나기";

export interface WeatherAdapterResult {
  /** 현재 기온 (°C). */
  temp: number;
  /** 일 최고 기온 (°C). 발표가 늦을 경우 TMP slots fallback. */
  hi: number;
  /** 일 최저 기온 (°C). */
  lo: number;
  sky: SkyLabel;
  pty: PtyLabel;
  fetchedAt: Date;
}
