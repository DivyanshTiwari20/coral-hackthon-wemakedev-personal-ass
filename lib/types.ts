export type AssignmentStatus = "pending" | "submitted";
export type TaskType = "client" | "personal" | "job";
export type TaskStatus = "pending" | "done";
export type ChatRole = "user" | "assistant";

export type Assignment = {
  id: number;
  subject: string;
  title: string;
  due_date: string | null;
  status: AssignmentStatus;
  notes: string | null;
  created_at: string;
};

export type Task = {
  id: number;
  type: TaskType;
  title: string;
  project: string | null;
  due_date: string | null;
  status: TaskStatus;
  notes: string | null;
  created_at: string;
};

export type ChatHistoryMessage = {
  id: number;
  role: ChatRole;
  content: string;
  created_at: string;
  session_id?: number | null;
};

export type ChatSession = {
  id: number;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
  last_message: string | null;
};

export type CalendarEvent = {
  id: string;
  summary: string;
  description?: string | null;
  start: string | null;
  end: string | null;
  htmlLink?: string | null;
  source?: "google_calendar" | "google_task";
  status?: string | null;
};

export type CoralRow = Record<string, string | number | null>;

export type ChatIntent =
  | "add_assignment"
  | "mark_submitted"
  | "delete_assignment"
  | "add_task"
  | "mark_task_done"
  | "delete_task"
  | "query_github"
  | "query_calendar"
  | "create_calendar_event"
  | "query_assignments"
  | "query_tasks"
  | "general_chat";

export type ChatAction = {
  type: ChatIntent;
  data: Record<string, unknown>;
};

export type ChatBrainResponse = {
  intent: ChatIntent;
  action: ChatAction;
  response: string;
};
