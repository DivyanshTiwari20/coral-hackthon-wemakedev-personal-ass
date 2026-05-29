import { google } from "googleapis";

import { getRequiredEnv } from "@/lib/env";
import type { CalendarEvent } from "@/lib/types";

const defaultTimezone = "Asia/Kolkata";

function createGoogleAuthClient() {
  const oauth2Client = new google.auth.OAuth2(
    getRequiredEnv("GOOGLE_CALENDAR_CLIENT_ID"),
    getRequiredEnv("GOOGLE_CALENDAR_CLIENT_SECRET"),
    getRequiredEnv("GOOGLE_CALENDAR_REDIRECT_URI"),
  );

  oauth2Client.setCredentials({
    refresh_token: getRequiredEnv("GOOGLE_CALENDAR_REFRESH_TOKEN"),
  });

  return oauth2Client;
}

function createCalendarClient() {
  return google.calendar({ version: "v3", auth: createGoogleAuthClient() });
}

function createTasksClient() {
  return google.tasks({ version: "v1", auth: createGoogleAuthClient() });
}

function toCalendarEvent(event: {
  id?: string | null;
  summary?: string | null;
  description?: string | null;
  start?: { dateTime?: string | null; date?: string | null } | null;
  end?: { dateTime?: string | null; date?: string | null } | null;
  htmlLink?: string | null;
}): CalendarEvent {
  return {
    id: event.id ?? crypto.randomUUID(),
    summary: event.summary ?? "Untitled event",
    description: event.description ?? null,
    start: event.start?.dateTime ?? event.start?.date ?? null,
    end: event.end?.dateTime ?? event.end?.date ?? null,
    htmlLink: event.htmlLink ?? null,
    source: "google_calendar",
  };
}

function toGoogleTaskEvent(task: {
  id?: string | null;
  title?: string | null;
  notes?: string | null;
  due?: string | null;
  completed?: string | null;
  status?: string | null;
  webViewLink?: string | null;
}): CalendarEvent {
  return {
    id: `task-${task.id ?? crypto.randomUUID()}`,
    summary: task.title ?? "Untitled task",
    description: task.notes ?? null,
    start: task.due ?? null,
    end: task.completed ?? null,
    htmlLink: task.webViewLink ?? null,
    source: "google_task",
    status: task.status ?? null,
  };
}

function getDayRange(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const start = new Date(year, month - 1, day, 0, 0, 0, 0);
  const end = new Date(year, month - 1, day, 23, 59, 59, 999);

  return { start, end };
}

function getUpcomingRange(days: number) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + days);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

async function getCalendarEventsForRange(start: Date, end: Date) {
  const calendar = createCalendarClient();

  const response = await calendar.events.list({
    calendarId: "primary",
    maxResults: 50,
    singleEvents: true,
    orderBy: "startTime",
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
  });

  return (response.data.items ?? []).map((event) => toCalendarEvent(event));
}

async function getGoogleTasksForRange(start: Date, end: Date) {
  const tasks = createTasksClient();
  const taskLists = await tasks.tasklists.list({ maxResults: 20 });
  const lists = taskLists.data.items ?? [];
  const taskRows = await Promise.all(
    lists.map(async (taskList) => {
      if (!taskList.id) {
        return [];
      }

      const response = await tasks.tasks.list({
        tasklist: taskList.id,
        dueMin: start.toISOString(),
        dueMax: end.toISOString(),
        maxResults: 50,
        showCompleted: true,
        showDeleted: false,
        showHidden: false,
      });

      return response.data.items ?? [];
    }),
  );

  return taskRows.flat().map((task) => toGoogleTaskEvent(task));
}

function sortCalendarItems(items: CalendarEvent[]) {
  return items.sort((a, b) => {
    const first = a.start ? new Date(a.start).getTime() : Number.MAX_SAFE_INTEGER;
    const second = b.start ? new Date(b.start).getTime() : Number.MAX_SAFE_INTEGER;

    return first - second;
  });
}

async function getCombinedItems(start: Date, end: Date) {
  const [eventsResult, tasksResult] = await Promise.allSettled([
    getCalendarEventsForRange(start, end),
    getGoogleTasksForRange(start, end),
  ]);
  const items = [
    ...(eventsResult.status === "fulfilled" ? eventsResult.value : []),
    ...(tasksResult.status === "fulfilled" ? tasksResult.value : []),
  ];

  if (items.length === 0) {
    if (eventsResult.status === "rejected") {
      throw eventsResult.reason;
    }

    if (tasksResult.status === "rejected") {
      throw tasksResult.reason;
    }
  }

  return sortCalendarItems(items);
}

export async function getCalendarEvents(date: string) {
  const { start, end } = getDayRange(date);
  return getCombinedItems(start, end);
}

export async function getUpcomingCalendarItems(days = 30) {
  const { start, end } = getUpcomingRange(days);
  return getCombinedItems(start, end);
}

export async function createCalendarEvent(input: {
  summary: string;
  description?: string | null;
  start: string;
  end?: string | null;
  timezone?: string | null;
  location?: string | null;
}) {
  const calendar = createCalendarClient();
  const timezone = input.timezone ?? defaultTimezone;

  const response = await calendar.events.insert({
    calendarId: "primary",
    requestBody: {
      summary: input.summary,
      description: input.description ?? undefined,
      location: input.location ?? undefined,
      start: { dateTime: input.start, timeZone: timezone },
      end: input.end ? { dateTime: input.end, timeZone: timezone } : undefined,
    },
  });

  if (!response.data) {
    throw new Error("Google Calendar did not return an event payload.");
  }

  return toCalendarEvent(response.data);
}
