import { google } from "googleapis";

import { getRequiredEnv } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function renderHtml(content: string) {
  return new Response(
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Google Calendar Callback</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #030303;
        color: #f4f4f5;
        font-family: Arial, sans-serif;
      }
      main {
        width: min(720px, calc(100vw - 32px));
        border: 1px solid #27272a;
        background: rgba(9, 9, 11, 0.96);
        border-radius: 16px;
        padding: 24px;
      }
      h1 {
        margin: 0 0 12px;
        font-size: 24px;
      }
      p {
        color: #a1a1aa;
        line-height: 1.6;
      }
      code, pre {
        font-family: monospace;
        font-size: 14px;
      }
      pre {
        white-space: pre-wrap;
        word-break: break-word;
        background: #111111;
        border: 1px solid #27272a;
        border-radius: 12px;
        padding: 16px;
        overflow: auto;
      }
    </style>
  </head>
  <body>
    <main>${content}</main>
  </body>
</html>`,
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    },
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    return renderHtml(`
      <h1>Google returned an error</h1>
      <p>The OAuth flow came back with an error instead of an authorization code.</p>
      <pre>${error}</pre>
    `);
  }

  if (!code) {
    return renderHtml(`
      <h1>No authorization code found</h1>
      <p>This page only shows something useful after Google redirects here with a <code>?code=...</code> query string.</p>
      <p>Go back to the Google consent URL, approve access, and let it redirect here again.</p>
    `);
  }

  const redirectUri = getRequiredEnv("GOOGLE_CALENDAR_REDIRECT_URI");

  try {
    const oauth2Client = new google.auth.OAuth2(
      getRequiredEnv("GOOGLE_CALENDAR_CLIENT_ID"),
      getRequiredEnv("GOOGLE_CALENDAR_CLIENT_SECRET"),
      redirectUri,
    );

    const { tokens } = await oauth2Client.getToken(code);

    return renderHtml(`
      <h1>Authorization successful</h1>
      <p>Google redirected here with a valid code and the app exchanged it successfully.</p>
      <p>Use this refresh token in your <code>.env.local</code> as <code>GOOGLE_CALENDAR_REFRESH_TOKEN</code>. This consent flow now includes Google Calendar and Google Tasks access.</p>
      <pre>${tokens.refresh_token ?? "No refresh token was returned. Re-run consent with prompt=consent and access_type=offline."}</pre>
      <p>Authorization code used:</p>
      <pre>${code}</pre>
    `);
  } catch (exchangeError) {
    const message =
      exchangeError instanceof Error ? exchangeError.message : "Unknown error";

    return renderHtml(`
      <h1>Authorization code received</h1>
      <p>The callback received a code, but exchanging it for tokens failed.</p>
      <p>Code:</p>
      <pre>${code}</pre>
      <p>Exchange error:</p>
      <pre>${message}</pre>
    `);
  }
}
