# weeek-mcp

A [Model Context Protocol](https://modelcontextprotocol.io) server for
[Weeek](https://weeek.net) — drive projects, boards, tasks, assignees, comments,
tags and time tracking from any MCP client (Claude, Cursor, …). Every action is
attributed to the owner of your Weeek API token.

## Run

Needs Node 18+. Create a token in Weeek → workspace → **Settings → API**.

```sh
WEEEK_API_TOKEN=xxxxx npx weeek-mcp
```

From source:

```sh
npm install && npm run build
WEEEK_API_TOKEN=xxxxx node dist/index.js
```

## Configure your MCP client

Claude Code / Claude Desktop (`.mcp.json` or `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "weeek": {
      "command": "npx",
      "args": ["weeek-mcp"],
      "env": { "WEEEK_API_TOKEN": "xxxxx" }
    }
  }
}
```

| Env | Default | |
|---|---|---|
| `WEEEK_API_TOKEN` | — | **required**; the server acts as this token's owner |
| `WEEEK_API_BASE` | `https://api.weeek.net/public/v1` | override the API base |

## Tools

- **Navigate** — `weeek_list_projects` · `weeek_list_members` · `weeek_list_boards` · `weeek_list_board_columns` · `weeek_list_tags` · `weeek_list_tasks` · `weeek_list_comments`
- **Create / change** — `weeek_create_board` · `weeek_create_task` (board/column, assignees, due date, priority 0–3, tags, subtask via `parentId`) · `weeek_update_task` · `weeek_complete_task`
- **Collaborate** — `weeek_add_comment` (markdown) · `weeek_log_time` (minutes)

Tags and members are referenced by **id** (via the `list_*` tools). Custom-field
values depend on the field type (text = string, select = option id). On any error
the server returns Weeek's own response body, so a wrong field is easy to spot.

## Dev

```sh
npm run build   # tsc → dist/
```

MIT © ApeHub
