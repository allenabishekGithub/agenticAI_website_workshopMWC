# Live: LaLiga by MCP

Code for the live part of block 1, before the challenge. First a normal MCP server, which only returns text, and then the same interfaced server (MCP Apps).

Data comes from ESPN's public API (no key needed): ranking, results of the last day and calendar of each team.

| Folder | What it is |
| --- | --- |
| `1-mcp` | MCP server with three text return tools |
| `2-mcp-ui` | Same server with a view: table, results and computer tab |

In both, `liga.js` is normal JavaScript with no MCP (as `tienda.js` in Challenge 1). Everything about MCP is in `server.js` (and, in `2-mcp-ui`, also in `vista/app.js`).

**Live code is not written: it is decommented.**Each step is a block marked with `PASO N`. Select its lines of code (not the header) and press `Cmd + /`. The server restarts only when saving and works after each step. To start again: `git checkout --.` inside the folder.

## Tools

| Tool | Entry | Returns |
| --- | --- | --- |
| `ver_clasificacion` | — | The LaLiga table |
| `ver_resultados` | — | The matches of the last day |
| `ver_equipo` | `equipo`: name or nickname (‘Barça’, ‘Atleti’, ‘the Royal’) | Position, last five results and next match |

## Start

```bash
cd directo/liga/1-mcp      # o 2-mcp-ui
npm install
npm run dev                # 1-mcp → http://localhost:3101/mcp · 2-mcp-ui → http://localhost:3102/mcp
npm run probar             # at another terminal
```

### The chat

Open `http://localhost:3101` (or `:3102`): a chat with **GPT-6-moon** that uses the tools that the server has at that time, and below the same tools to call them by hand. Before each question you ask for `tools/list` again, so every step you decompose comes to the model without reloading. If a tool has a view (MCP Apps), it is painted inside the chat.

The model goes for the proxy from OpenAI workshop with the token from `retos/config.js` (or, if empty, the `WORKSHOP_TOKEN` from `.dev.vars`).

## Guion

Start `npm run dev`, open the chat and leave another terminal for `npm run probar`: after each step, show what has changed.

### Part 1 · A normal MCP (`1-mcp/server.js`)

Before you uncomput anything, it teaches `liga.js`: three functions calling ESPN. No MCP. `npm run probar` says the server still doesn't have tools.

Ask in the chat "Who is going to lead LaLiga?" without tools, the model cannot know and says so.

| Step, I'm sorry. | What a mess you're making. | What do you explain? |
| --- | --- | --- |
| 1 | `server.registerTool('ver_clasificacion', …)` | Name, description (model decides only with that) and a function that returns `content` text |
| 2 | `ver_resultados` | Another same tool. A server can offer several |
| 3 | `ver_equipo` | `inputSchema` with zod: the model knows what arguments to pass. If it fails, `isError: true` |

After each step, ask again in chat (in the same conversation). Now the model calls the tool and responds with real data:

- «Who is leading LaLiga?»
- «How did Barça do with the last game and who he plays against now?»
- ‘last day results’

The problem: the model receives twenty lines of text and responds with a table in minddown. No shields, no colors and no touch.

### Part 2 · The same tool, with interface (`2-mcp-ui`)

Part of the `1-mcp` server finished, with a single change already made: `server.registerTool(…)` becomes `registerAppTool(server, …)`, which is the same but understands `_meta.ui`.

In `server.js`:

| Step, I'm sorry. | What a mess you're making. | What do you explain? |
| --- | --- | --- |
| 1 | `ui: { resourceUri: VISTA }` in all three tools | The tool declares its view, `ui://laliga/vista.html`. `probar` warns that the resource does not yet exist |
| 2 | `structuredContent` in all three tools | Text (`content`) is for the model; data (`structuredContent`) is for the view |
| 3 | `registerAppResource(…)` | The HTML view, with `csp.resourceDomains` to show the `a.espncdn.com` shields |

In `vista/app.js` (the top is painting HTML; what matters is at the end):

| Step, I'm sorry. | What a mess you're making. | What do you explain? |
| --- | --- | --- |
| 4 | `toolinput` and `toolresult` | The client is given the arguments and the result. |
| 5 | `callServerTool()` | Tabs and clicks on a computer call the tools without going through the model |
| 6 | `updateModelContext()` | Tells the model what equipment the user is looking at |
| 7 | `sendMessage()` | The "Ask the Wizard" button writes in the chat |
| 8 | `applyDocumentTheme`, `applyHostStyleVariables`, `applyHostFonts` | The theme, colors and fonts are adapted to the customer |

The view is packed every time the client asks for it, so changes to `vista/app.js` need not restart anything: just call back the tool.

You ask the same questions again: now the answer is a board with shields and zones, and you can navigate through it.

## Clients

**MCPJam Inspector**: `npm run inspector`, adds an HTTP server with `http://localhost:3101/mcp` (or `:3102` for `2-mcp-ui`) and executes the tools.

**VS Code** (`.vscode/mcp.json`):

```json
{
  "servers": {
    "laliga": { "type": "http", "url": "http://localhost:3101/mcp" }
  }
}
```

**Claude Desktop**:

```json
{
  "mcpServers": {
    "laliga": {
      "command": "node",
      "args": ["/RUTA/ABSOLUTA/directo/liga/2-mcp-ui/server.js", "--stdio"]
    }
  }
}
```
