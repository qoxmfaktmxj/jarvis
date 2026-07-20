import { and, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, rotateSession, sessionCookieOptions, verifyPassword } from "@jarvis/auth";
import { PUBLIC_WORKSPACE_CODE, appUser, db, workspace } from "@jarvis/db";
import { isAllowedRoutePath } from "@jarvis/shared/constants/routes";
import { loginInput } from "@jarvis/shared/validation/auth";

const credentialsInput = loginInput.omit({ currentSessionId: true });
const DUMMY_PASSWORD_HASH = `scrypt$${"00".repeat(16)}$${"00".repeat(64)}`;

function safeReturnTo(request: NextRequest): string {
  const value = request.nextUrl.searchParams.get("returnTo");
  return isAllowedRoutePath(value) ? value : "/dashboard";
}

function unauthorized(): NextResponse {
  return NextResponse.json(
    { ok: false, error: "INVALID_CREDENTIALS" },
    { status: 401, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json().catch(() => null);
  const parsed = credentialsInput.safeParse(body);
  if (!parsed.success) {
    return unauthorized();
  }

  const [user] = await db
    .select({
      id: appUser.id,
      passwordHash: appUser.passwordHash,
      status: appUser.status,
      accountType: appUser.accountType,
    })
    .from(appUser)
    .innerJoin(workspace, eq(workspace.id, appUser.workspaceId))
    .where(and(eq(workspace.code, PUBLIC_WORKSPACE_CODE), eq(appUser.email, parsed.data.email.toLowerCase())))
    .limit(1);

  const passwordMatches = await verifyPassword(parsed.data.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
  if (!user || !passwordMatches || user.status !== "active" || user.accountType !== "human" || !user.passwordHash) {
    return unauthorized();
  }

  let issued;
  try {
    issued = await rotateSession({
      currentSessionId: request.cookies.get(SESSION_COOKIE_NAME)?.value ?? null,
      userId: user.id,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }
    throw error;
  }

  const response = NextResponse.json(
    { ok: true, redirectTo: safeReturnTo(request) },
    { headers: { "Cache-Control": "no-store" } },
  );
  response.cookies.set(SESSION_COOKIE_NAME, issued.sessionId, sessionCookieOptions(issued.expiresAt));
  return response;
}
