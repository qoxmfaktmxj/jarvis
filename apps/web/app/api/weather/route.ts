import { NextResponse } from "next/server";
import { getWeatherAdapter } from "@/lib/adapters/external/weather";
import type { WeatherSnapshot } from "@/lib/adapters/external/weather";

const TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { snap: WeatherSnapshot; expiresAt: number }>();

export async function GET(req: Request) {
  const url = new URL(req.url);
  const region = url.searchParams.get("region") ?? "seoul";
  try {
    const now = Date.now();
    const cached = cache.get(region);
    if (cached && cached.expiresAt > now) {
      return NextResponse.json(
        { status: "ok", data: cached.snap },
        { headers: { "Cache-Control": "s-maxage=600, stale-while-revalidate=60" } }
      );
    }
    const adapter = getWeatherAdapter();
    const snap = await adapter.getSnapshot(region);
    cache.set(region, { snap, expiresAt: now + TTL_MS });
    return NextResponse.json(
      { status: "ok", data: snap },
      { headers: { "Cache-Control": "s-maxage=600, stale-while-revalidate=60" } }
    );
  } catch (err) {
    return NextResponse.json(
      { status: "error", message: err instanceof Error ? err.message : "unknown" },
      { status: 200 }
    );
  }
}
