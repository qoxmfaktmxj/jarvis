import type { WeatherAdapter } from "./types";
import { MockWeatherAdapter } from "./mock";

export type { WeatherAdapter, WeatherSnapshot } from "./types";

export function getWeatherAdapter(): WeatherAdapter {
  return new MockWeatherAdapter();
}
