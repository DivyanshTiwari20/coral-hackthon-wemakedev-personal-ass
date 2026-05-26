import readline from "node:readline/promises";
import fs from "node:fs";
import path from "node:path";
import { stdin as input, stdout as output } from "node:process";
import { google } from "googleapis";

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(path.join(process.cwd(), ".env.local"));

const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
const redirectUri =
  process.argv[2] ||
  process.env.GOOGLE_CALENDAR_REDIRECT_URI ||
  "http://localhost:3000/api/auth/callback";

if (!clientId || !clientSecret) {
  console.error(
    "Missing GOOGLE_CALENDAR_CLIENT_ID or GOOGLE_CALENDAR_CLIENT_SECRET in your environment.",
  );
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  scope: ["https://www.googleapis.com/auth/calendar.readonly"],
  prompt: "consent",
});

console.log("Open this URL in your browser:");
console.log(authUrl);
console.log("");
console.log(`Using redirect URI: ${redirectUri}`);
console.log(
  "After approving access, copy the `code` query parameter from the redirect URL and paste it below.",
);
console.log("");

const rl = readline.createInterface({ input, output });
const code = (await rl.question("Authorization code: ")).trim();
rl.close();

if (!code) {
  console.error("No authorization code provided.");
  process.exit(1);
}

const { tokens } = await oauth2Client.getToken(code);

if (!tokens.refresh_token) {
  console.error(
    "No refresh token was returned. Re-run the script and make sure the consent screen shows again.",
  );
  process.exit(1);
}

console.log("");
console.log("GOOGLE_CALENDAR_REFRESH_TOKEN=");
console.log(tokens.refresh_token);
