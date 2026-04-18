import { Suspense } from "react";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth/rbac";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { getMonthlyAttendance } from "@/lib/queries/attendance";
import { AttendanceCalendar } from "@/components/attendance/AttendanceCalendar";
import { AttendanceTable } from "@/components/attendance/AttendanceTable";
import { LeaveRequestForm } from "@/components/attendance/LeaveRequestForm";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/patterns/PageHeader";
import { isoWeekNumber } from "@/lib/date-utils";
import type { PageProps } from "@jarvis/shared/types/page";

export const metadata = { title: "근태등록" };

// Hardcoded per app.jsx prototype. Swap for server data once the leave-
// request schema and actions land.
const MY_REQUESTS: Array<[string, string, string, string]> = [
  ["연차", "04-08 → 04-08", "완료", "var(--mint)"],
  ["반차", "04-02 오전", "완료", "var(--mint)"],
  ["연차", "03-25 → 03-27", "완료", "var(--mint)"],
];

const TEAM_LEAVES: Array<[string, string, string]> = [
  ["이수민", "04-21 → 04-23", "연차"],
  ["강민호", "04-22", "반차"],
  ["정다빈", "04-24", "연차"],
];

function chip(bg: string, fg: string): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "2px 6px",
    fontSize: 10.5,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: ".04em",
    background: bg,
    color: fg,
    borderRadius: 4,
  };
}

async function MonthlyRecords({
  month,
  userId,
  workspaceId,
}: {
  month: string;
  userId: string;
  workspaceId: string;
}) {
  const records = await getMonthlyAttendance(workspaceId, userId, month);
  return (
    <div style={{ marginTop: 28, display: "flex", flexDirection: "column", gap: 20 }}>
      <section>
        <div
          className="mono"
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: ".08em",
            color: "var(--muted)",
            textTransform: "uppercase",
            marginBottom: 12,
          }}
        >
          월별 출근 현황
        </div>
        <AttendanceCalendar records={records} month={month} />
      </section>
      <section>
        <div
          className="mono"
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: ".08em",
            color: "var(--muted)",
            textTransform: "uppercase",
            marginBottom: 12,
          }}
        >
          일별 기록
        </div>
        <AttendanceTable records={records} month={month} />
      </section>
    </div>
  );
}

export default async function AttendancePage({ searchParams }: PageProps) {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("sessionId")?.value;
  const session = sessionId ? await getSession(sessionId) : null;
  if (!session) redirect("/login");
  if (!hasPermission(session, PERMISSIONS.ATTENDANCE_READ)) redirect("/dashboard");

  const sp = await searchParams;
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const month =
    typeof sp?.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : defaultMonth;

  return (
    <div style={{ padding: "28px 36px", maxWidth: 1200, margin: "0 auto" }}>
      <PageHeader
        stamp={`W${isoWeekNumber(new Date())}`}
        kicker="Attendance"
        title="근태등록"
        subtitle="연차, 반차, 병가, 공가를 신청하고 결재 현황을 확인합니다."
        actions={
          <span className="mono" style={chip("var(--mint-tint)", "var(--mint)")}>
            잔여 연차 8.5d
          </span>
        }
      />

      {/* Top: new-request form (1.15fr) · status cards (1fr) */}
      <div style={{ display: "grid", gridTemplateColumns: "1.15fr 1fr", gap: 16 }}>
        {/* Left: new-request card */}
        <div
          style={{
            background: "var(--panel)",
            border: "1px solid var(--line)",
            borderRadius: 12,
            padding: 22,
          }}
        >
          <div
            className="mono"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: ".08em",
              color: "var(--muted)",
              textTransform: "uppercase",
            }}
          >
            <span
              style={{
                display: "inline-block",
                width: 6,
                height: 6,
                borderRadius: 99,
                background: "var(--mint)",
              }}
            />
            신규 신청
          </div>
          <LeaveRequestForm />
        </div>

        {/* Right column: status + team leaves */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div
            style={{
              background: "var(--panel)",
              border: "1px solid var(--line)",
              borderRadius: 12,
              padding: 20,
            }}
          >
            <div
              className="mono"
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: ".08em",
                color: "var(--muted)",
                textTransform: "uppercase",
              }}
            >
              내 신청 현황
            </div>
            <div style={{ marginTop: 12 }}>
              {MY_REQUESTS.map(([type, when, status, color], i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 0",
                    borderTop: i ? "1px solid var(--line2)" : "none",
                  }}
                >
                  <span className="mono" style={chip("var(--line2)", "var(--ink2)")}>
                    {type}
                  </span>
                  <span className="mono" style={{ fontSize: 12, color: "var(--ink2)" }}>
                    {when}
                  </span>
                  <span
                    style={{
                      marginLeft: "auto",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      fontSize: 12,
                      color,
                    }}
                  >
                    <span
                      style={{
                        display: "inline-block",
                        width: 6,
                        height: 6,
                        borderRadius: 99,
                        background: color,
                      }}
                    />
                    {status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div
            style={{
              background: "var(--panel)",
              border: "1px solid var(--line)",
              borderRadius: 12,
              padding: 20,
            }}
          >
            <div
              className="mono"
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: ".08em",
                color: "var(--muted)",
                textTransform: "uppercase",
              }}
            >
              금주 팀 휴가
            </div>
            <div
              style={{
                marginTop: 12,
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              {TEAM_LEAVES.map(([name, when, type], i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    fontSize: 13,
                  }}
                >
                  <div
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 99,
                      background: "var(--accent-tint)",
                      color: "var(--accent-ink)",
                      display: "grid",
                      placeItems: "center",
                      fontSize: 10.5,
                      fontWeight: 600,
                    }}
                  >
                    {name[0]}
                  </div>
                  <span style={{ fontWeight: 500 }}>{name}</span>
                  <span
                    className="mono"
                    style={{
                      marginLeft: "auto",
                      fontSize: 11.5,
                      color: "var(--muted)",
                    }}
                  >
                    {when}
                  </span>
                  <span className="mono" style={chip("var(--line2)", "var(--ink2)")}>
                    {type}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Below: legacy monthly calendar + records (preserves server query) */}
      <Suspense
        fallback={
          <div style={{ marginTop: 28, display: "flex", flexDirection: "column", gap: 16 }}>
            <Skeleton className="h-[340px] w-full rounded-xl" />
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        }
      >
        <MonthlyRecords month={month} userId={session.userId} workspaceId={session.workspaceId} />
      </Suspense>
    </div>
  );
}
