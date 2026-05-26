import { NextResponse } from "next/server";

import {
  createAssignment,
  createTask,
  getRecentChatHistory,
  insertChatMessage,
  listAssignments,
  listTasks,
  markAssignmentSubmitted,
  markTaskDone,
} from "@/lib/db";
import { getTodayDateString } from "@/lib/dates";
import { getCalendarEvents } from "@/lib/calendar";
import { inferChatAction } from "@/lib/gemini";
import { runCoralQuery } from "@/lib/coral";
import type { ChatBrainResponse } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function fallbackBrainResponse(message: string): ChatBrainResponse {
  return {
    intent: "general_chat",
    action: {
      type: "general_chat",
      data: {},
    },
    response: `I heard: "${message}". I couldn't classify that cleanly, so I treated it as a normal chat message.`,
  };
}

async function executeAction(brainResponse: ChatBrainResponse) {
  const data = brainResponse.action?.data ?? {};

  switch (brainResponse.intent) {
    case "add_assignment": {
      const assignment = createAssignment({
        subject: String(data.subject ?? "General"),
        title: String(data.title ?? "Untitled assignment"),
        dueDate:
          typeof data.due_date === "string" ? data.due_date : null,
        notes: typeof data.notes === "string" ? data.notes : null,
      });

      return { assignment };
    }

    case "mark_submitted": {
      const assignment = markAssignmentSubmitted({
        id: typeof data.id === "number" ? data.id : undefined,
        title: typeof data.title === "string" ? data.title : undefined,
        subject: typeof data.subject === "string" ? data.subject : undefined,
      });

      return { assignment };
    }

    case "add_task": {
      const taskType =
        data.type === "client" || data.type === "personal" || data.type === "job"
          ? data.type
          : "personal";

      const task = createTask({
        type: taskType,
        title: String(data.title ?? "Untitled task"),
        project: typeof data.project === "string" ? data.project : null,
        dueDate: typeof data.due_date === "string" ? data.due_date : null,
        notes: typeof data.notes === "string" ? data.notes : null,
      });

      return { task };
    }

    case "mark_task_done": {
      const task = markTaskDone({
        id: typeof data.id === "number" ? data.id : undefined,
        title: typeof data.title === "string" ? data.title : undefined,
      });

      return { task };
    }

    case "query_github": {
      const sql =
        typeof data.sql === "string"
          ? data.sql
          : "SELECT repo_name, message, author_name, committed_at FROM github.commits ORDER BY committed_at DESC LIMIT 10";

      return { github: runCoralQuery(sql), sql };
    }

    case "query_calendar": {
      const date =
        typeof data.date === "string" && data.date.length > 0
          ? data.date
          : getTodayDateString();

      return { events: await getCalendarEvents(date), date };
    }

    case "query_assignments": {
      return {
        assignments: listAssignments({
          status: typeof data.status === "string" ? data.status : null,
          subject: typeof data.subject === "string" ? data.subject : null,
        }),
      };
    }

    case "query_tasks": {
      return {
        tasks: listTasks({
          status: typeof data.status === "string" ? data.status : null,
        }),
      };
    }

    case "general_chat":
    default:
      return {};
  }
}

function formatChatResponse(
  baseResponse: string,
  intent: ChatBrainResponse["intent"],
  data: Record<string, unknown>,
) {
  switch (intent) {
    case "query_assignments": {
      const assignments = (data.assignments as Array<Record<string, unknown>> | undefined) ?? [];
      if (assignments.length === 0) {
        return `${baseResponse}\n\nNo assignments matched that query.`;
      }

      const lines = assignments.map(
        (assignment) =>
          `- ${String(assignment.title)} (${String(assignment.subject)})${assignment.due_date ? `, due ${String(assignment.due_date)}` : ""}`,
      );
      return `${baseResponse}\n\n${lines.join("\n")}`;
    }

    case "query_tasks": {
      const tasks = (data.tasks as Array<Record<string, unknown>> | undefined) ?? [];
      if (tasks.length === 0) {
        return `${baseResponse}\n\nNo tasks matched that query.`;
      }

      const lines = tasks.map(
        (task) =>
          `- ${String(task.title)} (${String(task.type)})${task.project ? `, ${String(task.project)}` : ""}`,
      );
      return `${baseResponse}\n\n${lines.join("\n")}`;
    }

    case "query_calendar": {
      const events = (data.events as Array<Record<string, unknown>> | undefined) ?? [];
      if (events.length === 0) {
        return `${baseResponse}\n\nNo calendar events found for that date.`;
      }

      const lines = events.map(
        (event) =>
          `- ${String(event.summary)}${event.start ? ` at ${String(event.start)}` : ""}`,
      );
      return `${baseResponse}\n\n${lines.join("\n")}`;
    }

    case "query_github": {
      const github = (data.github as Array<Record<string, unknown>> | undefined) ?? [];
      if (github.length === 0) {
        return `${baseResponse}\n\nCoral returned no rows for that query.`;
      }

      const lines = github.map(
        (row) =>
          `- ${String(row.repo_name ?? "repo")}: ${String(row.message ?? "No commit message")}`,
      );
      return `${baseResponse}\n\n${lines.join("\n")}`;
    }

    case "mark_submitted":
      if (!data.assignment) {
        return `${baseResponse}\n\nI could not find a matching assignment to mark as submitted.`;
      }
      return baseResponse;

    case "mark_task_done":
      if (!data.task) {
        return `${baseResponse}\n\nI could not find a matching task to mark as done.`;
      }
      return baseResponse;

    default:
      return baseResponse;
  }
}

export async function GET() {
  return NextResponse.json({
    messages: getRecentChatHistory(),
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { message?: string };
    const message = body.message?.trim();

    if (!message) {
      return NextResponse.json(
        { error: "Message is required." },
        { status: 400 },
      );
    }

    let brainResponse: ChatBrainResponse;

    try {
      brainResponse = await inferChatAction(message);
    } catch (error) {
      console.error("Gemini inference failed", error);
      brainResponse = fallbackBrainResponse(message);
    }

    const data = await executeAction(brainResponse);
    const responseText = formatChatResponse(brainResponse.response, brainResponse.intent, data);

    insertChatMessage("user", message);
    insertChatMessage("assistant", responseText);

    return NextResponse.json({
      response: responseText,
      intent: brainResponse.intent,
      action: brainResponse.action,
      data,
    });
  } catch (error) {
    console.error("Chat route failed", error);

    return NextResponse.json(
      { error: "Failed to process chat request." },
      { status: 500 },
    );
  }
}
