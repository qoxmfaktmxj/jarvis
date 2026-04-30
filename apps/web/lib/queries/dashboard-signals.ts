/**
 * dashboard-signals.ts — RSC 진입점에서 환율·날씨 시그널을 조회.
 *
 * Phase-Dashboard (2026-04-30) 인스턴스 분할 작업 계약:
 *  - Instance 1 (이 파일): interface stub만 제공.
 *  - Instance 2 (별도 worktree, claude/dashboard-phase1-signals 브랜치):
 *    · `external_signal` 테이블에서 latest payload select
 *    · user.preferences.weatherGrid override 반영 (없으면 워크스페이스 default = 서초구 nx=60, ny=125)
 *    · cache age > 90min이면 stale flag 반환
 *    · exchangerate-api / KMA 단기예보 fetch는 worker(apps/worker)가 cron으로 처리
 *
 * 본 파일의 시그니처가 Instance 2의 구현 계약이다. 변경 시 Instance 2와 사전 합의.
 */

export interface FxSignal {
  base: "KRW";
  rates: { USD: number; EUR: number; JPY: number };
  /** 직전 fetch 대비 변화율 (소수, 양수 = 원화 약세). */
  change: { USD: number; EUR: number; JPY: number };
  fetchedAt: Date;
  stale: boolean;
}

export interface WeatherSignal {
  /** 격자좌표 + 표시용 라벨. */
  region: { nx: number; ny: number; label: string };
  /** 현재 기온 (°C). */
  temp: number;
  /** 최고/최저 기온 (°C). */
  hi: number;
  lo: number;
  /** 하늘 상태 한국어 라벨. */
  sky: "맑음" | "구름많음" | "흐림";
  /** 강수 형태. */
  pty: "없음" | "비" | "눈" | "비/눈" | "소나기";
  /** 미세먼지 등급 (선택). */
  dust?: "좋음" | "보통" | "나쁨" | "매우나쁨";
  fetchedAt: Date;
  stale: boolean;
}

export interface DashboardSignals {
  fx: FxSignal | null;
  weather: WeatherSignal | null;
}

/**
 * Instance 2가 본문 구현. Instance 1의 카드 컴포넌트는 이 시그니처에 의존.
 *
 * 동작 계약:
 *  1. user.preferences.weatherGrid가 있으면 그 격자, 없으면 워크스페이스 default 격자(서초구).
 *  2. external_signal 테이블에서 (workspaceId, kind, key) 조합으로 최근 payload 조회.
 *  3. fetchedAt이 90분 이상 지난 경우 stale=true (UI에서 표시 가능).
 *  4. 데이터가 아예 없으면 null 반환 (UI는 "데이터 준비 중" empty state 노출).
 */
export async function getDailySignals(
  workspaceId: string,
  userId: string
): Promise<DashboardSignals> {
  // STUB — Instance 2(claude/dashboard-phase1-signals)에서 구현.
  // 본 stub은 카드 컴포넌트가 import 가능하도록 시그니처만 보장한다.
  // 의도적으로 빈 결과 반환: UI는 "데이터 준비 중" 또는 mock 표시로 graceful degrade.
  void workspaceId;
  void userId;
  return { fx: null, weather: null };
}
