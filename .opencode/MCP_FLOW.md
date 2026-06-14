# MCP Flow: Tool Infrastructure

## How OpenCode Communicates with MCP Servers

OpenCode uses the **Model Context Protocol (MCP)** to integrate external tools, prompts, and resources from local and remote servers.

## Architecture Overview

```
┌─────────────────────────────────────────────┐
│              MCP.Service                      │
│  (packages/opencode/src/mcp/index.ts)        │
│                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │ Local    │  │ Remote   │  │ Remote   │  │
│  │ MCP      │  │ MCP      │  │ MCP      │  │
│  │ (stdio)  │  │ (Stream- │  │ (SSE)    │  │
│  │          │  │ ableHTTP)│  │          │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  │
│       │             │             │         │
│       └─────────────┴─────────────┘         │
│                    │                         │
│              ┌─────▼──────┐                  │
│              │ McpCatalog  │                  │
│              │ (catalog.ts)│                  │
│              │ tool defs   │                  │
│              │ prompts     │                  │
│              │ resources   │                  │
│              └─────┬──────┘                  │
│                    │                         │
│              ┌─────▼──────┐                  │
│              │ MCP Tools   │                  │
│              │ → AI SDK    │                  │
│              │   dynamicTool│                 │
│              └─────┬──────┘                  │
│                    │                         │
│              ┌─────▼──────┐                  │
│              │ Session     │                  │
│              │ Tools       │                  │
│              │ (tools.ts)  │                  │
│              └────────────┘                  │
└─────────────────────────────────────────────┘
```

## 1. MCP Server Registration

### Configuration

MCP servers are defined in `opencode.json` under the `mcp` key:

```jsonc
{
  "mcp": {
    "servers": {
      "my-server": {
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-filesystem"],
        "cwd": "/path/to/project",
        "env": { "FOO": "bar" },
        "disabled": false,
        "timeout": 60,
        "oauth": { ... }
      },
      "remote-server": {
        "url": "https://mcp.example.com",
        "headers": { "Authorization": "Bearer ..." },
        "oauth": { ... }
      }
    }
  }
}
```

**Schema files:**
- `packages/core/src/config/mcp.ts` — Config schema for Local/Remote MCP servers
- `packages/core/src/v1/config/mcp.ts` — Legacy V1 config schema

### Registration Flow

```
1. InstanceState.make() (per-directory scoped state)
   │
   ├── Read MCP config from merged Config
   │
   ├── For each enabled server:
   │   │
   │   └── MCP.create(name, config)
   │       │
   │       ├── If local:
   │       │   ├── StdioClientTransport(command, args, env)
   │       │   ├── Spawn child process
   │       │   └── Client.connect(transport)
   │       │
   │       ├── If remote:
   │       │   ├── Try StreamableHTTPClientTransport(url, headers)
   │       │   │   └── If fails → Fallback to SSEClientTransport(url)
   │       │   ├── McpOAuthProvider for OAuth flow
   │       │   └── Client.connect(transport)
   │       │
   │       ├── → client.initialize()
   │       ├── → McpCatalog.defs(client) → list tools
   │       ├── → Store tool defs in State.defs[name]
   │       │
   │       └── Watch for:
   │           ├── client.onclose → cleanup
   │           ├── LoggingMessageNotification → forward to logger
   │           └── ToolListChangedNotification → re-list tools
   │
   └── Auth check → if needs auth → McpAuth.hasStoredTokens()
```

**Key files:**
- `packages/opencode/src/mcp/index.ts` — Core MCP service (create/connect/disconnect/status)
- `packages/opencode/src/mcp/auth.ts` — OAuth token persistence (JSON file)
- `packages/opencode/src/mcp/oauth-provider.ts` — OAuthClientProvider impl
- `packages/opencode/src/mcp/oauth-callback.ts` — Local HTTP server for OAuth redirect
- `packages/opencode/src/project/instance-store.ts` — InstanceStore for per-directory lifecycle

### Transport Types

| Type | Transport | Use Case |
|------|-----------|----------|
| Local | `StdioClientTransport` | Local MCP server as child process |
| Remote | `StreamableHTTPClientTransport` | Remote MCP with streaming (preferred) |
| Remote | `SSEClientTransport` | Remote MCP with Server-Sent Events (fallback) |

## 2. Tool Discovery Flow

```
ToolRegistry.tools() or SessionTools.resolve()
    │
    ├── Built-in tools (read, write, edit, shell, etc.)
    │   File: packages/opencode/src/tool/registry.ts
    │
    ├── Custom tools (from tool/*.{js,ts} in project)
    │   File: packages/opencode/src/tool/registry.ts
    │
    ├── Plugin tools (from @opencode-ai/plugin)
    │   File: packages/opencode/src/plugin/
    │
    └── MCP tools:
        │
        └── MCP.Service.tools()
            │
            ├── For each connected client with tool capability:
            │   │
            │   ├── Is cached state stale?
            │   │   ├── Yes → McpCatalog.defs(client) → re-list tools
            │   │   └── No → Use cached defs
            │   │
            │   └── For each tool def:
            │       └── McpCatalog.convertTool(mcpTool, client, timeout)
            │           ├── Adopts inputSchema from MCP tool
            │           ├── Wraps client.callTool() as execute handler
            │           ├── Sanitizes name: {server}_{tool} (alphanumeric)
            │           └── Returns AI SDK dynamicTool()
```

**Key files:**
- `packages/opencode/src/mcp/catalog.ts` — Tool discovery, conversion, pagination
- `packages/opencode/src/session/tools.ts` — V1 tool resolution merging built-in + MCP

### Tool Name Format

MCP tool names are prefixed to avoid collisions:
```
{sanitized_server_name}_{sanitized_tool_name}
```
e.g., `filesystem_read_file`, `github_create_issue`

## 3. Tool Execution Flow

### V1 Path (Active)

```
LLM triggers tool call
    │
    ▼
AI SDK tool.execute(args)
    │
    ▼
SessionTools wrapper (packages/opencode/src/session/tools.ts)
    │
    ├── For MCP tool:
    │   ├── Permission check via ctx.ask()
    │   ├── Plugin hook: tool.execute.before
    │   ├── → client.callTool(name, args) → MCP server
    │   ├── Plugin hook: tool.execute.after
    │   └── Truncate output
    │
    ├── For built-in tool:
    │   ├── Permission check
    │   ├── item.execute(args, ctx)
    │   │   ├── read → read files
    │   │   ├── write → write files
    │   │   ├── edit → edit files
    │   │   ├── shell → execute shell command
    │   │   └── ...
    │   └── Truncate output
    │
    └── Return tool result as content[]
```

### V2 Path (Future)

```
LLM.stream() → tool-call event
    │
    ▼
toolMaterialization.settle(call)
    │  File: packages/core/src/tool/registry.ts
    │
    ├── Look up tool by name in registrations
    ├── Decode input via tool schema
    ├── Execute tool
    └── Encode output via tool schema
```

## 4. MCP Tool Response Handling

```
client.callTool(name, args)
    │
    ▼
MCP Server
    │
    ▼
CallToolResult = { content: (TextContent | ImageContent | ResourceContent)[] }
    │
    ▼
McpCatalog.convertTool → AI SDK execute handler:
    ├── Receives CallToolResult
    ├── Extracts text/JSON from content
    └── Returns as tool result content
```

## 5. Error Handling

| Error | Handling |
|-------|----------|
| Connection lost (client.onclose) | Marks server as disconnected; triggers cleanup in InstanceState |
| Tool execution timeout | `McpCatalog.defs()` and `convertTool()` accept timeout parameter |
| OAuth failure | `UnauthorizedError` from `@modelcontextprotocol/sdk` → triggers re-auth |
| Invalid tool input | Schema validation errors from MCP server returned as error content |
| Server not responding | Effect timeout on `client.callTool()` → abort |

## 6. OAuth Flow for Remote MCP Servers

```
1. MCP.OAuth provider configuration in opencode.json
2. MCP.startAuth(name) → opens browser to authorization URL
3. oauth-callback.ts → local server receives redirect
4. MCP.finishAuth(name, url) → exchanges code for tokens
5. Tokens stored in McpAuth (JSON file: ~/.local/share/opencode/data/mcp-auth.json)
6. Auto-refresh on subsequent connections
```

## Key Files Summary

| File | Purpose |
|------|---------|
| `packages/opencode/src/mcp/index.ts` | Core MCP service: lifecycle, tool listing, auth, status (~928 lines) |
| `packages/opencode/src/mcp/catalog.ts` | Tool discovery: list, paginate, convert to AI SDK tools |
| `packages/opencode/src/mcp/auth.ts` | OAuth token persistence (JSON file per directory) |
| `packages/opencode/src/mcp/oauth-provider.ts` | MCP OAuthClientProvider implementation |
| `packages/opencode/src/mcp/oauth-callback.ts` | Local HTTP server for OAuth redirect |
| `packages/core/src/config/mcp.ts` | MCP config schema (Local, Remote, OAuth) |
| `packages/opencode/src/cli/cmd/mcp.ts` | CLI commands: add, list, auth, logout, debug |
| `packages/opencode/src/tool/registry.ts` | V1 tool registry (integrates MCP tools) |
| `packages/opencode/src/session/tools.ts` | V1 session tool resolution (includes MCP.tools()) |
