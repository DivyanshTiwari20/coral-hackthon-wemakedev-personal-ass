import { google } from "googleapis";

import { getRequiredEnv } from "@/lib/env";
import type { CalendarEvent } from "@/lib/types";

function createCalendarClient() {
  const oauth2Client = new google.auth.OAuth2(
    getRequiredEnv("GOOGLE_CALENDAR_CLIENT_ID"),
    getRequiredEnv("GOOGLE_CALENDAR_CLIENT_SECRET"),
    getRequiredEnv("GOOGLE_CALENDAR_REDIRECT_URI"),
  );

  oauth2Client.setCredentials({
    refresh_token: getRequiredEnv("GOOGLE_CALENDAR_REFRESH_TOKEN"),
  });

  return google.calendar({ version: "v3", auth: oauth2Client });
}

export async function getCalendarEvents(date: string) {
  const calendar = createCalendarClient();
  const [year, month, day] = date.split("-").map(Number);
  const start = new Date(year, month - 1, day, 0, 0, 0, 0);
  const end = new Date(year, month - 1, day, 23, 59, 59, 999);

  const response = await calendar.events.list({
    calendarId: "primary",
    singleEvents: true,
    orderBy: "startTime",
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
  });

  return (response.data.items ?? []).map(
    (event): CalendarEvent => ({
      id: event.id ?? crypto.randomUUID(),
      summary: event.summary ?? "Untitled event",
      description: event.description ?? null,
      start: event.start?.dateTime ?? event.start?.date ?? null,
      end: event.end?.dateTime ?? event.end?.date ?? null,
      htmlLink: event.htmlLink ?? null,
    }),
  );
}
