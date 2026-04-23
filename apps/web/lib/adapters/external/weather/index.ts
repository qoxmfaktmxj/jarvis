import type { WeatherAdapter } from "./types.js";
import { MockWeatherAdapter } from "./mock.js";

export type { WeatherAdapter, WeatherSnapshot } from "./types.js";

export function getWeatherAdapter(): WeatherAdapter {
  return new MockWeatherAdapter();
}
