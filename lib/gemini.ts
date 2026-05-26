import { GoogleGenerativeAI } from "@google/generative-ai";

import { getRequiredEnv } from "@/lib/env";
import type { ChatBrainResponse } from "@/lib/types";

const systemPrompt = `You are a personal AI assistant for a CS student and developer in India. You help manage college assignments, client work at a dev agency, job applications, and daily schedule.

You have access to these data sources:
- SQLite database with assignments and tasks
- GitHub repos via Coral CLI (run shell commands like: coral sql "SELECT...")
- Google Calendar for events

When the user says something, figure out the intent and respond with a JSON object in this exact format:
{
  "intent": "one of: add_assignment, mark_submitted, add_task, mark_task_done, query_github, query_calendar, query_assignments, query_tasks, general_chat",
  "action": {
    "type": "same as intent",
    "data": {}
  },
  "response": "your natural language response to show the user"
}

For add_assignment extract: subject, title, due_date (in YYYY-MM-DD format if mentioned)
For mark_submitted extract: subject, title or id
For add_task extract: type (client/personal/job), title, project, due_date
For query_github the data should have: sql query to run via Coral
For general_chat just respond naturally, no action needed.

Always respond ONLY with the JSON object. No extra text. No markdown backticks.`;

function createGeminiClient() {
  return new GoogleGenerativeAI(getRequiredEnv("GEMINI_API_KEY"));
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

export async function inferChatAction(message: string) {
  const client = createGeminiClient();
  const model = client.getGenerativeModel({ model: "gemini-2.0-flash" });
  const result = await model.generateContent([
    { text: systemPrompt },
    { text: message },
  ]);
  const rawText = result.response.text();

  return JSON.parse(extractJson(rawText)) as ChatBrainResponse;
}
