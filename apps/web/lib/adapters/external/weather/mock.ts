import type { WeatherAdapter, WeatherSnapshot } from "./types.js";

const MOCK: Omit<WeatherSnapshot, "fetchedAt"> = {
  region: "seoul",
  regionLabel: "서울",
  condition: "맑음",
  tempC: 18,
  hiC: 22,
  loC: 12,
  particulate: "좋음",
  source: "mock"
};

export class MockWeatherAdapter implements WeatherAdapter {
  async getSnapshot(_region: string): Promise<WeatherSnapshot> {
    return { ...MOCK, fetchedAt: new Date().toISOString() };
  }
}
