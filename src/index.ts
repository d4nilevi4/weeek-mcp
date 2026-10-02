#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

/**
 * weeek-mcp — a Model Context Protocol server over the Weeek public REST API.
 * Single-user: it acts as the owner of WEEEK_API_TOKEN, so every action is
 * attributed to that account. Tools are thin wrappers that surface Weeek's own
 * error body on failure, so wrong fields are easy to diagnose.
 */

const BASE = process.env.WEEEK_API_BASE ?? "https://api.weeek.net/public/v1";
const TOKEN = process.env.WEEEK_API_TOKEN ?? process.env.WEEEK_TOKEN;
if (!TOKEN) {
  console.error(
    "weeek-mcp: set WEEEK_API_TOKEN (create one in Weeek → workspace → Settings → API).",
  );
  process.exit(1);
}

async function call(method: string, path: string, body?: unknown): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const raw = await res.text();
  let json: any;
  try {
    json = raw ? JSON.parse(raw) : {};
  } catch {
    json = { raw };
  }
  if (!res.ok) throw new Error(`Weeek ${res.status}: ${JSON.stringify(json).slice(0, 400)}`);
  return json;
}

const text = (s: string) => ({ content: [{ type: "text" as const, text: s }] });
const clean = (o: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

const server = new McpServer({ name: "weeek-mcp", version: "0.1.0" });

// ─── Navigate ────────────────────────────────────────────────────────────────

server.tool("weeek_list_projects", "List Weeek projects in the workspace.", {}, async () => {
  const j = await call("GET", "/tm/projects");
  return text(JSON.stringify(j.projects ?? j).slice(0, 3000));
});

server.tool(
  "weeek_list_members",
  "List workspace members (id, name, email, role). Use a member id as an assignee.",
  {},
  async () => {
    const j = await call("GET", "/ws/members");
    const members = (Array.isArray(j.members) ? j.members : []).map((m: any) => ({
      id: m.id,
      name: [m.firstName, m.lastName].filter(Boolean).join(" ") || m.email,
      email: m.email,
      role: m.roleType,
    }));
    return text(JSON.stringify(members).slice(0, 2500));
  },
);

server.tool(
  "weeek_list_boards",
  "List boards in a project (id, name).",
  { projectId: z.number().describe("Project id") },
  async ({ projectId }) => {
    const j = await call("GET", `/tm/boards?projectId=${projectId}`);
    return text(JSON.stringify(j.boards ?? j).slice(0, 2000));
  },
);

server.tool(
  "weeek_list_board_columns",
  "List the columns of a board — use a column id to place a task.",
  { boardId: z.number().describe("Board id") },
  async ({ boardId }) => {
    const j = await call("GET", `/tm/board-columns?boardId=${boardId}`);
    return text(JSON.stringify(j.boardColumns ?? j.columns ?? j).slice(0, 2000));
  },
);

server.tool("weeek_list_tags", "List workspace tags (id, title) — pass a tag id to a task's tags.", {}, async () => {
  const j = await call("GET", "/ws/tags");
  const tags = (Array.isArray(j.tags) ? j.tags : []).map((t: any) => ({ id: t.id, title: t.title }));
  return text(JSON.stringify(tags).slice(0, 1800));
});

server.tool(
  "weeek_list_tasks",
  "List Weeek tasks, optionally filtered by project id.",
  { projectId: z.number().optional().describe("Weeek project id") },
  async ({ projectId }) => {
    const j = await call("GET", `/tm/tasks${projectId ? `?projectId=${projectId}` : ""}`);
    return text(JSON.stringify(j.tasks ?? j).slice(0, 3000));
  },
);

server.tool(
  "weeek_list_comments",
  "List a task's comments.",
  { taskId: z.number().describe("Task id") },
  async ({ taskId }) => {
    const j = await call("GET", `/tm/tasks/${taskId}/comments`);
    return text(JSON.stringify(j.comments ?? j).slice(0, 2500));
  },
);

// ─── Create / change ───────────────────────────────────────────────────────

server.tool(
  "weeek_create_board",
  "Create a board in a project.",
  { name: z.string().describe("Board name"), projectId: z.number().describe("Project id") },
  async ({ name, projectId }) => {
    const j = await call("POST", "/tm/boards", { name, projectId });
    return text(`Created board: ${JSON.stringify(j.board ?? j).slice(0, 500)}`);
  },
);

server.tool(
  "weeek_create_task",
  "Create a task. Optionally place it on a board/column, assign members (ids from weeek_list_members), set a due date (YYYY-MM-DD), priority (0–3), tags (ids), or a parent (→ subtask).",
  {
    title: z.string().describe("Task title"),
    projectId: z.number().optional().describe("Project id"),
    description: z.string().optional(),
    boardId: z.number().optional().describe("Board to place the task on"),
    boardColumnId: z.number().optional().describe("Column on that board"),
    assignees: z.array(z.string()).optional().describe("Member ids to assign"),
    dueDate: z.string().optional().describe("Due date, YYYY-MM-DD"),
    parentId: z.number().optional().describe("Parent task id → creates a subtask"),
    priority: z.number().optional().describe("Priority level 0–3"),
    tags: z.array(z.number()).optional().describe("Tag ids from weeek_list_tags"),
  },
  async (a) => {
    const j = await call("POST", "/tm/tasks", clean(a as Record<string, unknown>));
    return text(`Created task: ${JSON.stringify(j.task ?? j).slice(0, 500)}`);
  },
);

server.tool(
  "weeek_update_task",
  "Update a task. assignees (member ids) REPLACE the assignee list. Other fields change only if passed.",
  {
    taskId: z.number().describe("Task id"),
    title: z.string().optional(),
    description: z.string().optional(),
    assignees: z.array(z.string()).optional().describe("Member ids — replaces the assignee list"),
    dueDate: z.string().optional().describe("Due date, YYYY-MM-DD"),
    boardColumnId: z.number().optional(),
    isCompleted: z.boolean().optional(),
    priority: z.number().optional().describe("Priority level 0–3"),
    tags: z.array(z.number()).optional().describe("Tag ids (replaces the list)"),
    customFields: z
      .array(z.object({ id: z.string(), value: z.string() }))
      .optional()
      .describe("Set custom-field values; value format depends on the field type (text=string, select=option id)"),
  },
  async (a) => {
    const { taskId, assignees, ...rest } = a;
    const done: string[] = [];
    const body = clean(rest as Record<string, unknown>);
    if (Object.keys(body).length) {
      const j = await call("PUT", `/tm/tasks/${taskId}`, body);
      done.push(JSON.stringify(j.task ?? j).slice(0, 250));
    }
    if (assignees) {
      // Weeek keeps assignees on a sub-resource; PUT /tm/tasks/{id} ignores them.
      const j = await call("POST", `/tm/tasks/${taskId}/assignees`, { assignees });
      done.push(`assignees=${JSON.stringify(j.task?.assignees ?? j.assignees ?? assignees)}`);
    }
    return text(`Updated: ${done.join(" | ") || "(nothing to change)"}`);
  },
);

server.tool(
  "weeek_add_comment",
  "Add a comment to a task (markdown).",
  { taskId: z.number().describe("Task id"), markdown: z.string().describe("Comment body (markdown)") },
  async ({ taskId, markdown }) => {
    const j = await call("POST", `/tm/tasks/${taskId}/comments`, { markdown });
    return text(`Comment added: ${JSON.stringify(j.comment ?? j).slice(0, 300)}`);
  },
);

server.tool(
  "weeek_log_time",
  "Log a time entry on a task. duration is in minutes; userId comes from weeek_list_members.",
  {
    taskId: z.number().describe("Task id"),
    userId: z.string().describe("Member id (whose time this is)"),
    date: z.string().describe("Date, YYYY-MM-DD"),
    duration: z.number().describe("Minutes spent"),
  },
  async ({ taskId, userId, date, duration }) => {
    const j = await call("POST", `/tm/tasks/${taskId}/time-entries`, { userId, date, duration });
    return text(`Time logged: ${JSON.stringify(j.data ?? j).slice(0, 300)}`);
  },
);

server.tool(
  "weeek_complete_task",
  "Mark a task completed by its id.",
  { taskId: z.number().describe("Task id") },
  async ({ taskId }) => {
    const j = await call("PUT", `/tm/tasks/${taskId}`, { isCompleted: true });
    return text(`Updated: ${JSON.stringify(j.task ?? j).slice(0, 300)}`);
  },
);

await server.connect(new StdioServerTransport());
console.error("weeek-mcp: ready on stdio");
