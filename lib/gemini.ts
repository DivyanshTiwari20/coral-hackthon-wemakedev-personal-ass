import { GoogleGenerativeAI } from "@google/generative-ai";

import { getOptionalEnv, getRequiredEnv } from "@/lib/env";
import { getRecentChatHistory, listPendingAssignments, listPendingTasks } from "@/lib/db";
import { getTodayDateString } from "@/lib/dates";
import type { ChatBrainResponse } from "@/lib/types";

const systemPrompt = `You are a personal AI assistant for a CS student and developer in India. You help manage college assignments, client work at a dev agency, job applications, and daily schedule.

You have access to these data sources:
- SQLite database with assignments and tasks
- GitHub repos via Coral CLI (run shell commands like: coral sql "SELECT...").
  For query_github, always use:
  SELECT name, updated_at, pushed_at
  FROM github.user_repos
  ORDER BY updated_at DESC
  LIMIT 10
- Google Calendar for events
- Google Tasks for tasks shown inside Google Calendar

When the user says something, figure out the intent and respond with a JSON object in this exact format:
{
  "intent": "one of: add_assignment, mark_submitted, delete_assignment, add_task, mark_task_done, delete_task, query_github, query_calendar, create_calendar_event, query_assignments, query_tasks, general_chat",
  "action": {
    "type": "same as intent",
    "data": {}
  },
  "response": "your natural language response to show the user"
}

For add_assignment extract: subject, title, due_date (in YYYY-MM-DD format if mentioned)
For mark_submitted extract: subject, title or id. Use this when the user says an assignment is done, completed, submitted, finished, or says "add that I have done X assignment". If the user says they completed an assignment but it may not exist yet, still use mark_submitted with the best title.
For delete_assignment extract: title or all=true when the user wants to delete all assignments
For add_task extract: type (client/personal/job), title, project, due_date
Use add_task only for tasks inside this app. If the user says "calendar task", "task in Google Calendar", "add it to my calendar", or gives a date/time for something that should appear in Google Calendar, use create_calendar_event instead.
For mark_task_done extract: title or id
For delete_task extract: title or id
For query_github the data should have: sql query to run via Coral. Use this intent when the user asks about repos, recent work, last project worked on, or recent GitHub activity.
For query_calendar:
- Use scope "day" and date YYYY-MM-DD for today/specific day questions.
- Use scope "upcoming" and days 60 when the user asks for all calendar data, everything in calendar, upcoming events, or manually added calendar items.
Do not answer "yes I can see it" unless you are returning query_calendar. General chat should say you can check connected Google Calendar/Tasks when asked, not that you already saw anything.
If the user says "can't see", "show it", "where is it", or similar after asking for calendar/tasks/assignments, infer the missing context from recent chat and repeat the relevant query instead of apologizing generally.
If one message asks for calendar data and also asks to add or update an assignment, prefer the main requested action in JSON and do not invent a calendar access error in the response. The server may split the message into multiple actions.
For create_calendar_event extract:
- summary (required)
- date (YYYY-MM-DD) if start/end are not full ISO strings
- start (ISO 8601 date-time string) OR start_time ("HH:MM") along with date
- end (ISO 8601 date-time string) OR end_time ("HH:MM") along with date (if missing, the server will default to 60 minutes after start)
- description (optional)
- location (optional)
- timezone (optional; default "Asia/Kolkata")
For general_chat just respond naturally, no action needed.

Always respond ONLY with the JSON object. No extra text. No markdown backticks.`;

function createGeminiClient() {
  return new GoogleGenerativeAI(getRequiredEnv("GEMINI_API_KEY").trim());
}

function extractJson(text: string) {
  const trimmed = text.trim();
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1) {
    throw new Error("Gemini response did not include JSON");
  }

  return trimmed.slice(firstBrace, lastBrace + 1);
}

export async function inferChatAction(message: string, sessionId?: number | null) {
  const client = createGeminiClient();
  const modelName = getOptionalEnv("GEMINI_MODEL") ?? "gemini-2.5-flash-lite";
  const model = client.getGenerativeModel({
    model: modelName,
    systemInstruction: systemPrompt,
    generationConfig: {
      responseMimeType: "application/json",
    },
  });
  const today = getTodayDateString();
  const history = getRecentChatHistory(24, sessionId)
    .map((entry) => `${entry.role.toUpperCase()}: ${entry.content}`)
    .join("\n");
  const pendingAssignments = listPendingAssignments().slice(0, 8);
  const pendingTasks = listPendingTasks().slice(0, 8);

  const prompt = `Today is ${today}.

Recent chat (oldest to newest):
${history || "(no prior messages)"}

Pending assignments snapshot (top ${pendingAssignments.length}):
${pendingAssignments.map((row) => `- ${row.title} (subject: ${row.subject}, due: ${row.due_date ?? "n/a"})`).join("\n") || "(none)"}

Pending tasks snapshot (top ${pendingTasks.length}):
${pendingTasks.map((row) => `- ${row.title} (type: ${row.type}, due: ${row.due_date ?? "n/a"})`).join("\n") || "(none)"}

User message:
${message}`;

  const result = await model.generateContent(prompt);
  const rawText = result.response.text();

  return JSON.parse(extractJson(rawText)) as ChatBrainResponse;
}
