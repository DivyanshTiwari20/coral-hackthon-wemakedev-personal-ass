import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

import type {
  Assignment,
  AssignmentStatus,
  ChatHistoryMessage,
  ChatRole,
  Task,
  TaskType,
} from "@/lib/types";

const dataDirectory = path.join(process.cwd(), "data");
const databasePath = path.join(dataDirectory, "amaze.sqlite");

let database: Database.Database | null = null;

function initializeDatabase(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject TEXT NOT NULL,
      title TEXT NOT NULL,
      due_date TEXT,
      status TEXT DEFAULT 'pending',
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      project TEXT,
      due_date TEXT,
      status TEXT DEFAULT 'pending',
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS chat_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
}

export function getDb() {
  if (database) {
    return database;
  }

  fs.mkdirSync(dataDirectory, { recursive: true });
  database = new Database(databasePath);
  initializeDatabase(database);

  return database;
}

export function listAssignments(filters?: {
  status?: string | null;
  subject?: string | null;
}) {
  const db = getDb();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters?.status) {
    conditions.push("status = ?");
    params.push(filters.status);
  }

  if (filters?.subject) {
    conditions.push("LOWER(subject) LIKE LOWER(?)");
    params.push(`%${filters.subject}%`);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  return db
    .prepare(
      `SELECT * FROM assignments ${whereClause} ORDER BY
        CASE WHEN due_date IS NULL THEN 1 ELSE 0 END,
        due_date ASC,
        created_at DESC`,
    )
    .all(...params) as Assignment[];
}

export function listPendingAssignments() {
  return listAssignments({ status: "pending" });
}

export function createAssignment(input: {
  subject: string;
  title: string;
  dueDate?: string | null;
  notes?: string | null;
}) {
  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO assignments (subject, title, due_date, notes)
       VALUES (?, ?, ?, ?)`,
    )
    .run(input.subject, input.title, input.dueDate ?? null, input.notes ?? null);

  return db
    .prepare("SELECT * FROM assignments WHERE id = ?")
    .get(result.lastInsertRowid) as Assignment;
}

export function updateAssignmentStatus(id: number, status: AssignmentStatus) {
  const db = getDb();
  db.prepare("UPDATE assignments SET status = ? WHERE id = ?").run(status, id);

  return db
    .prepare("SELECT * FROM assignments WHERE id = ?")
    .get(id) as Assignment | undefined;
}

export function markAssignmentSubmitted(filters: {
  id?: number;
  title?: string;
  subject?: string;
}) {
  const db = getDb();

  if (filters.id) {
    return updateAssignmentStatus(filters.id, "submitted");
  }

  const clauses: string[] = [];
  const params: unknown[] = [];

  if (filters.title) {
    clauses.push("LOWER(title) LIKE LOWER(?)");
    params.push(`%${filters.title}%`);
  }

  if (filters.subject) {
    clauses.push("LOWER(subject) LIKE LOWER(?)");
    params.push(`%${filters.subject}%`);
  }

  if (clauses.length === 0) {
    return undefined;
  }

  const assignment = db
    .prepare(
      `SELECT * FROM assignments
       WHERE ${clauses.join(" AND ")}
       ORDER BY created_at DESC
       LIMIT 1`,
    )
    .get(...params) as Assignment | undefined;

  if (!assignment) {
    return undefined;
  }

  return updateAssignmentStatus(assignment.id, "submitted");
}

export function listTasks(filters?: { status?: string | null }) {
  const db = getDb();
  if (filters?.status) {
    return db
      .prepare("SELECT * FROM tasks WHERE status = ? ORDER BY created_at DESC")
      .all(filters.status) as Task[];
  }

  return db
    .prepare("SELECT * FROM tasks ORDER BY created_at DESC")
    .all() as Task[];
}

export function listPendingTasks() {
  return listTasks({ status: "pending" });
}

export function createTask(input: {
  type: TaskType;
  title: string;
  project?: string | null;
  dueDate?: string | null;
  notes?: string | null;
}) {
  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO tasks (type, title, project, due_date, notes)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(
      input.type,
      input.title,
      input.project ?? null,
      input.dueDate ?? null,
      input.notes ?? null,
    );

  return db
    .prepare("SELECT * FROM tasks WHERE id = ?")
    .get(result.lastInsertRowid) as Task;
}

export function markTaskDone(filters: { id?: number; title?: string }) {
  const db = getDb();

  let task: Task | undefined;

  if (filters.id) {
    db.prepare("UPDATE tasks SET status = ? WHERE id = ?").run("done", filters.id);
    task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(filters.id) as
      | Task
      | undefined;
  } else if (filters.title) {
    task = db
      .prepare(
        `SELECT * FROM tasks
         WHERE LOWER(title) LIKE LOWER(?)
         ORDER BY created_at DESC
         LIMIT 1`,
      )
      .get(`%${filters.title}%`) as Task | undefined;

    if (task) {
      db.prepare("UPDATE tasks SET status = ? WHERE id = ?").run("done", task.id);
      task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(task.id) as Task;
    }
  }

  return task;
}

export function insertChatMessage(role: ChatRole, content: string) {
  const db = getDb();
  const result = db
    .prepare("INSERT INTO chat_history (role, content) VALUES (?, ?)")
    .run(role, content);

  return db
    .prepare("SELECT * FROM chat_history WHERE id = ?")
    .get(result.lastInsertRowid) as ChatHistoryMessage;
}

export function getRecentChatHistory(limit = 40) {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM chat_history
       ORDER BY created_at DESC, id DESC
       LIMIT ?`,
    )
    .all(limit)
    .reverse() as ChatHistoryMessage[];
}

export function ensureDatabaseReady() {
  getDb();
}
