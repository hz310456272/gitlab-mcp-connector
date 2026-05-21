# Coding Conventions

**Analysis Date:** 2026-05-21

## Naming Patterns

**Files:**
- Source files: `camelCase.ts` (e.g., `mergeRequests.ts`, `ciConfig.ts`)
- Test files: Match source name with `.test.ts` suffix (e.g., `mergeRequests.test.ts`)
- Tool files: Plural noun for domains (e.g., `projects.ts`, `pipelines.ts`, `issues.ts`)
- Utility files: Descriptive `camelCase.ts` (e.g., `helpers.ts`, `normalize.ts`, `binary.ts`, `redaction.ts`)

**Functions:**
- `camelCase` for all functions (e.g., `listProjects`, `normalizeCommit`, `encodeProjectPath`)
- Private helpers: `camelCase` with no prefix (e.g., `normalizeBaseUrl`, `validateBaseUrl`, `normalizeUser`)
- Tool handler functions: Same name as the tool concept (e.g., `listProjects`, `getMergeRequest`)

**Variables:**
- `camelCase` for all variables and parameters
- `UPPER_SNAKE_CASE` for constants (e.g., `DEFAULT_PER_PAGE`, `MAX_PER_PAGE`, `USER_AGENT`)
- `UPPER_SNAKE_CASE` for default values and limits (e.g., `DEFAULT_JOB_LOG_MAX_BYTES`, `MIN_PAYLOAD_MAX_BYTES`)

**Types:**
- Interfaces: `PascalCase` prefixed by domain (e.g., `GitLabProject`, `GitLabMergeRequest`, `GitLabDiff`)
- Type aliases: `PascalCase` (e.g., `PaginationParams`, `SearchScope`, `MultiHostConfig`)
- Tool export objects: `camelCase` + `Tool` suffix (e.g., `listProjectsTool`, `getMergeRequestTool`)

## Code Style

**Formatting:**
- No Prettier or EditorConfig configured; relies on ESLint and TypeScript strict mode
- 2-space indentation
- Single quotes for strings
- Semicolons required
- Trailing commas allowed

**Linting:**
- Tool: ESLint 9+ with `typescript-eslint` 8+
- Config: flat config format in `eslint.config.js`
- Rules: extends `eslint.configs.recommended` + `tseslint.configs.recommended`
- Custom rule: `@typescript-eslint/no-unused-vars` set to `warn`, with `argsIgnorePattern: "^_"` and `varsIgnorePattern: "^_"` -- unused variables prefixed with underscore are allowed
- Scope: `src/**/*.ts` and `tests/**/*.ts`
- Ignored: `dist/`, `node_modules/`

**TypeScript:**
- Target: ES2022
- Module: NodeNext (ESM with `.js` extension in imports)
- Strict mode: enabled (`strict: true`)
- `forceConsistentCasingInFileNames`: enabled
- All imports use `.js` extension (ESM requirement, even for `.ts` source files)

## Import Organization

**Order:**
1. External packages (`@modelcontextprotocol/sdk`, `zod`)
2. Node.js built-ins (`node:fs`, `node:path`, `node:http`)
3. Internal modules using relative paths with `.js` extension

**Path Aliases:**
- No path aliases configured; all imports use relative paths

**Examples from codebase:**
```typescript
// src/tools/projects.ts
import { z } from "zod";
import { encodeProjectPath } from "../gitlab/client.js";
import { getClient, toolResult, toolError } from "./helpers.js";
import { normalizeProjectList, normalizeProject } from "./normalize.js";
import { formatApiError } from "../errors.js";
```

```typescript
// tests/tools/projects.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MockAgent, setGlobalDispatcher } from "undici";
import { listProjects, getProject } from "../../src/tools/projects.js";
import { resetConfigForTests } from "../../src/tools/helpers.js";
```

## Error Handling

**Patterns:**
- All tool handlers wrap logic in `try/catch` and return `toolError(formatApiError(error))` on failure
- Never throw from tool handlers; always return an `isError: true` result
- Custom error classes: `GitLabApiError` (for HTTP errors) and `ConfigError` (for configuration errors), both in `src/errors.ts`
- `formatApiError()` maps HTTP status codes to user-friendly messages (401 -> auth failed, 403 -> access denied, 404 -> not found, 429 -> rate limited, 5xx -> server error)
- Config errors include actionable guidance (e.g., "Set GITLAB_TOKEN to your GitLab personal access token")

**Pattern (every tool handler):**
```typescript
export async function listProjects(params: z.infer<typeof listProjectsSchema>) {
  try {
    const client = getClient(params.host);
    // ... API call ...
    return toolResult(normalizedData);
  } catch (error) {
    return toolError(formatApiError(error));
  }
}
```

**Sensitive data in errors:**
- All error output passes through `redact()` before being emitted to stderr or logs
- Token values never appear in error messages
- Email addresses in error messages are redacted

## Logging

**Framework:** `console.error` only; no logging library

**Patterns:**
- Startup config errors: `console.error(\`[gitlab-mcp-connector] Config error: ${redact(msg)}\`)` in `src/server.ts`
- Fatal errors at shutdown: `console.error(redact(message))` in `src/server.ts` `main()` catch
- All output through `console.error` is redacted

**No debug logging:** The codebase does not use console.log or any debug-level logging in production code.

## Comments

**When to Comment:**
- Section separators for code regions within a file (e.g., `// --- list_job_artifacts ---`, `// --- Repository tree ---`, `// --- Issues ---`)
- Inline comments only for non-obvious logic (binary search truncation, safety checks)
- Constants with rationale (e.g., `const LIST_DESCRIPTION_MAX_CHARS = 500;`)

**JSDoc/TSDoc:**
- Not used for functions or methods
- Zod `.describe()` calls serve as parameter documentation on tool schemas
- Tool `description` fields serve as API documentation

## Function Design

**Size:**
- Tool handler functions: 20-60 lines typically
- Normalizer functions: 10-40 lines each
- Complex functions with truncation logic: up to 100 lines (e.g., `normalizeCompareResult`, `getJobLog`, `getRepositoryFile`)

**Parameters:**
- Tool handlers accept a single typed params object: `params: z.infer<typeof schemaName>`
- Helper functions use positional parameters
- The `host` param is destructured and aliased to `_` (unused after client creation): `const { host: _, ...rest } = params;`

**Return Values:**
- Tool handlers return `ToolOutput` (from `src/tools/helpers.ts`) with `content`, `structuredContent`, and `isError` fields
- Normalizer functions return plain objects with explicit field selection (whitelist approach)
- Utility functions return primitives or typed objects

## Module Design

**Exports:**
- Each tool file exports: handler functions, tool definition objects (with `name`, `description`, `schema`, `handler`), and any types needed by tests
- `src/tools/helpers.ts` exports shared utilities: `getClient`, `toolResult`, `toolError`, `jsonText`, `errorText`, `resetConfigForTests`
- `src/tools/normalize.ts` exports all normalizer functions (both individual and list variants)
- `src/errors.ts` exports error classes and the `formatApiError` formatter

**Barrel Files:**
- No barrel files (no `index.ts` aggregating exports)
- `src/server.ts` imports directly from each tool file by name

**Tool Definition Pattern:**
Every tool exports a constant object with this shape:
```typescript
export const listProjectsTool = {
  name: "gitlab_list_projects",          // snake_case, gitlab_ prefix
  description: "List accessible GitLab projects",
  schema: listProjectsSchema,             // z.object({...})
  handler: listProjects,                  // async function reference
};
```

**Schema Pattern:**
Every tool schema is a `z.object()` with the first optional field being `host`:
```typescript
const listProjectsSchema = z.object({
  host: z.string().optional().describe("Host alias from config"),
  projectIdOrPath: z.string().describe("Project ID or URL-encoded path"),
  // ... domain-specific fields ...
  page: z.number().optional().describe("Page number (default 1)"),
  perPage: z.number().optional().describe("Results per page (default 20, max 100)"),
});
```

**Naming convention for tool names:** `gitlab_` prefix + `snake_case` verb + optional noun (e.g., `gitlab_list_projects`, `gitlab_get_merge_request`, `gitlab_get_ci_config`).

---

*Convention analysis: 2026-05-21*
