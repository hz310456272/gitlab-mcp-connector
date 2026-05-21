# Codebase Concerns

**Analysis Date:** 2026-05-21

## Tech Debt

### Duplicated `byteLength` function across 4 files

- **Issue:** The `byteLength(s: string)` helper (`Buffer.byteLength(s, "utf8")`) is defined independently in 4 separate locations with 3 different function names: `byteLength` in `src/tools/normalize.ts`, `src/tools/ciConfig.ts`, `src/tools/issues.ts`, `src/tools/binary.ts`; and `byteLen` in `src/tools/pipelines.ts`. Only `src/tools/binary.ts` exports it.
- **Files:** `src/tools/normalize.ts:1`, `src/tools/ciConfig.ts:10`, `src/tools/issues.ts:11`, `src/tools/binary.ts:11`, `src/tools/pipelines.ts:37`
- **Impact:** Maintenance risk. Any change to byte measurement semantics (e.g., switching from UTF-8) must be replicated in 5 places. `pipelines.ts` uses the differently-named `byteLen` which adds confusion.
- **Fix approach:** Consolidate all `byteLength`/`byteLen` definitions into `src/tools/binary.ts` (already the canonical export) and import from there in all other files. Remove the local definitions in `normalize.ts`, `ciConfig.ts`, `issues.ts`, and `pipelines.ts`.

### Duplicated `truncateContentInPayload` function in 2 files

- **Issue:** The `truncateContentInPayload(payload, limit)` function is copy-pasted identically between `src/tools/repository.ts` and `src/tools/artifacts.ts`. Both use binary search to truncate a string field within a JSON payload to fit a byte budget.
- **Files:** `src/tools/repository.ts:106-132`, `src/tools/artifacts.ts:95-121`
- **Impact:** Bug fix to the truncation algorithm must be applied twice. Subtle divergence is likely over time.
- **Fix approach:** Extract into a shared helper in `src/tools/helpers.ts` or `src/tools/binary.ts`, then import in both `repository.ts` and `artifacts.ts`.

### Similar truncation logic repeated across 6+ locations

- **Issue:** Beyond the identical `truncateContentInPayload`, there are 5+ more truncation implementations that all follow the same binary-search pattern but with slight variations: `normalizeDiffList` in `src/tools/normalize.ts:205-274`, `normalizeCompareResult` in `src/tools/normalize.ts:578-650`, `getJobLog` in `src/tools/pipelines.ts:41-95`, `truncateIssuePayload` in `src/tools/issues.ts:98-128`, `truncateField` in `src/tools/ciConfig.ts:23-42`.
- **Files:** `src/tools/normalize.ts`, `src/tools/pipelines.ts`, `src/tools/issues.ts`, `src/tools/ciConfig.ts`
- **Impact:** Each variation handles edge cases slightly differently (e.g., the final safety clip in `normalizeDiffList:259-268` vs. the clean binary search in `getJobLog`). This makes the truncation contract inconsistent and harder to reason about. Some implementations may produce payloads that still exceed the byte limit.
- **Fix approach:** Design a single `truncateJsonPayload` utility that accepts a payload object, a field path, and a byte budget, and handles all edge cases consistently. Replace all ad-hoc implementations.

### Hardcoded version strings scattered across 3 files

- **Issue:** The connector version `"0.1.0"` is hardcoded in `src/gitlab/client.ts:5` for the User-Agent header, and again in `src/tools/artifacts.ts:147` for a raw `fetch` call. Meanwhile `src/server.ts:29` uses `"0.3.0"` (the current actual version). The `client.ts` and `artifacts.ts` versions are stale.
- **Files:** `src/gitlab/client.ts:5`, `src/tools/artifacts.ts:147`, `src/server.ts:29`
- **Impact:** User-Agent reports wrong version. Every release requires manual updates in 3 locations. Easy to forget one.
- **Fix approach:** Define the version in a single place (e.g., `src/version.ts` reading from `package.json` or a constant) and import everywhere.

### Config loaded eagerly at module top level in helpers.ts

- **Issue:** `src/tools/helpers.ts:5-12` caches the config via `let cachedConfig: MultiHostConfig | null = null` with `loadConfig()` called lazily on first `getClient()` invocation. However, `loadConfig()` in `src/server.ts:33` is called again at startup with a try/catch that logs the error but continues. If `loadConfig()` fails at startup (e.g., missing token), `cachedConfig` is still null, so any subsequent tool call will re-throw the same error.
- **Files:** `src/tools/helpers.ts:5-12`, `src/server.ts:32-37`
- **Impact:** The server starts (MCP transport connects) even when config is broken. The MCP client sees tools listed but every tool call fails with a config error. This is confusing for users.
- **Fix approach:** Either prevent server startup when config fails, or don't catch the config error at the top level and let the process exit. The current behavior provides a misleading "server is ready" signal.

## Known Bugs

### Artifacts endpoint bypasses GitLabClient (no redaction on error body)

- **Symptoms:** When `getJobArtifactFile` in `src/tools/artifacts.ts:144` encounters an API error, the raw HTTP response body is sliced to 200 chars and returned directly to the client without passing through the `redact()` function. This could leak tokens if GitLab echoes back authentication headers or token values in error responses.
- **Files:** `src/tools/artifacts.ts:144-153`
- **Trigger:** Call `gitlab_get_job_artifact_file` with an invalid project/job, causing GitLab to return an error response that might contain token-like strings.
- **Workaround:** None currently. The error body goes through `toolError(formatApiError(error))` for the catch block (line 200), but the early-return path on line 153 bypasses redaction.
- **Fix approach:** Pass the error body through `redact()` before returning, consistent with how `src/gitlab/client.ts:53` handles it. Refactor `getJobArtifactFile` to use `client.request()` / `client.requestText()` instead of raw `fetch()` so the standard error handling path applies.

### Stale version in User-Agent reported to GitLab API

- **Symptoms:** All API requests sent through `GitLabClient` report `User-Agent: gitlab-mcp-connector/0.1.0`, but the package is at version 0.3.0.
- **Files:** `src/gitlab/client.ts:5-6`
- **Trigger:** Any tool call. Check GitLab API access logs.
- **Fix approach:** Update the constant to match `package.json` version, or better, import dynamically.

## Security Considerations

### Author/committer email addresses exposed through normalize API

- **Risk:** `normalizeCommit` in `src/tools/normalize.ts:411-415` includes `author_email` and `committer_email` in the output. The project's design principle states "output normalize" and the redaction function strips emails from log output, but commit normalizer intentionally includes email addresses in structured data sent to MCP clients.
- **Files:** `src/tools/normalize.ts:394-397` (interface), `src/tools/normalize.ts:411-414` (output)
- **Current mitigation:** Redaction function at `src/redaction.ts:10-12` strips emails from log/error messages but not from tool response data.
- **Recommendations:** If email exposure to MCP clients is considered a privacy leak (especially for private GitLab instances), add an option to strip or hash email addresses in commit output. At minimum, document this behavior in the tool descriptions so clients are aware.

### No request timeout on any HTTP calls

- **Risk:** All `fetch()` calls in `src/gitlab/client.ts:44` and `src/tools/artifacts.ts:144` have no timeout. A misbehaving or slow GitLab instance can cause the MCP server to hang indefinitely, blocking the stdio transport.
- **Files:** `src/gitlab/client.ts:44`, `src/gitlab/client.ts:61`, `src/tools/artifacts.ts:144`
- **Current mitigation:** None. Node.js `fetch()` (undici-based since Node 18) has a default 300s timeout for the overall response, but individual DNS/TCP phases can hang longer depending on configuration.
- **Recommendations:** Add `AbortSignal.timeout(30000)` or similar to all fetch calls. Make the timeout configurable via environment variable for users with slow networks.

### No TLS certificate customization for self-hosted GitLab

- **Risk:** The project design principle states "Private GitLab is a first-class citizen" and "VPN, self-signed certificates, intranet DNS are default deployment forms to support." However, there is no mechanism to configure custom CA certificates or disable TLS verification for self-hosted GitLab instances with self-signed certificates.
- **Files:** `src/gitlab/client.ts:44-49` (no TLS options on fetch)
- **Current mitigation:** Users must work around this with environment variables like `NODE_TLS_REJECT_UNAUTHORIZED=0` (insecure) or `NODE_EXTRA_CA_CERTS` (correct but undocumented).
- **Recommendations:** Add optional TLS configuration to the config schema (e.g., `tls.caCertPath`, `tls.rejectUnauthorized`). At minimum, document `NODE_EXTRA_CA_CERTS` in the self-hosted deployment guide. Never document `NODE_TLS_REJECT_UNAUTHORIZED=0`.

### No retry/backoff for rate-limited (429) responses

- **Risk:** When GitLab returns HTTP 429, the error is formatted as a human-readable message (`src/errors.ts:28-29`) but there is no automatic retry. The MCP client receives `isError: true` and must decide to retry on its own, which most LLM clients won't do.
- **Files:** `src/errors.ts:28-29`, `src/gitlab/client.ts:52-55`
- **Current mitigation:** None. The `Retry-After` header from GitLab is not read or forwarded.
- **Recommendations:** Read the `Retry-After` header from 429 responses and either: (a) implement automatic retry with backoff, or (b) include the `Retry-After` value in the error message so the MCP client can make an informed decision.

### Redaction patterns use greedy regex that may over-match

- **Risk:** The `"token"` pattern in `src/redaction.ts:8` (`/"token"\s*:\s*"[^"]*"/gi`) will match any JSON field named `"token"`, even in tool response payloads where the field value is not a secret. This is intentional for safety but could redact legitimate data in edge cases (e.g., a CI config containing a `token` key that is actually a public value).
- **Files:** `src/redaction.ts:8`
- **Current mitigation:** Redaction is only applied to error/log messages, not to tool response data.
- **Recommendations:** Acceptable as-is since it errs on the side of caution. Document this behavior.

## Performance Bottlenecks

### JSON.stringify called repeatedly during binary-search truncation

- **Problem:** The truncation logic in `normalizeDiffList` (`src/tools/normalize.ts:205-274`) and `normalizeCompareResult` (`src/tools/normalize.ts:578-650`) calls `JSON.stringify()` on the full candidate payload on every iteration of the binary search. For large diffs with many files, this means serializing the entire payload (potentially hundreds of KB) O(log n) times where n is the diff string length.
- **Files:** `src/tools/normalize.ts:224`, `src/tools/normalize.ts:239`, `src/tools/normalize.ts:259-263`, `src/tools/normalize.ts:597-638`
- **Cause:** The truncation algorithm measures total payload size by serializing the entire object to JSON on each iteration.
- **Improvement path:** Pre-compute the overhead size once (JSON of everything except the variable field), then only measure the variable field in the loop. This reduces per-iteration work from O(total_payload_size) to O(field_size).

### New GitLabClient instantiated on every tool call

- **Problem:** `getClient()` in `src/tools/helpers.ts:14-18` creates a new `GitLabClient` instance on every tool invocation. Each client holds `baseUrl` and `token` strings but no connection pooling. Since Node.js `fetch()` does not reuse connections across different `URL` objects by default in all cases, this may prevent HTTP keep-alive across calls.
- **Files:** `src/tools/helpers.ts:14-18`
- **Cause:** Design choice to avoid holding mutable state. Each `getClient()` call also re-resolves the host config (reads env vars, validates).
- **Improvement path:** Cache the `GitLabClient` instance per host key in `helpers.ts` (similar to how config is cached). This preserves the current API but enables connection reuse.

### `normalize.ts` is a 1014-line monolith with 25+ normalizer functions

- **Problem:** All normalizer functions for every GitLab resource type are in a single file. This makes it hard to navigate, slows IDE performance, and makes it likely for merge conflicts in team settings.
- **Files:** `src/tools/normalize.ts` (1014 lines)
- **Cause:** Organic growth from v0.1.0 to v0.3.0 as new tools were added.
- **Improvement path:** Split into domain-based modules: `src/tools/normalize/projects.ts`, `src/tools/normalize/merge-requests.ts`, `src/tools/normalize/pipelines.ts`, etc., with a barrel `src/tools/normalize/index.ts` that re-exports everything.

## Fragile Areas

### Tool registration in server.ts is manual and count-dependent

- **Files:** `src/server.ts:39-67`
- **Why fragile:** Each new tool requires 3 manual steps: (1) import at top, (2) `server.tool()` call with correct name/description/schema/handler, (3) ensure the tool count in tests is updated. The 29 `server.tool()` calls are repetitive and easy to misorder.
- **Safe modification:** When adding a tool, follow the existing import pattern, add the registration call, and run `npm test` to verify. The `mcp-smoke.test.ts` validates tool count.
- **Test coverage:** `tests/mcp-smoke.test.ts` checks tool count but does not verify individual tool names/schemas.

### The `structuredContent` wrapping logic has edge cases

- **Files:** `src/tools/helpers.ts:28-36`
- **Why fragile:** `structuredContentFor()` wraps arrays as `{ items: [...] }`, objects as-is, and primitives as `{ value: ... }`. But in `src/tools/pipelines.ts:84-88`, the `getJobLog` function builds its own `structuredContent` directly in a raw return (bypassing `toolResult()`), creating an inconsistency. If the wrapping convention changes, this manual path won't update.
- **Safe modification:** Always use `toolResult()` for consistency. If custom structuredContent is needed, add a parameter to `toolResult()` instead of bypassing it.
- **Test coverage:** The integration test (`tests/mcp-integration.test.ts`) validates `structuredContent` shape for some tools but not all.

### No pagination header support (auto-pagination not possible)

- **Files:** `src/gitlab/client.ts:43-58`, `src/gitlab/pagination.ts`
- **Why fragile:** The `request<T>()` method only returns the parsed JSON body and discards response headers. GitLab paginates via `X-Next-Page`, `X-Total-Pages`, `X-Total`, and `Link` headers. The current design requires the MCP client to manually page through results by passing `page` and `perPage` parameters, which is cumbersome for LLM-based clients.
- **Safe modification:** Adding header extraction to the response type would require changing the return type of `request<T>()` across all callers.
- **Test coverage:** `tests/pagination.test.ts` tests `normalizePagination` but does not test actual API pagination behavior.

## Scaling Limits

### No connection pooling or concurrency limits

- **Current capacity:** Each tool call makes a single HTTP request (or two sequential requests for `ciConfig`). The stdio transport processes one tool call at a time from the MCP protocol perspective.
- **Limit:** If the MCP client sends rapid-fire tool calls (e.g., an LLM making 10 parallel calls), each creates a new `fetch()` connection. GitLab may rate-limit or the system may exhaust file descriptors.
- **Scaling path:** Add connection pooling (undici's `Agent`) and implement request queuing with concurrency limits.

### Large diff/compare responses require multiple JSON.stringify passes

- **Current capacity:** Diffs and compares are truncated to fit within a byte budget, but the truncation algorithm serializes the full payload multiple times.
- **Limit:** For a 100-file MR diff where each file is 10KB, the initial payload would be ~1MB of JSON. The binary search would serialize this ~13 times, consuming ~13MB of transient memory.
- **Scaling path:** Stream the diff processing instead of materializing the full payload.

## Dependencies at Risk

### `@modelcontextprotocol/sdk` pinned at 1.29.0

- **Risk:** The MCP SDK is the project's core dependency and is evolving rapidly. Pinning at `1.29.0` means missing API improvements and potentially incompatible with newer MCP clients that expect newer protocol features.
- **Impact:** If a future MCP client requires a protocol feature only available in SDK 2.x, the connector will break.
- **Migration plan:** Pin to a minor version range (e.g., `^1.29.0`) and test against pre-release versions periodically. Watch the MCP SDK changelog for breaking changes.

### No runtime dependency on `undici` despite it being a devDependency

- **Risk:** `undici` v6.25.0 is listed in devDependencies (likely for the integration test's mock HTTP server) but not in dependencies. Node.js 18+ bundles undici for `fetch()`, so this is fine. However, if the project ever needs undici features directly (e.g., custom Agent for connection pooling), it would need to be promoted to a runtime dependency.
- **Impact:** Currently none. This is a latent concern.
- **Migration plan:** If connection pooling is added, promote `undici` to dependencies and pin a minimum version.

## Missing Critical Features

### No GitLab API response header forwarding

- **Problem:** GitLab API returns important metadata in response headers (pagination info, rate limit remaining, request ID for debugging). None of this is exposed to the MCP client.
- **Blocks:** Debugging rate limiting issues, implementing auto-pagination, correlating requests in GitLab logs.
- **Impact:** Medium -- users cannot diagnose "why did my request fail" or "how many more requests can I make."

### No logging framework

- **Problem:** The only logging is `console.error()` in `src/server.ts:36` and `src/server.ts:76`. There is no structured logging, no log levels, no request/response tracing. For a connector that proxies sensitive API calls, this makes production debugging very difficult.
- **Blocks:** Production observability, debugging self-hosted GitLab connectivity issues, audit logging for compliance.

### No health check or readiness probe

- **Problem:** The MCP server starts the stdio transport but does not validate that the configured GitLab instance is reachable. A misconfigured or unreachable GitLab means every tool call fails, but the server itself appears healthy.
- **Blocks:** Automation that depends on the connector being "ready" to serve requests.

## Test Coverage Gaps

### Artifact download path (raw fetch bypass) has limited error testing

- **What's not tested:** The `getJobArtifactFile` function's raw `fetch` call in `src/tools/artifacts.ts:144-153` has its own error path that bypasses `GitLabClient` entirely. Error scenarios specific to this path (network timeout, non-JSON error responses, binary data handling edge cases) are not covered by tests that use the standard mock pattern.
- **Files:** `src/tools/artifacts.ts:131-202`, `tests/tools/artifacts.test.ts`
- **Risk:** Subtle differences in error handling between the `GitLabClient.request()` path and the raw `fetch` path could cause data leaks or confusing errors.
- **Priority:** High

### `getJobLog` manual structuredContent path not tested

- **What's not tested:** The early-return path in `src/tools/pipelines.ts:84-88` where `structuredContent` is manually constructed instead of going through `toolResult()`. This path is only hit when the final safety check detects the payload exceeds the byte limit.
- **Files:** `src/tools/pipelines.ts:79-89`, `tests/tools/pipelines.test.ts`
- **Risk:** If this path returns a malformed response, MCP clients may crash or fail silently.
- **Priority:** Medium

### Config caching and multi-host switching not tested end-to-end

- **What's not tested:** The `cachedConfig` singleton in `src/tools/helpers.ts` is only reset via `resetConfigForTests()` in test setup. There is no test that verifies config is loaded once and reused, nor any test that verifies switching hosts between tool calls works correctly with the cached config.
- **Files:** `src/tools/helpers.ts:5-12`, `tests/config.test.ts`
- **Risk:** A bug in config caching could cause all tool calls to use the wrong host, silently sending tokens to the wrong GitLab instance.
- **Priority:** Medium

### `structuredContentFor` wrapping logic has no dedicated tests

- **What's not tested:** The `structuredContentFor()` function in `src/tools/helpers.ts:28-36` wraps arrays as `{ items: [...] }` and primitives as `{ value: ... }`. There is no direct unit test for this function.
- **Files:** `src/tools/helpers.ts:28-36`
- **Risk:** A regression here would affect the structuredContent format for all 29 tools simultaneously.
- **Priority:** Low (indirectly tested via integration tests)

---

*Concerns audit: 2026-05-21*
