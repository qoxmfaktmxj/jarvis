export type WeatherCondition =
  | "맑음"
  | "구름많음"
  | "흐림"
  | "비"
  | "눈"
  | "소나기";

export type WeatherParticulate = "좋음" | "보통" | "나쁨" | "매우나쁨";

export type WeatherSnapshot = {
  region: string;
  regionLabel: string;
  condition: WeatherCondition;
  tempC: number;
  hiC: number;
  loC: number;
  particulate: WeatherParticulate;
  source: "mock" | "kma";
  fetchedAt: string;
};

export interface WeatherAdapter {
  getSnapshot(region: string): Promise<WeatherSnapshot>;
}
