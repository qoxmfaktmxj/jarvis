import { NextRequest, NextResponse } from "next/server";
import { deleteSession } from "@jarvis/auth/session";

export async function POST(request: NextRequest) {
  const sessionId =
    request.cookies.get("sessionId")?.value ??
    request.cookies.get("jarvis_session")?.value;

  if (sessionId) {
    await deleteSession(sessionId);
  }

  const response = NextResponse.redirect(new URL("/login", request.url));
  response.cookies.delete("sessionId");
  response.cookies.delete("jarvis_session");
  return response;
}
