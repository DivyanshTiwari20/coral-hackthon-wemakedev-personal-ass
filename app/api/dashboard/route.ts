import { NextResponse } from "next/server";

import { getUpcomingCalendarItems } from "@/lib/calendar";
import { runCoralQuery } from "@/lib/coral";
import { listPendingAssignments, listPendingTasks } from "@/lib/db";
import { getTodayDateString } from "@/lib/dates";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function normalizeGithubRepoRow(row: Record<string, string | number | null>) {
  const name = String(row.name ?? "");
  const updatedAt = row.updated_at ? String(row.updated_at) : null;
  const pushedAt = row.pushed_at ? String(row.pushed_at) : null;

  return {
    name,
    updated_at: updatedAt,
    pushed_at: pushedAt,
    date: pushedAt ?? updatedAt,
    message: updatedAt ? `Last updated: ${updatedAt}` : "Last updated: unknown",
    author: "GitHub",
  };
}

export async function GET() {
  try {
    const today = getTodayDateString();

    const [calendarResult, assignments, tasks, commitsResult] = await Promise.allSettled([
      getUpcomingCalendarItems(14),
      Promise.resolve().then(() => listPendingAssignments()),
      Promise.resolve().then(() => listPendingTasks()),
      Promise.resolve().then(() =>
        runCoralQuery(
          `SELECT name, updated_at, pushed_at 
           FROM github.user_repos 
           ORDER BY pushed_at DESC 
           LIMIT 10`,
        ).map(normalizeGithubRepoRow),
      ),
    ]);

    return NextResponse.json({
      today,
      events: calendarResult.status === "fulfilled" ? calendarResult.value : [],
      assignments: assignments.status === "fulfilled" ? assignments.value : [],
      tasks: tasks.status === "fulfilled" ? tasks.value : [],
      commits: commitsResult.status === "fulfilled" ? commitsResult.value : [],
      calendarError:
        calendarResult.status === "rejected"
          ? "Google Calendar and Tasks could not be loaded. Reconnect Google with Calendar and Tasks access."
          : null,
      githubError:
        commitsResult.status === "rejected"
          ? "GitHub activity could not be loaded from Coral."
          : null,
    });
  } catch (error) {
    console.error("Dashboard route failed", error);

    return NextResponse.json(
      { error: "Failed to load dashboard data." },
      { status: 500 },
    );
  }
}
