# Testing Patterns

**Analysis Date:** 2026-05-21

## Test Framework

**Runner:**
- Vitest 3+
- Config: `vitest.config.ts`

**Assertion Library:**
- Built-in Vitest `expect` (no separate assertion library)

**HTTP Mocking:**
- `undici` `MockAgent` + `setGlobalDispatcher` for mocking `fetch` in tool unit tests
- `node:http` `createServer` for MCP integration tests (mock GitLab server)

**Run Commands:**
```bash
npm test              # Run all tests once
npm run test:watch    # Watch mode (vitest)
```

## Test File Organization

**Location:**
- Top-level tests in `tests/` (root-level test files for shared concerns)
- Tool-specific tests in `tests/tools/` (mirroring `src/tools/` structure)

**Naming:**
- `*.test.ts` -- every test file follows this pattern
- Test file names match their source module name: `projects.test.ts`, `mergeRequests.test.ts`, `normalize.test.ts`, etc.

**Structure:**
```
tests/
  client-errors.test.ts     # Error class and formatApiError tests
  config.test.ts            # Config loading and host resolution tests
  mcp-integration.test.ts   # MCP protocol integration (real server subprocess)
  mcp-smoke.test.ts         # MCP server startup and tool listing
  pagination.test.ts        # Pagination utility tests
  redaction.test.ts         # Token/email redaction tests
  tools/
    artifacts.test.ts       # Artifact tool tests
    ciConfig.test.ts        # CI config tool tests
    commits.test.ts         # Commit tool tests
    groups.test.ts          # Group tool tests
    helpers.test.ts         # Shared helper (toolResult) tests
    issues.test.ts          # Issue tool tests
    labels.test.ts          # Label tool tests
    mergeRequests.test.ts   # MR tool tests
    milestones.test.ts      # Milestone tool tests
    normalize.test.ts       # All normalizer function tests (largest test file)
    pipelines.test.ts       # Pipeline tool tests
    projects.test.ts        # Project tool tests
    releases.test.ts        # Release tool tests
    repository.test.ts      # Repository tool tests
    search.test.ts          # Search tool tests
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MockAgent, setGlobalDispatcher } from "undici";
import { listProjects, getProject } from "../../src/tools/projects.js";
import { resetConfigForTests } from "../../src/tools/helpers.js";

describe("projects tools", () => {
  let mockAgent: MockAgent;

  beforeEach(() => {
    vi.stubEnv("GITLAB_BASE_URL", "https://gitlab.example.com");
    vi.stubEnv("GITLAB_TOKEN", "test-token");
    resetConfigForTests();
    mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
    setGlobalDispatcher(mockAgent);
  });

  afterEach(() => {
    mockAgent.close();
    vi.unstubAllEnvs();
  });

  describe("listProjects", () => {
    it("returns normalized project list without extra fields", async () => { /* ... */ });
    it("sends correct query params and pagination", async () => { /* ... */ });
    it("returns error on 401", async () => { /* ... */ });
  });

  describe("getProject", () => {
    it("returns normalized project details without extra fields", async () => { /* ... */ });
    it("handles project ID", async () => { /* ... */ });
    it("returns error for non-existent project", async () => { /* ... */ });
  });
});
```

**Patterns:**
- **Setup:** `beforeEach` stubs env vars (`GITLAB_BASE_URL`, `GITLAB_TOKEN`), resets config cache via `resetConfigForTests()`, creates `MockAgent`, disables real network, and sets global dispatcher
- **Teardown:** `afterEach` closes mock agent and unstubs all env vars
- **Nested describes:** Top-level describe matches the domain; nested describes match individual tool functions
- **Pure function tests** (normalize, pagination, redaction, errors): No mocking needed; just import and test directly with `describe/it/expect`

## Mocking

**Framework:** `undici` `MockAgent` (intercepts `fetch` at the HTTP layer)

**Patterns:**
```typescript
// Mock a GET request
mockAgent
  .get("https://gitlab.example.com")
  .intercept({ path: /\/api\/v4\/projects/, method: "GET" })
  .reply(200, [fullProjectResponse]);

// Mock with precise path assertion
pool
  .intercept({
    path: (p: string) => {
      expect(p).toContain("search=my-project");
      expect(p).toContain("page=2");
      return p.includes("/api/v4/projects");
    },
    method: "GET",
  })
  .reply(200, []);
```

**What to Mock:**
- All outgoing HTTP requests to GitLab API (via `MockAgent`)
- Environment variables via `vi.stubEnv()` and `vi.unstubAllEnvs()`
- Config cache via `resetConfigForTests()` (resets module-level singleton)

**What NOT to Mock:**
- Normalizer functions (tested as pure functions with no mocking)
- Error formatters (tested directly)
- Redaction logic (tested directly)
- Pagination utilities (tested directly)

## Fixtures and Factories

**Test Data:**
- Defined inline at the top of each `describe` block
- Named with descriptive `const` names (e.g., `fullProjectResponse`, `fullMrResponse`, `fullJobResponse`)
- Include all fields from real GitLab API responses (including extra/unstable fields) to verify normalization strips them

**Pattern:**
```typescript
const fullProjectResponse = {
  id: 1,
  name: "project-a",
  path_with_namespace: "group/project-a",
  // ... stable fields ...
  owner: { name: "admin", email: "admin@example.com" },      // stripped by normalizer
  permissions: { project_access: { access_level: 40 } },      // stripped by normalizer
  avatar_url: "https://example.com/avatar.png",              // stripped by normalizer
};
```

**Location:**
- Fixtures live at the top of their respective test file's `describe` block
- No shared fixture files or factory modules

## Coverage

**Requirements:** None enforced (no coverage threshold configured)

**View Coverage:**
```bash
npx vitest run --coverage   # Requires @vitest/coverage-v8 (not installed)
```

**Coverage approach:** Tests focus on correctness rather than coverage metrics. Every tool has at least one happy-path test and one error-path test.

## Test Types

**Unit Tests:**
- Scope: Individual functions -- normalizers, error formatters, pagination, redaction, config loading
- Approach: Direct function calls with expected inputs/outputs
- Files: `tests/tools/normalize.test.ts`, `tests/pagination.test.ts`, `tests/redaction.test.ts`, `tests/client-errors.test.ts`, `tests/tools/helpers.test.ts`

**Tool Unit Tests (HTTP-mocked):**
- Scope: Individual tool handlers with mocked GitLab API responses
- Approach: `MockAgent` intercepts fetch calls; tests verify both response content and side effects (correct API paths/params)
- Files: `tests/tools/*.test.ts` (except `helpers.test.ts` and `normalize.test.ts`)
- Pattern: Each tool gets its own `describe` block with tests for: happy path, error responses (401/404), parameter validation via Zod, and normalization of extra fields

**Integration Tests (MCP protocol):**
- Scope: Full MCP server startup via subprocess, protocol handshake, tool listing, and actual tool calls
- Approach: `StdioClientTransport` spawns `npx tsx src/server.ts`; `node:http` mock GitLab server provides fake API responses
- Files: `tests/mcp-smoke.test.ts` (handshake + tool count), `tests/mcp-integration.test.ts` (actual tool calls with `callTool`)
- These tests verify the MCP wire protocol (structuredContent, content arrays, isError flags)

**E2E Tests:**
- Not used (no browser or external service tests)

## Common Patterns

**Async Testing:**
```typescript
it("returns normalized project list", async () => {
  mockAgent.get("...").intercept({...}).reply(200, [...]);
  const result = await listProjects({});
  expect(result.isError).toBe(false);
  const parsed = JSON.parse(result.content[0].text);
  expect(parsed).toHaveLength(1);
});
```

**Error Testing:**
```typescript
it("returns error on 401", async () => {
  mockAgent.get("...").intercept({...}).reply(401, { message: "Unauthorized" });
  const result = await listProjects({});
  expect(result.isError).toBe(true);
  expect(result.content[0].text).toContain("Authentication failed");
});
```

**Normalization Testing (verify extra fields stripped):**
```typescript
it("returns normalized MRs with reviewers (username/name only)", async () => {
  // ... mock with full API response including extra fields ...
  expect(mr.author.id).toBeUndefined();
  expect(mr.author.avatar_url).toBeUndefined();
  expect(mr.permissions).toBeUndefined();
});
```

**Environment Variable Testing:**
```typescript
describe("loadConfig", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    delete process.env.GITLAB_BASE_URL;
    delete process.env.GITLAB_TOKEN;
    delete process.env.GITLAB_MCP_CONFIG;
  });

  it("throws when GITLAB_TOKEN is missing", () => {
    expect(() => loadConfig()).toThrow("GITLAB_TOKEN is required");
  });
});
```

**UTF-8 / Multi-byte Truncation Testing:**
Several tools include explicit tests for CJK character truncation:
```typescript
it("correctly truncates multi-byte UTF-8 diff content", async () => {
  const cjkDiff = "修复登录问题：新增验证逻辑\n" + "中文注释行\n".repeat(50);
  // ... verify payloadBytes <= limit with multi-byte content ...
});
```

**Path Validation Testing:**
```typescript
it("validates artifact path segments", async () => {
  const result = await getJobArtifactFile({ projectIdOrPath: "123", jobId: 1, artifactPath: "../etc/passwd" });
  expect(result.isError).toBe(true);
});
```

---

*Testing analysis: 2026-05-21*
