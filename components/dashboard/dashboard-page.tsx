"use client";

import { useEffect, useState } from "react";
import { RefreshCcw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { Assignment, CalendarEvent, CoralRow, Task } from "@/lib/types";

type DashboardPayload = {
  today: string;
  events: CalendarEvent[];
  assignments: Assignment[];
  tasks: Task[];
  commits: CoralRow[];
};

function formatEventTime(value: string | null) {
  if (!value) {
    return "All day";
  }

  return value.length >= 16 ? value.slice(11, 16) : "All day";
}

function DashboardSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {[0, 1, 2].map((index) => (
        <Card key={index}>
          <CardHeader>
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-4 w-40" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function DashboardPage() {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  function loadDashboard() {
    setError(null);
    setIsLoading(true);

    void (async () => {
      try {
        const response = await fetch("/api/dashboard", { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Dashboard request failed");
        }

        const payload = (await response.json()) as DashboardPayload;
        setData(payload);
      } catch (dashboardError) {
        console.error(dashboardError);
        setError("Dashboard data could not be loaded. Check Coral and Google Calendar env setup.");
      } finally {
        setIsLoading(false);
      }
    })();
  }

  useEffect(() => {
    setError(null);
    setIsLoading(true);

    void (async () => {
      try {
        const response = await fetch("/api/dashboard", { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Dashboard request failed");
        }

        const payload = (await response.json()) as DashboardPayload;
        setData(payload);
      } catch (dashboardError) {
        console.error(dashboardError);
        setError("Dashboard data could not be loaded. Check Coral and Google Calendar env setup.");
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <Badge className="mb-3" variant="secondary">
            Daily snapshot
          </Badge>
          <h2 className="text-3xl font-semibold text-zinc-50">Your morning paper</h2>
          <p className="mt-2 max-w-2xl text-sm text-zinc-400">
            Calendar, coursework, open work, and recent GitHub activity in one glance.
          </p>
        </div>
        <Button variant="outline" onClick={loadDashboard} disabled={isLoading}>
          <RefreshCcw className={`size-4 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {!data && isLoading ? <DashboardSkeleton /> : null}
      {error ? <p className="text-sm text-rose-400">{error}</p> : null}

      {data ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Today</CardTitle>
              <CardDescription>{data.today}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.events.length === 0 ? (
                <div className="rounded-lg border border-dashed border-zinc-800 p-4 text-sm text-zinc-500">
                  Nothing scheduled yet. A clear runway.
                </div>
              ) : (
                data.events.map((event) => (
                  <div key={event.id} className="rounded-lg border border-zinc-900 bg-zinc-950/80 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-medium text-zinc-50">{event.summary}</h3>
                      <Badge>{formatEventTime(event.start)}</Badge>
                    </div>
                    {event.description ? (
                      <p className="mt-2 text-sm text-zinc-400">{event.description}</p>
                    ) : null}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Assignments</CardTitle>
              <CardDescription>Pending college work from SQLite</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.assignments.length === 0 ? (
                <div className="rounded-lg border border-dashed border-zinc-800 p-4 text-sm text-zinc-500">
                  No pending assignments right now.
                </div>
              ) : (
                data.assignments.map((assignment) => (
                  <div
                    key={assignment.id}
                    className="rounded-lg border border-zinc-900 bg-zinc-950/80 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-zinc-50">{assignment.title}</p>
                        <p className="text-sm text-zinc-400">{assignment.subject}</p>
                      </div>
                      <Badge variant="outline">{assignment.due_date ?? "No due date"}</Badge>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Work</CardTitle>
              <CardDescription>Pending tasks and recent Coral-backed GitHub commits</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-zinc-300">Open tasks</h3>
                  <Badge variant="secondary">{data.tasks.length}</Badge>
                </div>
                {data.tasks.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-zinc-800 p-4 text-sm text-zinc-500">
                    No pending tasks.
                  </div>
                ) : (
                  data.tasks.slice(0, 4).map((task) => (
                    <div key={task.id} className="rounded-lg border border-zinc-900 bg-zinc-950/80 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium text-zinc-50">{task.title}</p>
                        <Badge variant="outline">{task.type}</Badge>
                      </div>
                      {task.project ? (
                        <p className="mt-2 text-sm text-zinc-400">{task.project}</p>
                      ) : null}
                    </div>
                  ))
                )}
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-medium text-zinc-300">Recent commits</h3>
                {data.commits.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-zinc-800 p-4 text-sm text-zinc-500">
                    Coral did not return any commit rows yet.
                  </div>
                ) : (
                  data.commits.map((commit, index) => (
                    <div key={`${commit.repo_name ?? "repo"}-${index}`} className="rounded-lg border border-zinc-900 bg-zinc-950/80 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium text-zinc-50">
                          {String(commit.repo_name ?? "Unknown repo")}
                        </p>
                        <span className="text-xs text-zinc-500">
                          {String(commit.committed_at ?? "")}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-zinc-300">
                        {String(commit.message ?? "No commit message")}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {String(commit.author_name ?? "Unknown author")}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
