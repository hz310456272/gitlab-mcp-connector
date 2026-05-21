# Codebase Structure

**Analysis Date:** 2026-05-21

## Directory Layout

```
gitlab-mcp-connector/
├── src/                          # TypeScript source (compiled to dist/)
│   ├── server.ts                 # MCP server entry point, tool registration
│   ├── config.ts                 # Multi-host config loading and validation
│   ├── errors.ts                 # Custom error types and message formatting
│   ├── redaction.ts              # Token/email redaction patterns
│   ├── gitlab/                   # GitLab API client layer
│   │   ├── client.ts             # HTTP client with PRIVATE-TOKEN auth
│   │   └── pagination.ts         # Pagination param normalization
│   └── tools/                    # MCP tool implementations (one file per domain)
│       ├── helpers.ts            # Shared: getClient(), toolResult(), toolError()
│       ├── normalize.ts          # Output normalizers for all GitLab resource types
│       ├── binary.ts             # Binary detection and byte-length utility
│       ├── projects.ts           # gitlab_list_projects, gitlab_get_project
│       ├── mergeRequests.ts      # list/get/diff/comments/pipelines MR tools
│       ├── pipelines.ts          # gitlab_get_pipeline_jobs, gitlab_get_job_log
│       ├── repository.ts         # branches, tags, tree, file content tools
│       ├── commits.ts            # list/get commits, compare refs
│       ├── issues.ts             # gitlab_list_issues, gitlab_get_issue
│       ├── labels.ts             # gitlab_list_labels
│       ├── milestones.ts         # gitlab_list_milestones
│       ├── releases.ts           # gitlab_list_releases, gitlab_get_release
│       ├── groups.ts             # gitlab_list_groups, gitlab_get_group, gitlab_list_group_projects
│       ├── search.ts             # gitlab_search (multi-scope)
│       ├── ciConfig.ts           # gitlab_get_ci_config (file + lint)
│       └── artifacts.ts          # gitlab_list_job_artifacts, gitlab_get_job_artifact_file
├── tests/                        # Test files (mirror src/ structure)
│   ├── config.test.ts            # Config loading and validation tests
│   ├── client-errors.test.ts     # Error handling tests
│   ├── mcp-integration.test.ts   # Full MCP stdio integration tests
│   ├── mcp-smoke.test.ts         # Smoke tests
│   ├── pagination.test.ts        # Pagination normalization tests
│   ├── redaction.test.ts         # Token redaction tests
│   └── tools/                    # Tool-specific unit tests (mirror src/tools/)
│       ├── helpers.test.ts       # toolResult/toolError helper tests
│       ├── normalize.test.ts     # Normalizer function tests
│       ├── projects.test.ts      # Projects tool tests
│       ├── mergeRequests.test.ts # MR tool tests
│       ├── pipelines.test.ts     # Pipeline tool tests
│       ├── repository.test.ts    # Repository tool tests
│       ├── commits.test.ts       # Commit tool tests
│       ├── issues.test.ts        # Issue tool tests
│       ├── labels.test.ts        # Label tool tests
│       ├── milestones.test.ts    # Milestone tool tests
│       ├── releases.test.ts      # Release tool tests
│       ├── groups.test.ts        # Group tool tests
│       ├── search.test.ts        # Search tool tests
│       ├── ciConfig.test.ts      # CI config tool tests
│       └── artifacts.test.ts     # Artifact tool tests
├── dist/                         # Compiled JavaScript output (git-ignored in dev, committed in release)
├── docs/                         # Documentation (Chinese + English pairs)
├── examples/                     # Client configuration examples
│   ├── claude-code/              # Claude Code MCP config example
│   ├── codex/                    # Codex MCP config example
│   └── cursor/                   # Cursor MCP config example
├── scripts/                      # Utility scripts
│   └── scan-sensitive.sh         # Sensitive information scanner
├── .github/workflows/            # CI/CD pipeline definitions
│   └── ci.yml                    # GitHub Actions CI workflow
├── .claude/                      # Claude Code local project memory (not committed)
├── .planning/                    # Planning documents (GSD workflow)
└── package.json                  # npm manifest (v0.3.0)
```

## Directory Purposes

**`src/`:**
- Purpose: All TypeScript source code for the MCP server
- Contains: Entry point, config, error types, redaction, GitLab API client, MCP tool implementations
- Key files: `src/server.ts` (entry), `src/config.ts` (config), `src/tools/helpers.ts` (shared tool infrastructure)

**`src/gitlab/`:**
- Purpose: GitLab REST API v4 HTTP client abstraction
- Contains: `client.ts` (HTTP client), `pagination.ts` (pagination utilities)
- Key files: `src/gitlab/client.ts`

**`src/tools/`:**
- Purpose: MCP tool implementations, one file per GitLab resource domain plus shared utilities
- Contains: Zod schemas, handler functions, tool definition exports, normalizers, binary detection
- Key files: `src/tools/helpers.ts` (shared infrastructure), `src/tools/normalize.ts` (all normalizers)

**`tests/`:**
- Purpose: Unit and integration tests mirroring the `src/` structure
- Contains: Top-level tests (config, errors, integration) plus `tests/tools/` for tool-specific tests
- Key files: `tests/mcp-integration.test.ts` (full MCP protocol tests), `tests/tools/normalize.test.ts` (largest test file)

**`docs/`:**
- Purpose: User-facing documentation in Chinese (default) and English pairs
- Contains: `*.md` (Chinese) and `*.en.md` (English) for each topic
- Key files: `docs/configuration.md`, `docs/security.md`, `docs/client-compatibility.md`

**`examples/`:**
- Purpose: Client-specific MCP configuration examples
- Contains: One subdirectory per supported client (claude-code, codex, cursor)

**`dist/`:**
- Purpose: Compiled JavaScript output from TypeScript build
- Generated: Yes (by `tsc -p tsconfig.build.json`)
- Committed: Yes (shipped in npm package)

**`scripts/`:**
- Purpose: Development and release utility scripts
- Contains: `scan-sensitive.sh` for detecting leaked secrets in the codebase

## Key File Locations

**Entry Points:**
- `src/server.ts`: Main entry point; creates MCP server, registers tools, starts stdio transport. Also exported for test use.
- `dist/server.js`: Compiled production entry. Referenced by `package.json` `"main"` and `"bin"` fields.

**Configuration:**
- `src/config.ts`: Config loading (`loadConfig()`), host resolution (`resolveHost()`), validation. Supports simple mode (env vars) and multi-host mode (JSON file).
- `package.json`: npm manifest with scripts (`build`, `test`, `lint`, `typecheck`, `scan`).

**Core Logic:**
- `src/gitlab/client.ts`: HTTP client wrapping `fetch()` with GitLab auth headers and pagination.
- `src/tools/normalize.ts`: All output normalization functions (~1014 lines, 30+ normalizer functions).
- `src/tools/helpers.ts`: Shared tool infrastructure (`getClient()`, `toolResult()`, `toolError()`, config caching).

**Testing:**
- `tests/mcp-integration.test.ts`: End-to-end MCP stdio tests using `@modelcontextprotocol/sdk` client + mock GitLab HTTP server.
- `tests/tools/`: Unit tests for each tool module using `undici` MockAgent for HTTP mocking.
- `vitest.config.ts`: Vitest configuration (includes `tests/**/*.test.ts`).

## Naming Conventions

**Files:**
- Source files: camelCase (e.g., `mergeRequests.ts`, `ciConfig.ts`)
- Test files: Match source name + `.test.ts` suffix (e.g., `mergeRequests.test.ts`, `ciConfig.test.ts`)
- Documentation: lowercase-with-hyphens (e.g., `client-compatibility.md`, `self-hosted-gitlab.md`)

**Directories:**
- Domain directories: camelCase (e.g., `src/gitlab/`, `src/tools/`)
- Client examples: lowercase-with-hyphens (e.g., `claude-code/`, `claude-code/`)
- Tool names (MCP): snake_case with `gitlab_` prefix (e.g., `gitlab_list_projects`, `gitlab_get_merge_request_diff`)

**Tool exports:**
- Handler functions: camelCase matching the operation (e.g., `listProjects`, `getMergeRequestDiff`)
- Tool definition objects: camelCase with `Tool` suffix (e.g., `listProjectsTool`, `getMergeRequestDiffTool`)
- Zod schemas: camelCase with `Schema` suffix (e.g., `listProjectsSchema`, `getMergeRequestDiffSchema`)
- Normalize functions: camelCase with `normalize` prefix + resource name (e.g., `normalizeProject`, `normalizeMergeRequestList`)

**MCP tool names:**
- Format: `gitlab_` + verb + `_` + resource (e.g., `gitlab_list_projects`, `gitlab_get_merge_request`, `gitlab_compare_refs`, `gitlab_get_ci_config`)
- All 29 tools follow this prefix convention

## Where to Add New Code

**New GitLab tool (e.g., "epics"):**
1. Create implementation: `src/tools/epics.ts`
   - Define Zod schema (`listEpicsSchema`)
   - Implement handler (`listEpics()`)
   - Export tool definition (`listEpicsTool = { name, description, schema, handler }`)
   - Follow the standard pattern: `getClient(host)` -> `client.request()` -> `normalize*()` -> `toolResult()`
2. Add normalizers to `src/tools/normalize.ts` (or co-locate in the tool file)
   - Define internal `GitLabEpic` interface
   - Export `normalizeEpic()` and `normalizeEpicList()`
3. Register in `src/server.ts`:
   - Add import: `import { listEpicsTool } from "./tools/epics.js"`
   - Add registration: `server.tool(listEpicsTool.name, ...)`
4. Create test file: `tests/tools/epics.test.ts`
   - Follow existing test patterns (undici MockAgent, `resetConfigForTests()` in beforeEach)

**New shared utility:**
- Pure functions: Add to `src/tools/binary.ts` (byte-level utilities) or create `src/tools/utils.ts`
- Tool output helpers: Add to `src/tools/helpers.ts`

**New cross-cutting concern:**
- New error type: Add to `src/errors.ts`
- New redaction pattern: Add to `src/redaction.ts`
- New config option: Add to `src/config.ts`

**New documentation:**
- Create paired files: `docs/topic.md` (Chinese) + `docs/topic.en.md` (English)
- Add cross-links at the top of each file per project documentation rules

## Special Directories

**`dist/`:**
- Purpose: Compiled JavaScript output from TypeScript
- Generated: Yes (`npm run build` -> `tsc -p tsconfig.build.json`)
- Committed: Yes (included in npm package via `package.json` `"files"` field)

**`.claude/`:**
- Purpose: Claude Code project memory and local rules (not committed to GitHub)
- Generated: No
- Committed: No (excluded via `.gitignore`)

**`.planning/`:**
- Purpose: GSD workflow planning documents
- Generated: Yes (by GSD commands)
- Committed: Depends on project convention

**`node_modules/`:**
- Purpose: npm dependencies
- Generated: Yes (`npm install`)
- Committed: No (standard `.gitignore`)

**`examples/`:**
- Purpose: Client-specific MCP configuration examples for Claude Code, Codex, Cursor
- Generated: No
- Committed: Yes

**`scripts/`:**
- Purpose: Development/utility scripts (currently only `scan-sensitive.sh`)
- Generated: No
- Committed: Yes

---

*Structure analysis: 2026-05-21*
