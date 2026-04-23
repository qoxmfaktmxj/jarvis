import { DateCard } from "./DateCard";
import { TimeCard } from "./TimeCard";
import { WeatherCard } from "./WeatherCard";
import { FxCard } from "./FxCard";

export async function InfoCardRow({ now }: { now: Date }) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
      <DateCard now={now} />
      <TimeCard />
      <WeatherCard />
      <FxCard />
    </div>
  );
}
