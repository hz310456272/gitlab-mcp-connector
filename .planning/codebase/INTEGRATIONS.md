# External Integrations

**Analysis Date:** 2026-05-21

## APIs & External Services

**GitLab REST API (v4):**
- Primary integration - all 29 MCP tools are thin wrappers over GitLab API endpoints
- Client implementation: `src/gitlab/client.ts` (`GitLabClient` class)
- Base URL construction: `${baseUrl}/api/v4${path}` (see `GitLabClient.buildUrl()`)
- HTTP transport: Node.js native `fetch`
- Authentication: `PRIVATE-TOKEN` header (Personal Access Token)
- User-Agent: `gitlab-mcp-connector/0.1.0`
- Content negotiation: `Accept: application/json` (JSON responses), `Accept: text/plain` (raw text e.g., job logs)
- No SDK used -- direct HTTP calls to GitLab REST API v4

**GitLab API endpoints consumed:**
| Category | Endpoints | Tool File |
|----------|-----------|-----------|
| Projects | `/projects`, `/projects/:id` | `src/tools/projects.ts` |
| Repository | `/projects/:id/repository/branches`, `/tags`, `/tree`, `/files/:path` | `src/tools/repository.ts` |
| Merge Requests | `/projects/:id/merge_requests`, `/diffs`, `/discussions`, `/pipelines` | `src/tools/mergeRequests.ts` |
| Pipelines | `/projects/:id/pipelines/:id/jobs`, `/jobs/:id/trace` | `src/tools/pipelines.ts` |
| Commits | `/projects/:id/repository/commits`, `/compare` | `src/tools/commits.ts` |
| Issues | `/projects/:id/issues` | `src/tools/issues.ts` |
| Labels | `/projects/:id/labels` | `src/tools/labels.ts` |
| Milestones | `/projects/:id/milestones` | `src/tools/milestones.ts` |
| Releases | `/projects/:id/releases` | `src/tools/releases.ts` |
| Groups | `/groups`, `/groups/:id`, `/groups/:id/projects` | `src/tools/groups.ts` |
| Search | `/search`, `/projects/:id/search`, `/groups/:id/search` | `src/tools/search.ts` |
| CI Config | `/projects/:id/ci/lint` | `src/tools/ciConfig.ts` |
| Artifacts | `/jobs/:id`, `/jobs/:id/artifacts/:path` | `src/tools/artifacts.ts` |

**MCP Protocol:**
- Server implementation via `@modelcontextprotocol/sdk`
- Transport: stdio (`StdioServerTransport`) -- communicates over stdin/stdout with MCP clients
- Protocol version: `"2025-11-25"` (seen in CI smoke test)
- Capabilities: `tools/list`, `tools/call` (standard MCP)
- Output format: dual `content` (text) + `structuredContent` (typed JSON)
- Registration: Each tool uses `server.tool(name, description, schema.shape, handler)` pattern

## Data Storage

**Databases:**
- None. The connector is stateless -- no database, no persistent cache, no file-based storage.

**File Storage:**
- None. All data is fetched on-demand from GitLab API and returned directly to the MCP client.

**Caching:**
- Config caching only: `cachedConfig` module-level variable in `src/tools/helpers.ts` avoids re-reading config file on every tool call. Reset via `resetConfigForTests()` in tests.

## Authentication & Identity

**Auth Provider:**
- GitLab Personal Access Token (PAT) -- self-managed, not proxied through any identity provider
- Implementation: `PRIVATE-TOKEN` HTTP header sent with every API request
- Token is never stored in client config files -- always loaded from environment variables
- Token redaction: `src/redaction.ts` strips tokens from all stdout/stderr output and error messages
  - Patterns redacted: `PRIVATE-TOKEN:`, `Authorization: Bearer`, `private_token=`, `access_token=`, `"token":`, email addresses

**Multi-host support:**
- Multiple GitLab instances supported via `GITLAB_MCP_CONFIG` JSON config file
- Each host maps to a different environment variable for its token
- Tool parameter `host` selects which GitLab instance to query

## Monitoring & Observability

**Error Tracking:**
- None. No external error tracking service integrated.

**Logs:**
- Minimal logging: `console.error()` only for startup config errors and fatal errors in `src/server.ts`
- All output through stdio is MCP protocol messages -- no log lines mixed into the protocol stream
- Error responses to clients include user-friendly messages via `formatApiError()` in `src/errors.ts`
  - 401 -> "Authentication failed"
  - 403 -> "Access denied"
  - 404 -> "Resource not found"
  - 429 -> "Rate limited"
  - 5xx -> "GitLab server error"

## CI/CD & Deployment

**Hosting:**
- npm registry (package distribution)
- Docker (container distribution via `Dockerfile`)
- GitHub repository: `https://github.com/hz310456272/gitlab-mcp-connector`

**CI Pipeline:**
- GitHub Actions (`.github/workflows/ci.yml`)
- Triggers: push to `main`, PRs to `main`
- Matrix: Node.js 20 and 22
- Quality gate steps: typecheck, lint, test, build, pack validation, sensitive info scan
- Docker build step: builds image, verifies server starts and exposes 29 tools via MCP protocol handshake

## Environment Configuration

**Required env vars (simple mode):**
- `GITLAB_TOKEN` -- GitLab Personal Access Token

**Optional env vars (simple mode):**
- `GITLAB_BASE_URL` -- GitLab instance URL (default: `https://gitlab.com`)

**Multi-host mode:**
- `GITLAB_MCP_CONFIG` -- Path to JSON config file
- Per-host token env vars as defined in config (e.g., `GITLAB_COMPANY_TOKEN`)

**Secrets location:**
- Environment variables only (set in shell profile, `.env.gitlab-mcp` file, or MCP client env config)
- Wrapper script `examples/claude-code/run-gitlab-mcp.sh` sources `~/.env.gitlab-mcp` for env var injection
- Tokens are NEVER written to MCP client JSON config files (`claude-code/mcp.json`, `cursor/mcp.json`, `codex/config.json`)

## Webhooks & Callbacks

**Incoming:**
- None. The server is a stdio subprocess -- it has no HTTP listener, no webhook endpoints.

**Outgoing:**
- None. All communication is synchronous request-response: MCP client -> stdio -> GitLab API -> response.

## Client Integrations

The connector is designed to be consumed by MCP-compatible AI coding assistants. Verified clients:

| Client | Config Location | Example File |
|--------|----------------|-------------|
| Claude Code | `claude-code/mcp.json` | `examples/claude-code/mcp.json` |
| OpenAI Codex | `codex/config.json` | `examples/codex/config.json` |
| Cursor | `cursor/mcp.json` | `examples/cursor/mcp.json` |

All clients spawn the connector as a child process via `node dist/server.js` and communicate over stdio.

---

*Integration audit: 2026-05-21*
