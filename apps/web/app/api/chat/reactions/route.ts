import { NextResponse } from "next/server";
import { toggleReaction } from "@/app/actions/chat";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const result = await toggleReaction(body);
    return NextResponse.json({ status: "ok", data: result });
  } catch (err) {
    return NextResponse.json(
      {
        status: "error",
        message: err instanceof Error ? err.message : "unknown"
      },
      { status: 400 }
    );
  }
}
