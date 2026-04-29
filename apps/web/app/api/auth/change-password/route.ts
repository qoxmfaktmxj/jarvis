import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { eq, or } from "drizzle-orm";
import { hashPassword, verifyPassword } from "@jarvis/auth/password";
import { db } from "@jarvis/db/client";
import { auditLog, user } from "@jarvis/db/schema";
import { findTempDevAccount } from "@/lib/auth/dev-accounts";
import { checkRateLimit } from "@/lib/server/rate-limit";

const RATE_MAX = 5;
const RATE_WINDOW_SEC = 60;
const SYSTEM_WORKSPACE_ID = "00000000-0000-0000-0000-000000000000";

function extractClientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

export async function POST(request: NextRequest) {
  const ip = extractClientIp(request);
  const rl = checkRateLimit(`change-password:${ip}`, RATE_MAX, RATE_WINDOW_SEC);

  if (!rl.allowed) {
    return NextResponse.json(
      { error: "too_many_requests", retryAfterSec: rl.retryAfterSec ?? RATE_WINDOW_SEC },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec ?? RATE_WINDOW_SEC) } },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    username?: string;
    currentPassword?: string;
    newPassword?: string;
    confirmPassword?: string;
  } | null;

  if (!body?.username || !body.currentPassword || !body.newPassword || !body.confirmPassword) {
    return NextResponse.json({ error: "모든 필드를 입력하세요." }, { status: 400 });
  }

  if (body.newPassword !== body.confirmPassword) {
    return NextResponse.json({ error: "새 비밀번호가 일치하지 않습니다." }, { status: 400 });
  }

  if (body.newPassword.length === 0) {
    return NextResponse.json({ error: "비밀번호를 입력하세요." }, { status: 400 });
  }

  // 사용자 조회 (employeeId 또는 email)
  const [dbUser] = await db
    .select()
    .from(user)
    .where(or(eq(user.employeeId, body.username), eq(user.email, body.username)))
    .limit(1);

  let verified = false;

  if (dbUser?.passwordHash) {
    verified = await verifyPassword(body.currentPassword, dbUser.passwordHash);
  } else if ((process.env.NODE_ENV as string) !== "production") {
    // dev 전용: dev-accounts.ts로 현재 비밀번호 확인
    const account = findTempDevAccount(body.username, body.currentPassword);
    if (account) {
      // dev-account로 식별된 경우 email로 dbUser 재조회
      if (!dbUser) {
        const [devDbUser] = await db
          .select()
          .from(user)
          .where(eq(user.email, account.email))
          .limit(1);
        if (devDbUser) {
          verified = true;
          const newHash = await hashPassword(body.newPassword);
          await db
            .update(user)
            .set({ passwordHash: newHash, updatedAt: new Date() })
            .where(eq(user.id, devDbUser.id));

          await db
            .insert(auditLog)
            .values({
              workspaceId: devDbUser.workspaceId,
              userId: devDbUser.id,
              action: "auth.password.changed",
              resourceType: "user",
              resourceId: devDbUser.id,
              ipAddress: ip === "unknown" ? null : ip,
              details: { ip },
              success: true,
            })
            .catch(() => undefined);

          return NextResponse.json({ ok: true });
        }
      } else {
        verified = true;
      }
    }
  }

  if (!verified || !dbUser) {
    await db
      .insert(auditLog)
      .values({
        workspaceId: dbUser?.workspaceId ?? SYSTEM_WORKSPACE_ID,
        userId: dbUser?.id,
        action: "auth.password.change_fail",
        resourceType: "user",
        resourceId: dbUser?.id,
        ipAddress: ip === "unknown" ? null : ip,
        details: {
          ip,
          usernameHash: createHash("sha256").update(body.username).digest("hex").slice(0, 16),
        },
        success: false,
      })
      .catch(() => undefined);

    return NextResponse.json({ error: "아이디 또는 비밀번호가 올바르지 않습니다." }, { status: 401 });
  }

  const newHash = await hashPassword(body.newPassword);
  await db
    .update(user)
    .set({ passwordHash: newHash, updatedAt: new Date() })
    .where(eq(user.id, dbUser.id));

  await db
    .insert(auditLog)
    .values({
      workspaceId: dbUser.workspaceId,
      userId: dbUser.id,
      action: "auth.password.changed",
      resourceType: "user",
      resourceId: dbUser.id,
      ipAddress: ip === "unknown" ? null : ip,
      details: { ip },
      success: true,
    })
    .catch(() => undefined);

  return NextResponse.json({ ok: true });
}
