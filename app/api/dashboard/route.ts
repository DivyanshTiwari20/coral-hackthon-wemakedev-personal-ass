import { NextResponse } from "next/server";

import { getCalendarEvents } from "@/lib/calendar";
import { runCoralQuery } from "@/lib/coral";
import { listPendingAssignments, listPendingTasks } from "@/lib/db";
import { getTodayDateString } from "@/lib/dates";
import { getRequiredEnv } from "@/lib/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const today = getTodayDateString();
    const username = getRequiredEnv("GITHUB_USERNAME").replace(/'/g, "''");

    const [events, assignments, tasks] = await Promise.all([
      getCalendarEvents(today),
      Promise.resolve(listPendingAssignments()),
      Promise.resolve(listPendingTasks()),
    ]);

    const commits = runCoralQuery(
      `SELECT repo_name, message, author_name, committed_at
       FROM github.commits
       WHERE author_login = '${username}'
       ORDER BY committed_at DESC
       LIMIT 10`,
    );

    return NextResponse.json({
      today,
      events,
      assignments,
      tasks,
      commits,
    });
  } catch (error) {
    console.error("Dashboard route failed", error);

    return NextResponse.json(
      { error: "Failed to load dashboard data." },
      { status: 500 },
    );
  }
}
