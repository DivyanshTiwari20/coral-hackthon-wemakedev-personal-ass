import { NextResponse } from "next/server";

import {
  createAssignment,
  createChatSession,
  createTask,
  deleteAssignment,
  deleteTask,
  getChatSession,
  getRecentChatHistory,
  insertChatMessage,
  listChatSessions,
  listAssignments,
  listTasks,
  markAssignmentSubmitted,
  markTaskDone,
} from "@/lib/db";
import { getTodayDateString } from "@/lib/dates";
import { createCalendarEvent, getCalendarEvents, getUpcomingCalendarItems } from "@/lib/calendar";
import { inferChatAction } from "@/lib/gemini";
import { runCoralQuery } from "@/lib/coral";
import type { ChatBrainResponse } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const assignmentWordPattern =
  /\b(?:assignment|assignments|assment|assments|assisment|assisments|assigment|assigments|assessment|assessments)\b/i;
const submittedWordPattern =
  /\b(?:submitted|submit|submited|turned in|handed in|completed|finished)\b/i;
const addWordPattern = /\b(?:add|create|new|track|save|record)\b/i;
const deleteWordPattern = /\b(?:delete|remove)\b/i;
const scheduleWordPattern = /\b(?:schedule|book|set up|add)\b/i;
const meetingWordPattern = /\b(?:meeting|call|interview|appointment|session|event)\b/i;
const allCalendarPattern = /\b(?:all|everything|full|entire|upcoming|next|calendar data)\b/i;
const politeGreetingPattern =
  /^(hi|hello|hey|yo|namaste|good\s+(morning|afternoon|evening))[\s!.]*$/i;
const calendarIntents = new Set<ChatBrainResponse["intent"]>([
  "query_calendar",
  "create_calendar_event",
]);
const weekdayIndexes: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

function hasAssignmentWord(value: string) {
  return assignmentWordPattern.test(value);
}

function cleanFallbackTitle(message: string) {
  return message
    .replace(/\b(?:please|just|also|connected|connect it|it is|and|that|have|has|done|mark|as|a|an)\b/gi, "")
    .replace(/add\s+(?:it\s+)?(?:in|to)\s+(?:the\s+)?app/gi, "")
    .replace(/\bi\s+(?:have\s+)?(?:submitted|submited|submit|turned in|handed in|completed|finished)\b/gi, "")
    .replace(/\b(?:i|my|an?|the|this|that)\b/gi, "")
    .replace(assignmentWordPattern, "")
    .replace(submittedWordPattern, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractAssignmentTitle(message: string) {
  const quotedTitleMatch = message.match(/"([^"]+)"/);

  if (quotedTitleMatch?.[1]) {
    return quotedTitleMatch[1].trim();
  }

  const subjectBeforeAssignment = message.match(
    /\b([A-Za-z][A-Za-z0-9 &-]{1,40})\s+(?:assignment|assment|assisment|assigment|assessment)\b/i,
  );

  if (subjectBeforeAssignment?.[1]) {
    const subjectWords = subjectBeforeAssignment[1]
      .split(/[^A-Za-z0-9]+/)
      .filter(
        (word) =>
          word.length > 1 &&
          ![
            "add",
            "also",
            "and",
            "done",
            "have",
            "mark",
            "my",
            "that",
            "the",
            "this",
          ].includes(word.toLowerCase()),
      );
    const subject = subjectWords.slice(-3).join(" ").trim();

    if (subject) {
      return `${subject} assignment`;
    }
  }

  return cleanFallbackTitle(message);
}

function cleanDeleteTitle(message: string) {
  return message
    .replace(deleteWordPattern, "")
    .replace(/\ball\b/gi, "")
    .replace(assignmentWordPattern, "")
    .replace(/\btasks?\b/gi, "")
    .replace(/\b(?:my|the|this|that)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeForMatch(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function getMatchTokens(value: unknown) {
  return normalizeForMatch(value)
    .split(/[^a-z0-9]+/i)
    .filter(
      (token) =>
        token.length > 2 &&
        !["assignment", "assignments", "task", "tasks", "submitted", "done"].includes(
          token,
        ),
    );
}

function findFuzzyTitleMatch<T extends { id: number; title: string }>(
  rows: T[],
  title: unknown,
) {
  const normalizedTitle = normalizeForMatch(title);
  const titleTokens = getMatchTokens(title);

  if (!normalizedTitle) {
    return undefined;
  }

  return rows.find((row) => {
    const rowTitle = normalizeForMatch(row.title);
    return (
      rowTitle === normalizedTitle ||
      rowTitle.includes(normalizedTitle) ||
      normalizedTitle.includes(rowTitle) ||
      titleTokens.some((token) => rowTitle.includes(token))
    );
  });
}

function formatDateString(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function offsetDateString(baseDate: string, days: number) {
  const [year, month, day] = baseDate.split("-").map(Number);
  return formatDateString(new Date(year, month - 1, day + days));
}

function parseFallbackDate(message: string) {
  const explicitDate = message.match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1];

  if (explicitDate) {
    return explicitDate;
  }

  const today = getTodayDateString();
  const normalized = message.toLowerCase();

  if (/\btoday\b/.test(normalized)) {
    return today;
  }

  if (/\btomorrow\b/.test(normalized)) {
    return offsetDateString(today, 1);
  }

  const weekdayMatch = normalized.match(
    /\b(next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/,
  );

  if (!weekdayMatch) {
    return undefined;
  }

  const [year, month, day] = today.split("-").map(Number);
  const todayDate = new Date(year, month - 1, day);
  const targetWeekday = weekdayIndexes[weekdayMatch[2]];
  const daysUntilRaw = (targetWeekday - todayDate.getDay() + 7) % 7;
  const daysUntil = weekdayMatch[1] ? daysUntilRaw || 7 : daysUntilRaw;

  return offsetDateString(today, daysUntil);
}

function parseFallbackTime(message: string) {
  const twentyFourHourMatch = message.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);

  if (twentyFourHourMatch) {
    return `${twentyFourHourMatch[1].padStart(2, "0")}:${twentyFourHourMatch[2]}`;
  }

  const meridiemMatch = message.match(/\b(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*(am|pm)\b/i);

  if (!meridiemMatch) {
    return undefined;
  }

  const meridiem = meridiemMatch[3].toLowerCase();
  let hour = Number(meridiemMatch[1]);

  if (meridiem === "pm" && hour !== 12) {
    hour += 12;
  }

  if (meridiem === "am" && hour === 12) {
    hour = 0;
  }

  return `${`${hour}`.padStart(2, "0")}:${meridiemMatch[2] ?? "00"}`;
}

function getActionErrorMessage(intent: ChatBrainResponse["intent"]) {
  if (calendarIntents.has(intent)) {
    return intent === "create_calendar_event"
      ? "I could not add that to Google Calendar because the calendar connection is not ready. Connect Google Calendar from this chat page, then try scheduling it again."
      : "I could not read Google Calendar because the calendar connection is not ready. Connect Google Calendar from this chat page, then ask again.";
  }

  return "I understood your message, but something went wrong while applying the action. Please try again.";
}

function getLoggableErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function looksLikeCalendarQuery(message: string) {
  const normalized = message.toLowerCase();

  return (
    normalized.includes("calendar") ||
    normalized.includes("events") ||
    /\bwhat\s+do\s+i\s+have\s+(?:today|tomorrow)\b/i.test(message) ||
    /\bwhat(?:'s| is)\s+on\s+(?:my\s+)?(?:calendar\s+)?(?:today|tomorrow)\b/i.test(message)
  );
}

function looksLikeAssignmentMutation(message: string) {
  const normalized = message.toLowerCase();

  return hasAssignmentWord(normalized) && (addWordPattern.test(normalized) || submittedWordPattern.test(normalized));
}

function buildCalendarQueryResponse(message: string): ChatBrainResponse {
  const normalized = message.toLowerCase();
  const date = parseFallbackDate(message) ?? getTodayDateString();

  return {
    intent: "query_calendar",
    action: {
      type: "query_calendar",
      data: {
        date: allCalendarPattern.test(normalized) ? undefined : date,
        scope: allCalendarPattern.test(normalized) ? "upcoming" : "day",
        days: allCalendarPattern.test(normalized) ? 60 : undefined,
      },
    },
    response: "I will check your calendar.",
  };
}

function buildAssignmentMutationResponse(message: string): ChatBrainResponse {
  const normalized = message.toLowerCase();
  const subjectMatch = message.match(/\bfor\s+([A-Za-z][A-Za-z0-9 &-]{1,40})/i);
  const extractedTitle = extractAssignmentTitle(message);

  if (submittedWordPattern.test(normalized)) {
    return {
      intent: "mark_submitted",
      action: {
        type: "mark_submitted",
        data: {
          title: extractedTitle || undefined,
          subject: subjectMatch?.[1]?.trim(),
          due_date: parseFallbackDate(message),
        },
      },
      response: "I will update that assignment.",
    };
  }

  return {
    intent: "add_assignment",
    action: {
      type: "add_assignment",
      data: {
        title: extractedTitle || "Untitled assignment",
        subject: subjectMatch?.[1]?.trim() ?? "General",
        due_date: parseFallbackDate(message),
      },
    },
    response: "I will add that assignment.",
  };
}

function formatItemDateTime(value: string | null) {
  if (!value) {
    return "no time";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value.length >= 16 ? value.slice(0, 16).replace("T", " ") : value;
  }

  return date.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatAssignmentList(assignments: Array<Record<string, unknown>>) {
  if (assignments.length === 0) {
    return "I checked your assignments and did not find any matching items.";
  }

  return [
    `I found ${assignments.length} assignment${assignments.length === 1 ? "" : "s"}:`,
    ...assignments.map((assignment) => {
      const dueDate = assignment.due_date ? `, due ${String(assignment.due_date)}` : "";
      return `- ${String(assignment.title)} (${String(assignment.subject ?? "General")}${dueDate})`;
    }),
  ].join("\n");
}

function formatTaskList(tasks: Array<Record<string, unknown>>) {
  if (tasks.length === 0) {
    return "I checked your tasks and did not find any matching items.";
  }

  return [
    `I found ${tasks.length} task${tasks.length === 1 ? "" : "s"}:`,
    ...tasks.map((task) => {
      const project = task.project ? `, ${String(task.project)}` : "";
      return `- ${String(task.title)} (${String(task.type ?? "personal")}${project})`;
    }),
  ].join("\n");
}

function formatCalendarList(events: Array<Record<string, unknown>>, dateLabel: string) {
  if (events.length === 0) {
    return `I checked Google Calendar and Google Tasks, but did not find anything for ${dateLabel}.`;
  }

  return [
    `I found ${events.length} Google Calendar/Task item${events.length === 1 ? "" : "s"} for ${dateLabel}:`,
    ...events.map((event) => {
      const source = event.source === "google_task" ? "task" : "event";
      return `- ${String(event.summary)} (${source}, ${formatItemDateTime(String(event.start ?? "") || null)})`;
    }),
  ].join("\n");
}

function formatGithubList(rows: Array<Record<string, unknown>>) {
  if (rows.length === 0) {
    return "I checked GitHub through Coral, but it did not return any rows.";
  }

  return [
    `I found ${rows.length} recent GitHub repos:`,
    ...rows.map((row) => `- ${String(row.name ?? "Unknown repo")} (${String(row.pushed_at ?? row.updated_at ?? "unknown date")})`),
  ].join("\n");
}

function formatActionResponse(
  brainResponse: ChatBrainResponse,
  data: Record<string, unknown>,
) {
  switch (brainResponse.intent) {
    case "add_assignment": {
      const assignment = data.assignment as Record<string, unknown> | undefined;

      if (!assignment) {
        return "I could not add that assignment.";
      }

      const dueDate = assignment.due_date ? ` due ${String(assignment.due_date)}` : "";
      return `Added ${String(assignment.title)}${dueDate}.`;
    }

    case "mark_submitted": {
      const assignment = data.assignment as Record<string, unknown> | undefined;

      if (!assignment) {
        return brainResponse.response;
      }

      return data.created
        ? `Added ${String(assignment.title)} and marked it submitted.`
        : `Marked ${String(assignment.title)} as submitted.`;
    }

    case "query_calendar":
      return formatCalendarList(
        (data.events as Array<Record<string, unknown>> | undefined) ?? [],
        String(data.label ?? data.date ?? "the selected range"),
      );

    case "query_assignments":
      return formatAssignmentList(
        (data.assignments as Array<Record<string, unknown>> | undefined) ?? [],
      );

    case "query_tasks":
      return formatTaskList((data.tasks as Array<Record<string, unknown>> | undefined) ?? []);

    case "query_github":
      return formatGithubList((data.github as Array<Record<string, unknown>> | undefined) ?? []);

    default:
      return brainResponse.response;
  }
}

function fallbackBrainResponse(message: string): ChatBrainResponse {
  const normalized = message.toLowerCase();
  const quotedTitleMatch = message.match(/"([^"]+)"/);
  const fallbackDate = parseFallbackDate(message);
  const fallbackTime = parseFallbackTime(message);
  const subjectMatch = message.match(/\bfor\s+([A-Za-z][A-Za-z0-9 &-]{1,40})/i);

  if (
    normalized.includes("github") ||
    normalized.includes("commit") ||
    normalized.includes("repo")
  ) {
    return {
      intent: "query_github",
      action: {
        type: "query_github",
        data: {
          sql: `SELECT name, updated_at, pushed_at 
                FROM github.user_repos 
                ORDER BY updated_at DESC 
                LIMIT 10`,
        },
      },
      response: "Here is your recent GitHub work.",
    };
  }

  const looksLikeCreateCalendarEvent =
    (scheduleWordPattern.test(normalized) || meetingWordPattern.test(normalized)) &&
    (Boolean(fallbackDate) || Boolean(fallbackTime) || /\btomorrow\b|\btoday\b|\bnext\b/i.test(message));

  if (looksLikeCreateCalendarEvent) {
    const extractedTitle =
      quotedTitleMatch?.[1] ??
      message
        .replace(scheduleWordPattern, "")
        .replace(/\b(20\d{2}-\d{2}-\d{2})\b/g, "")
        .replace(/\b([01]?\d|2[0-3]):([0-5]\d)\b/g, "")
        .replace(/\b(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*(am|pm)\b/gi, "")
        .replace(/\b(on|at|tomorrow|today|next)\b/gi, "")
        .replace(/\s+/g, " ")
        .trim();

    return {
      intent: "create_calendar_event",
      action: {
        type: "create_calendar_event",
        data: {
          summary: extractedTitle || "New event",
          date: fallbackDate,
          start_time: fallbackTime,
        },
      },
      response: "Okay, I will add that to your Google Calendar.",
    };
  }

  if (
    normalized.includes("calendar") ||
    normalized.includes("events") ||
    normalized.includes("what do i have today")
  ) {
    return {
      intent: "query_calendar",
      action: {
        type: "query_calendar",
        data: {
          date: allCalendarPattern.test(normalized) ? undefined : getTodayDateString(),
          scope: allCalendarPattern.test(normalized) ? "upcoming" : "day",
          days: allCalendarPattern.test(normalized) ? 60 : undefined,
        },
      },
      response: allCalendarPattern.test(normalized)
        ? "I will check your upcoming Google Calendar events and Google Tasks."
        : "I will check what is on your calendar today.",
    };
  }

  if (deleteWordPattern.test(normalized) && hasAssignmentWord(normalized)) {
    const shouldDeleteAll = /\bdelete\s+all\s+assignments?\b/i.test(message);
    const extractedTitle =
      quotedTitleMatch?.[1] ?? (shouldDeleteAll ? "" : cleanDeleteTitle(message));

    return {
      intent: "delete_assignment",
      action: {
        type: "delete_assignment",
        data: {
          all: shouldDeleteAll,
          title: extractedTitle || undefined,
          subject: subjectMatch?.[1]?.trim(),
        },
      },
      response: shouldDeleteAll
        ? "I deleted all assignments."
        : extractedTitle
          ? `I deleted "${extractedTitle}" if I found a matching assignment.`
          : "Tell me which assignment to delete.",
    };
  }

  if (deleteWordPattern.test(normalized) && /\btasks?\b/i.test(normalized)) {
    const extractedTitle = quotedTitleMatch?.[1] ?? cleanDeleteTitle(message);

    return {
      intent: "delete_task",
      action: {
        type: "delete_task",
        data: {
          title: extractedTitle || undefined,
        },
      },
      response: extractedTitle
        ? `I deleted "${extractedTitle}" if I found a matching task.`
        : "Tell me which task to delete.",
    };
  }

  if (
    hasAssignmentWord(normalized) &&
    submittedWordPattern.test(normalized)
  ) {
    const extractedTitle = extractAssignmentTitle(message);

    return {
      intent: "mark_submitted",
      action: {
        type: "mark_submitted",
        data: {
          title: extractedTitle || undefined,
          subject: subjectMatch?.[1]?.trim(),
        },
      },
      response: extractedTitle
        ? `I marked "${extractedTitle}" as submitted if I found a matching assignment.`
        : "Tell me which assignment you submitted, and I will mark it done.",
    };
  }

  if (
    hasAssignmentWord(normalized) &&
    addWordPattern.test(normalized)
  ) {
    const extractedTitle =
      extractAssignmentTitle(message) ||
      message
        .replace(addWordPattern, "")
        .replace(assignmentWordPattern, "")
        .replace(/\bfor\b.*/i, "")
        .replace(/\s+/g, " ")
        .trim();

    return {
      intent: "add_assignment",
      action: {
        type: "add_assignment",
        data: {
          title: extractedTitle || "Untitled assignment",
          subject: subjectMatch?.[1]?.trim() ?? "General",
          due_date: fallbackDate,
        },
      },
      response: "I added that assignment to your list.",
    };
  }

  if (hasAssignmentWord(normalized)) {
    return {
      intent: "query_assignments",
      action: {
        type: "query_assignments",
        data: {
          status: normalized.includes("submitted")
            ? "submitted"
            : normalized.includes("pending")
              ? "pending"
              : undefined,
          subject: subjectMatch?.[1]?.trim(),
        },
      },
      response: "Here are the assignments that match your request.",
    };
  }

  if (
    normalized.includes("task") &&
    (normalized.includes("done") ||
      normalized.includes("completed") ||
      normalized.includes("complete"))
  ) {
    const extractedTitle =
      quotedTitleMatch?.[1] ??
      message
        .replace(/mark/i, "")
        .replace(/task/i, "")
        .replace(/done|completed|complete/gi, "")
        .trim();

    return {
      intent: "mark_task_done",
      action: {
        type: "mark_task_done",
        data: {
          title: extractedTitle || undefined,
        },
      },
      response: extractedTitle
        ? `I marked "${extractedTitle}" as done if I found a matching task.`
        : "I tried to mark a matching task as done.",
    };
  }

  if (
    normalized.includes("task") ||
    normalized.includes("client work") ||
    normalized.includes("job application")
  ) {
    return {
      intent: "query_tasks",
      action: {
        type: "query_tasks",
        data: {
          status: normalized.includes("pending") ? "pending" : undefined,
        },
      },
      response: "Here are the tasks that match your request.",
    };
  }

  return {
    intent: "general_chat",
    action: {
      type: "general_chat",
      data: {},
    },
    response: politeGreetingPattern.test(message)
      ? "Hi! I can help you track assignments, tasks, GitHub work, and your calendar."
      : 'I can help with assignments, tasks, GitHub work, and calendar questions. Try saying something like "add my DBMS assignment due 2026-05-30" or "show pending assignments."',
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
      const assignments = listAssignments();
      const titleHint =
        typeof data.title === "string" && data.title.trim().length > 0
          ? data.title.trim()
          : typeof data.subject === "string" && data.subject.trim().length > 0
            ? `${data.subject.trim()} assignment`
            : undefined;
      const assignment =
        typeof data.id === "number"
          ? assignments.find((row) => row.id === data.id)
          : findFuzzyTitleMatch(assignments, titleHint);

      if (!assignment) {
        const title = titleHint ?? null;

        if (!title) {
          brainResponse.response = "I could not tell which assignment to mark as submitted.";
          return { assignment: null };
        }

        const createdAssignment = createAssignment({
          subject:
            typeof data.subject === "string" && data.subject.trim().length > 0
              ? data.subject.trim()
              : "General",
          title,
          dueDate: typeof data.due_date === "string" ? data.due_date : null,
          notes: "Added from chat as already completed.",
        });
        const submittedAssignment = markAssignmentSubmitted({ id: createdAssignment.id });
        brainResponse.response = `I could not find an existing match, so I added ${createdAssignment.title} and marked it as submitted.`;

        return { assignment: submittedAssignment ?? createdAssignment, created: true };
      }

      const updatedAssignment = markAssignmentSubmitted({ id: assignment.id });

      if (updatedAssignment) {
        brainResponse.response = `I marked ${updatedAssignment.title} as submitted.`;
      }

      return { assignment: updatedAssignment };
    }

    case "delete_assignment": {
      if (data.all === true) {
        const assignments = listAssignments();
        assignments.forEach((assignment) => deleteAssignment(assignment.id));
        brainResponse.response = `I deleted ${assignments.length} assignment${assignments.length === 1 ? "" : "s"}.`;

        return { assignments };
      }

      const assignments = listAssignments();
      const assignment =
        typeof data.id === "number"
          ? assignments.find((row) => row.id === data.id)
          : findFuzzyTitleMatch(assignments, data.title);

      if (!assignment) {
        brainResponse.response = "I could not find a matching assignment to delete.";
        return { assignment: null };
      }

      deleteAssignment(assignment.id);
      brainResponse.response = `I deleted ${assignment.title}.`;

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
      const tasks = listTasks();
      const task =
        typeof data.id === "number"
          ? tasks.find((row) => row.id === data.id)
          : findFuzzyTitleMatch(tasks, data.title);

      if (!task) {
        brainResponse.response = "I could not find a matching task to mark as done.";
        return { task: null };
      }

      const updatedTask = markTaskDone({ id: task.id });

      if (updatedTask) {
        brainResponse.response = `I marked ${updatedTask.title} as done.`;
      }

      return { task: updatedTask };
    }

    case "delete_task": {
      const tasks = listTasks();
      const task =
        typeof data.id === "number"
          ? tasks.find((row) => row.id === data.id)
          : findFuzzyTitleMatch(tasks, data.title);

      if (!task) {
        brainResponse.response = "I could not find a matching task to delete.";
        return { task: null };
      }

      deleteTask(task.id);
      brainResponse.response = `I deleted ${task.title}.`;

      return { task };
    }

    case "query_github": {
      const sql =
        typeof data.sql === "string"
          ? data.sql
          : `SELECT name, updated_at, pushed_at 
             FROM github.user_repos 
             ORDER BY updated_at DESC 
             LIMIT 10`;

      return { github: runCoralQuery(sql) };
    }

    case "query_calendar": {
      const scope = typeof data.scope === "string" ? data.scope : "day";

      if (scope === "upcoming" || scope === "all") {
        const days =
          typeof data.days === "number" && data.days > 0
            ? Math.min(data.days, 90)
            : 60;

        return {
          events: await getUpcomingCalendarItems(days),
          label: `the next ${days} days`,
          scope,
        };
      }

      const date =
        typeof data.date === "string" && data.date.length > 0
          ? data.date
          : getTodayDateString();

      return { events: await getCalendarEvents(date), date, label: date, scope: "day" };
    }

    case "create_calendar_event": {
      const timezone =
        typeof data.timezone === "string" && data.timezone.trim().length > 0
          ? data.timezone.trim()
          : "Asia/Kolkata";

      const summary =
        typeof data.summary === "string" && data.summary.trim().length > 0
          ? data.summary.trim()
          : "New event";

      const description = typeof data.description === "string" ? data.description : null;
      const location = typeof data.location === "string" ? data.location : null;

      const date =
        typeof data.date === "string" && data.date.length > 0
          ? data.date
          : getTodayDateString();

      const rawStart =
        typeof data.start === "string" && data.start.trim().length > 0
          ? data.start.trim()
          : null;
      const rawEnd =
        typeof data.end === "string" && data.end.trim().length > 0
          ? data.end.trim()
          : null;

      const startTime =
        typeof data.start_time === "string" && /^\d{2}:\d{2}$/.test(data.start_time)
          ? data.start_time
          : null;
      const endTime =
        typeof data.end_time === "string" && /^\d{2}:\d{2}$/.test(data.end_time)
          ? data.end_time
          : null;

      const istOffset = "+05:30";
      const start =
        rawStart ??
        (startTime ? `${date}T${startTime}:00${istOffset}` : `${date}T09:00:00${istOffset}`);

      const end =
        rawEnd ??
        (endTime ? `${date}T${endTime}:00${istOffset}` : null);

      const computedEnd =
        end ??
        new Date(new Date(start).getTime() + 60 * 60 * 1000).toISOString();

      const event = await createCalendarEvent({
        summary,
        description,
        location,
        timezone,
        start,
        end: computedEnd,
      });

      brainResponse.response = event.htmlLink
        ? `Scheduled: ${event.summary}\n${event.htmlLink}`
        : `Scheduled: ${event.summary}`;

      return { event };
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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const requestedSessionId = Number(searchParams.get("sessionId"));
  const sessions = listChatSessions();
  const activeSessionId =
    Number.isFinite(requestedSessionId) && getChatSession(requestedSessionId)
      ? requestedSessionId
      : sessions[0]?.id ?? null;

  return NextResponse.json({
    activeSessionId,
    sessions,
    messages: activeSessionId ? getRecentChatHistory(80, activeSessionId) : [],
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { message?: string; sessionId?: number | null };
    const message = body.message?.trim();

    if (!message) {
      return NextResponse.json(
        { error: "Message is required." },
        { status: 400 },
      );
    }

    const session =
      typeof body.sessionId === "number" && getChatSession(body.sessionId)
        ? getChatSession(body.sessionId)
        : createChatSession();
    const sessionId = session?.id ?? createChatSession().id;

    let brainResponse: ChatBrainResponse;

    try {
      brainResponse = await inferChatAction(message, sessionId);
    } catch (error) {
      console.error("Gemini inference failed", error);
      brainResponse = fallbackBrainResponse(message);
    }

    insertChatMessage("user", message, sessionId);
    const brainResponses =
      looksLikeCalendarQuery(message) && looksLikeAssignmentMutation(message)
        ? [buildCalendarQueryResponse(message), buildAssignmentMutationResponse(message)]
        : [brainResponse];
    const actionResults: Array<{
      intent: ChatBrainResponse["intent"];
      data: unknown;
      message: string;
    }> = [];

    for (const response of brainResponses) {
      try {
        const actionData = await executeAction(response);
        const responseText = formatActionResponse(
          response,
          actionData as Record<string, unknown>,
        );
        actionResults.push({
          intent: response.intent,
          data: actionData,
          message: responseText,
        });
      } catch (actionError) {
        console.error("Chat action failed", actionError);
        actionResults.push({
          intent: response.intent,
          data: {
            error: "action_failed",
            details: getLoggableErrorMessage(actionError),
          },
          message: getActionErrorMessage(response.intent),
        });
      }
    }

    const responseMessage = actionResults.map((result) => result.message).join("\n\n");

    insertChatMessage("assistant", responseMessage, sessionId);

    return NextResponse.json({
      message: responseMessage,
      data: actionResults.length === 1 ? actionResults[0].data : { actions: actionResults },
      intent: actionResults.length === 1 ? actionResults[0].intent : "general_chat",
      sessionId,
      sessions: listChatSessions(),
    });
  } catch (error) {
    console.error("Chat route failed", error);

    return NextResponse.json(
      { error: "Failed to process chat request." },
      { status: 500 },
    );
  }
}
