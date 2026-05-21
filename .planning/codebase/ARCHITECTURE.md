<!-- refreshed: 2026-05-21 -->
# Architecture

**Analysis Date:** 2026-05-21

## System Overview

```text
┌─────────────────────────────────────────────────────────────────────┐
│                    MCP Client (Claude Code / Cursor / Codex)        │
│                    Transport: stdio (JSON-RPC 2.0)                  │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      MCP Server Layer                               │
│                   `src/server.ts`                                    │
│              McpServer (SDK) + StdioServerTransport                 │
├─────────────────────────────────────────────────────────────────────┤
│  29 registered tools (server.tool(...) calls)                      │
│  Each tool: { name, description, schema (zod), handler (fn) }       │
└────────┬────────────────────┬──────────────────────┬───────────────┘
         │                    │                      │
         ▼                    ▼                      ▼
┌─────────────────┐ ┌──────────────────┐ ┌──────────────────────────┐
│  Tool Modules   │ │  Output Helpers   │ │   Cross-Cutting          │
│  `src/tools/*`  │ │  `src/tools/      │ │                          │
│                 │ │   helpers.ts`     │ │  Config  `src/config.ts` │
│  One file per   │ │                   │ │  Errors  `src/errors.ts` │
│  GitLab domain  │ │  toolResult()     │ │  Redact  `src/redact.ts` │
│  (projects,     │ │  toolError()      │ │  Client  `src/gitlab/`   │
│   MRs, ...)     │ │  getClient()      │ │                          │
└────────┬────────┘ └──────────────────┘ └────────────┬─────────────┘
         │                                          │
         ▼                                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    GitLab API Client Layer                          │
│                   `src/gitlab/client.ts`                            │
│              HTTP + PRIVATE-TOKEN auth to /api/v4/*                 │
│         Pagination: `src/gitlab/pagination.ts`                      │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   External: GitLab REST API v4                      │
│        https://gitlab.example.com/api/v4/projects/...               │
└─────────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Server entry | Boot MCP server via stdio, register all tools, handle lifecycle | `src/server.ts` |
| Config | Load multi-host config from JSON file or env vars, resolve host to base URL + token | `src/config.ts` |
| GitLab Client | Build API URLs with pagination, make HTTP requests with PRIVATE-TOKEN auth | `src/gitlab/client.ts` |
| Pagination | Normalize page/perPage params, enforce min=1 max=100 defaults | `src/gitlab/pagination.ts` |
| Output helpers | Create standardized MCP tool responses (text + structuredContent), manage config cache | `src/tools/helpers.ts` |
| Normalize | Transform raw GitLab API responses into stable output shape, strip sensitive/unstable fields | `src/tools/normalize.ts` |
| Binary detection | Detect binary vs text content in buffers | `src/tools/binary.ts` |
| Redaction | Remove tokens and emails from error messages and logs | `src/redaction.ts` |
| Error handling | Custom error types + user-friendly error message formatting | `src/errors.ts` |
| Tool modules | Define Zod schemas, implement handlers, export tool registration objects per GitLab domain | `src/tools/*.ts` |

## Pattern Overview

**Overall:** Layered tool-registration architecture over a thin GitLab REST API client.

**Key Characteristics:**
- Each MCP tool is a self-contained module exporting a `ToolDefinition` object (`{ name, description, schema, handler }`)
- All tools follow an identical handler pattern: parse params via Zod, call `getClient(host)`, call `client.request<T>(path)`, pass through `normalize*()`, return via `toolResult()` / `toolError()`
- No global mutable state except the config cache in `src/tools/helpers.ts` (singleton `cachedConfig`)
- No database, no filesystem writes, no background workers -- purely request/response
- Multi-host support via `GITLAB_MCP_CONFIG` env pointing to a JSON file with host aliases and per-host token env var names

## Layers

**MCP Server Layer:**
- Purpose: Wire up the MCP protocol (stdio transport), register tools, handle startup config errors
- Location: `src/server.ts`
- Contains: Server instantiation, tool registration calls, `main()` entry point
- Depends on: All `src/tools/*` modules, `src/config.ts`, `src/redaction.ts`
- Used by: MCP client (Claude Code, Cursor, Codex) via stdio

**Tool Handler Layer:**
- Purpose: Implement individual GitLab operations as MCP tools
- Location: `src/tools/`
- Contains: One TypeScript file per GitLab domain (projects, mergeRequests, pipelines, etc.) plus shared helpers
- Depends on: `src/tools/helpers.ts`, `src/tools/normalize.ts`, `src/tools/binary.ts`, `src/gitlab/client.ts`, `src/errors.ts`
- Used by: `src/server.ts`

**Output Normalization Layer:**
- Purpose: Transform raw GitLab API responses into a stable, filtered output shape; enforce size limits via byte-aware truncation
- Location: `src/tools/normalize.ts`, `src/tools/binary.ts`
- Contains: ~30+ normalize functions (one per GitLab resource type), byte-budget truncation logic
- Depends on: None (pure functions, no imports from other project modules)
- Used by: All tool handler modules

**API Client Layer:**
- Purpose: Abstract HTTP communication with GitLab REST API v4
- Location: `src/gitlab/client.ts`, `src/gitlab/pagination.ts`
- Contains: `GitLabClient` class (URL building, JSON/text requests), pagination utilities
- Depends on: `src/errors.ts` (for `GitLabApiError`), `src/redaction.ts` (for error body redaction)
- Used by: All tool handler modules via `getClient()` helper

**Configuration Layer:**
- Purpose: Load and validate connection configuration (base URL + token per host)
- Location: `src/config.ts`
- Contains: `loadConfig()`, `resolveHost()`, validation functions, type definitions
- Depends on: `src/errors.ts` (for `ConfigError`)
- Used by: `src/tools/helpers.ts` (via `getClient()`)

**Cross-Cutting Layer:**
- Purpose: Token/email redaction, error classification
- Location: `src/redaction.ts`, `src/errors.ts`
- Contains: `redact()` function, `GitLabApiError`/`ConfigError` classes, `formatApiError()` switch
- Depends on: None
- Used by: `src/gitlab/client.ts`, `src/tools/helpers.ts`, `src/server.ts`

## Data Flow

### Primary Request Path

1. MCP client sends `tools/call` via stdio JSON-RPC (`src/server.ts:39-67` -- registered tool handlers)
2. MCP SDK dispatches to the matching tool handler function (`src/tools/<domain>.ts`)
3. Handler calls `getClient(host)` to resolve config and create a `GitLabClient` instance (`src/tools/helpers.ts:14-18`)
4. Handler calls `client.request<T>(path, options)` which builds the URL with pagination and makes the HTTP call (`src/gitlab/client.ts:43-58`)
5. Raw JSON response is passed through the appropriate `normalize*()` function to strip unstable fields (`src/tools/normalize.ts`)
6. Normalized data is wrapped via `toolResult(data)` which produces `{ content: [{type:"text", text: JSON}], structuredContent: {...}, isError: false }` (`src/tools/helpers.ts:45-51`)
7. MCP SDK serializes the response back to the client over stdio

### Error Path

1. `GitLabClient.request()` receives non-OK HTTP response
2. Response body is redacted via `redact()` to prevent token leakage (`src/gitlab/client.ts:53-54`)
3. A `GitLabApiError` is thrown with status, statusText, and redacted body
4. Tool handler's catch block calls `toolError(formatApiError(error))` which produces `{ content: [{type:"text", text: JSON}], isError: true }` (`src/tools/helpers.ts:53-58`)
5. `formatApiError()` maps status codes to user-friendly messages (`src/errors.ts:19-41`)

**State Management:**
- No persistent state between requests. Each tool call creates a fresh `GitLabClient` instance via `getClient()`.
- Config is loaded once and cached in module-level `cachedConfig` variable (`src/tools/helpers.ts:5-12`). Test code can reset via `resetConfigForTests()`.
- No shared mutable state across tool handlers.

## Key Abstractions

**ToolDefinition:**
- Purpose: Uniform contract for registering a tool with the MCP server
- Examples: Every tool module exports one or more objects matching `{ name: string, description: string, schema: z.ZodType, handler: (params) => Promise<ToolOutput> }`
- Pattern: Declarative registration -- `src/server.ts` iterates these and calls `server.tool(tool.name, tool.description, tool.schema.shape, tool.handler)`

**ToolOutput:**
- Purpose: Standardized MCP tool response shape with both text content and structured content
- Interface: `{ content: Array<{type: "text", text: string}>, structuredContent?: Record<string, unknown>, isError?: boolean }`
- Pattern: Always returned by tool handlers; `toolResult()` wraps data (arrays become `{items: [...]}`), `toolError()` wraps error messages

**Normalized Types:**
- Purpose: Stable output contract that strips GitLab API fields that may vary across versions (permissions, avatar_url, runner, etc.)
- Examples: `normalizeProject()`, `normalizeMergeRequest()`, `normalizeJob()`, etc. in `src/tools/normalize.ts`
- Pattern: Each function takes a loose GitLab API response interface and returns a strict subset of fields with explicit null defaults

**GitLabClient:**
- Purpose: Thin HTTP wrapper over GitLab REST API v4 with auth and pagination
- Pattern: Constructor takes `(baseUrl, token)`, exposes `request<T>(path, options)` and `requestText(path, options)` with `PRIVATE-TOKEN` header

## Entry Points

**Server entry (production):**
- Location: `src/server.ts` (also `dist/server.js` after build)
- Triggers: Invoked as `node dist/server.js` or `npx tsx src/server.ts` (dev)
- Responsibilities: Load config, register 29 tools, start stdio MCP transport, export `server` for test use
- Binary entry: `package.json` declares `"bin": { "gitlab-mcp-connector": "./dist/server.js" }`

**Test entry:**
- Location: `tests/` directory (run via `vitest`)
- Triggers: `npm test` or `vitest run`
- Responsibilities: Unit tests (mock HTTP via `undici`), integration tests (spawn server process via stdio)

## Architectural Constraints

- **Threading:** Single-threaded Node.js event loop. No worker threads used. Each tool call is async but runs on the main thread.
- **Global state:** Module-level `cachedConfig` singleton in `src/tools/helpers.ts:5`. Reset between tests via `resetConfigForTests()`. No other shared mutable state.
- **Circular imports:** None detected. Dependency graph is strictly layered: `server.ts` -> `tools/*` -> `helpers.ts` -> `config.ts` / `gitlab/client.ts` -> `errors.ts` / `redaction.ts`.
- **Read-only constraint:** By design, no POST/PUT/PATCH/DELETE HTTP methods exist in `GitLabClient`. The `request()` method uses the default `fetch()` behavior (GET). Write operations are planned for future versions but are not present in v0.3.0.
- **Transport constraint:** stdio only. No HTTP/SSE transport. This is a design choice per the MCP SDK's `StdioServerTransport`.
- **No dependency injection:** `getClient()` creates `GitLabClient` internally. Tests mock at the HTTP layer (undici `MockAgent`) rather than injecting client instances.

## Anti-Patterns

### Duplicated `byteLength()` and `truncateContentInPayload()`

**What happens:** The `byteLength()` function and the `truncateContentInPayload()` helper are independently defined in `src/tools/repository.ts`, `src/tools/artifacts.ts`, and `src/tools/ciConfig.ts` with identical or near-identical logic.
**Why it's wrong:** Violates DRY. If the truncation strategy changes, all three copies must be updated.
**Do this instead:** Extract to `src/tools/helpers.ts` or `src/tools/binary.ts` as shared utilities. `byteLength` already exists in `src/tools/binary.ts` but is redefined locally.

### Local `byteLength()` redefinitions

**What happens:** `src/tools/pipelines.ts`, `src/tools/ciConfig.ts`, `src/tools/issues.ts`, and `src/tools/repository.ts` each define their own `byteLength()` function despite `src/tools/binary.ts` exporting one.
**Why it's wrong:** Maintenance burden and inconsistency risk.
**Do this instead:** Import from `src/tools/binary.ts`: `import { byteLength } from "./binary.js"`.

### Large normalize.ts monolith

**What happens:** `src/tools/normalize.ts` is 1014 lines containing normalizers for every GitLab resource type plus internal GitLab interfaces, all in one file.
**Why it's wrong:** As the tool count grows, this file becomes harder to navigate and test. Adding a new resource type requires editing a shared file.
**Do this instead:** Consider co-locating normalizer functions with their tool files (e.g., `normalizeProject()` in `src/tools/projects.ts`) or splitting `normalize.ts` into domain-specific modules.

## Error Handling

**Strategy:** Two-tier error handling -- API-level errors thrown as `GitLabApiError`, then caught and formatted in tool handlers.

**Patterns:**
- All tool handlers use `try/catch` around the full body. On success: `return toolResult(data)`. On error: `return toolError(formatApiError(error))`.
- `formatApiError()` maps HTTP status codes to human-readable messages (401 -> "Authentication failed", 403 -> "Access denied", etc.) in `src/errors.ts:19-41`.
- Error response bodies from GitLab are always passed through `redact()` before being thrown or logged (`src/gitlab/client.ts:53-54`).
- Config errors throw `ConfigError` during startup (`src/server.ts:33-37`) and are caught at the top level, logged to stderr, but do not crash the server.
- API errors in tool handlers are returned as `isError: true` MCP results, not thrown -- the MCP protocol handles error signaling to clients.

## Cross-Cutting Concerns

**Logging:** Minimal. `console.error()` used only for startup config errors (`src/server.ts:36,76-77`). No request-level logging. All errors are returned to the MCP client via the protocol.

**Validation:** Zod schemas validate all tool input parameters at the MCP SDK level (schema passed as `.shape` to `server.tool()`). The `GitLabClient` does not perform input validation. `src/config.ts` validates config structure with manual checks throwing `ConfigError`.

**Authentication:** Token-based via `PRIVATE-TOKEN` HTTP header. Token is resolved from environment variables per host. Token never enters client-facing output -- redacted by `src/redaction.ts` patterns covering header values, query params, and JSON body fields.

**Output normalization:** All GitLab API responses pass through `normalize*()` functions that strip unstable/sensitive fields (permissions, avatar_url, runner info, owner emails). This is a security and stability concern -- output shape must not vary across GitLab versions.

**Size truncation:** Large outputs (diffs, file contents, job logs, CI config, artifacts) are byte-budget-aware. Default limit is 200KB (`200 * 1024`). Binary search is used to find the maximum content length that fits within the budget. Truncated payloads include `truncated: true` and `max_bytes` fields.

---

*Architecture analysis: 2026-05-21*
