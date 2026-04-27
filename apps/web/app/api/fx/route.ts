import { NextResponse } from "next/server";
import { getFxAdapter } from "@/lib/adapters/external/fx";
import type { FxSnapshot } from "@/lib/adapters/external/fx";

const TTL_MS = 60 * 60 * 1000;
let cached: { snap: FxSnapshot; expiresAt: number } | null = null;

export async function GET(_req: Request) {
  try {
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
      return NextResponse.json(
        { status: "ok", data: cached.snap },
        { headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=300" } }
      );
    }
    const snap = await getFxAdapter().getSnapshot();
    cached = { snap, expiresAt: now + TTL_MS };
    return NextResponse.json(
      { status: "ok", data: snap },
      { headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=300" } }
    );
  } catch (err) {
    return NextResponse.json(
      { status: "error", message: err instanceof Error ? err.message : "unknown" },
      { status: 200 }
    );
  }
}
