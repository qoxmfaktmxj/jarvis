import { NextResponse } from "next/server";
import { requirePageSession } from "@/lib/server/page-auth";
import { countOnlineUsers } from "@/lib/queries/chat";
import { CHAT_ONLINE_WINDOW_MINUTES } from "@jarvis/shared/constants/chat";

export async function GET() {
  try {
    const session = await requirePageSession();
    const count = await countOnlineUsers(session.workspaceId, CHAT_ONLINE_WINDOW_MINUTES);
    return NextResponse.json(
      { status: "ok", data: { count } },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return NextResponse.json({ status: "error", data: { count: 0 } });
  }
}
