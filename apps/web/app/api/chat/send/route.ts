import { NextRequest, NextResponse } from "next/server";
import { sendMessage } from "@/app/actions/chat";
import { requireApiSession } from "@/lib/server/api-auth";

export async function POST(req: NextRequest) {
  const auth = await requireApiSession(req);
  if (auth.response) return auth.response;

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
