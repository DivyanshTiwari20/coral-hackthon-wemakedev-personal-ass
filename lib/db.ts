import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

import type {
  Assignment,
  AssignmentStatus,
  ChatHistoryMessage,
  ChatRole,
  ChatSession,
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
      session_id INTEGER,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS chat_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  migrateChatSessions(db);
}

function hasColumn(db: Database.Database, tableName: string, columnName: string) {
  return db
    .prepare(`PRAGMA table_info(${tableName})`)
    .all()
    .some((column) => {
      const row = column as { name?: string };
      return row.name === columnName;
    });
}

function migrateChatSessions(db: Database.Database) {
  if (!hasColumn(db, "chat_history", "session_id")) {
    db.prepare("ALTER TABLE chat_history ADD COLUMN session_id INTEGER").run();
  }

  const orphanCount = db
    .prepare("SELECT COUNT(*) as count FROM chat_history WHERE session_id IS NULL")
    .get() as { count: number };

  if (orphanCount.count === 0) {
    return;
  }

  const existingSession = db
    .prepare("SELECT id FROM chat_sessions ORDER BY id ASC LIMIT 1")
    .get() as { id: number } | undefined;

  const sessionId =
    existingSession?.id ??
    Number(
      db
        .prepare("INSERT INTO chat_sessions (title) VALUES (?)")
        .run("Previous chat").lastInsertRowid,
    );

  db.prepare("UPDATE chat_history SET session_id = ? WHERE session_id IS NULL").run(sessionId);
  db.prepare(
    `UPDATE chat_sessions
     SET updated_at = COALESCE((SELECT MAX(created_at) FROM chat_history WHERE session_id = ?), updated_at)
     WHERE id = ?`,
  ).run(sessionId, sessionId);
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

export function deleteAssignment(id: number) {
  const db = getDb();
  db.prepare("DELETE FROM assignments WHERE id = ?").run(id);
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

export function deleteTask(id: number) {
  const db = getDb();
  db.prepare("DELETE FROM tasks WHERE id = ?").run(id);
}

function titleFromMessage(content: string) {
  const normalized = content.replace(/\s+/g, " ").trim();
  return normalized.length > 44 ? `${normalized.slice(0, 44)}...` : normalized || "New chat";
}

export function createChatSession(title = "New chat") {
  const db = getDb();
  const result = db
    .prepare("INSERT INTO chat_sessions (title) VALUES (?)")
    .run(title);
  const session = getChatSession(Number(result.lastInsertRowid));

  if (!session) {
    throw new Error("Failed to create chat session.");
  }

  return session;
}

export function getChatSession(id: number) {
  const db = getDb();
  return db
    .prepare(
      `SELECT
        chat_sessions.*,
        COUNT(chat_history.id) as message_count,
        (
          SELECT content
          FROM chat_history
          WHERE chat_history.session_id = chat_sessions.id
          ORDER BY id DESC
          LIMIT 1
        ) as last_message
       FROM chat_sessions
       LEFT JOIN chat_history ON chat_history.session_id = chat_sessions.id
       WHERE chat_sessions.id = ?
       GROUP BY chat_sessions.id`,
    )
    .get(id) as ChatSession | undefined;
}

export function listChatSessions(limit = 30) {
  const db = getDb();
  return db
    .prepare(
      `SELECT
        chat_sessions.*,
        COUNT(chat_history.id) as message_count,
        (
          SELECT content
          FROM chat_history
          WHERE chat_history.session_id = chat_sessions.id
          ORDER BY id DESC
          LIMIT 1
        ) as last_message
       FROM chat_sessions
       LEFT JOIN chat_history ON chat_history.session_id = chat_sessions.id
       GROUP BY chat_sessions.id
       ORDER BY datetime(chat_sessions.updated_at) DESC, chat_sessions.id DESC
       LIMIT ?`,
    )
    .all(limit) as ChatSession[];
}

export function getLatestChatSession() {
  return listChatSessions(1)[0] ?? createChatSession();
}

export function insertChatMessage(role: ChatRole, content: string, sessionId?: number | null) {
  const db = getDb();
  let targetSessionId = sessionId ?? getLatestChatSession().id;

  const session = getChatSession(targetSessionId);
  if (!session) {
    targetSessionId = createChatSession().id;
  }

  if (role === "user") {
    const currentSession = getChatSession(targetSessionId);
    if (currentSession && currentSession.message_count === 0) {
      db.prepare("UPDATE chat_sessions SET title = ? WHERE id = ?").run(
        titleFromMessage(content),
        targetSessionId,
      );
    }
  }

  const result = db
    .prepare("INSERT INTO chat_history (session_id, role, content) VALUES (?, ?, ?)")
    .run(targetSessionId, role, content);

  db.prepare("UPDATE chat_sessions SET updated_at = datetime('now') WHERE id = ?").run(
    targetSessionId,
  );

  return db
    .prepare("SELECT * FROM chat_history WHERE id = ?")
    .get(result.lastInsertRowid) as ChatHistoryMessage;
}

export function getRecentChatHistory(limit = 40, sessionId?: number | null) {
  const db = getDb();

  if (sessionId) {
    return db
      .prepare(
        `SELECT * FROM chat_history
         WHERE session_id = ?
         ORDER BY created_at DESC, id DESC
         LIMIT ?`,
      )
      .all(sessionId, limit)
      .reverse() as ChatHistoryMessage[];
  }

  const latestSession = getLatestChatSession();
  return db
    .prepare(
      `SELECT * FROM chat_history
       WHERE session_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT ?`,
    )
    .all(latestSession.id, limit)
    .reverse() as ChatHistoryMessage[];
}

export function ensureDatabaseReady() {
  getDb();
}
