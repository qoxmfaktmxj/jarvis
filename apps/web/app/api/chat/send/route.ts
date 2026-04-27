import { NextResponse } from "next/server";
import { sendMessage } from "@/app/actions/chat";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { id } = await sendMessage(body);
    return NextResponse.json({ status: "ok", data: { id } });
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
