import { google } from "googleapis";
import { NextResponse } from "next/server";

import { getRequiredEnv } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const oauth2Client = new google.auth.OAuth2(
    getRequiredEnv("GOOGLE_CALENDAR_CLIENT_ID"),
    getRequiredEnv("GOOGLE_CALENDAR_CLIENT_SECRET"),
    getRequiredEnv("GOOGLE_CALENDAR_REDIRECT_URI"),
  );

  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/tasks",
    ],
  });

  return NextResponse.redirect(url);
}
