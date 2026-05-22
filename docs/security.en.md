# Security

> 中文版见 [security.md](security.md)

## Read-only by default

This MCP server only exposes **read-only** tools by default. Without the `write` toolset configured:

- `tools/list` returns no write tools
- Write code paths are never triggered
- Behavior is identical to a pure read-only server

## Controlled write capabilities (v0.4.0)

When write tools are enabled via `GITLAB_TOOLSETS="write"` or `"toolsets": "write"` in config.json, 7 additional write operations are exposed. Write tools are protected by the following safety mechanisms:

### Risk levels

| Level | Operations | Requires confirm |
|-------|-----------|------------------|
| LOW | Create issue, create MR, MR comment, issue comment | No |
| HIGH | Retry job, cancel pipeline, cancel job | Yes |

HIGH-risk operations require `confirm: true` to proceed; otherwise they are rejected.

### Write-safety middleware

Every write tool passes through a unified middleware pipeline:

1. **dryRun preview** — `dryRun: true` returns a request summary without calling the API
2. **confirm gate** — HIGH-risk operations require `confirm: true`
3. **Dedup window** — duplicate requests within a short window return cached results
4. **Audit log** — structured JSON emitted to stderr (no tokens)

### Audit log format

```json
{
  "timestamp": "2026-05-22T01:00:00.000Z",
  "tool": "gitlab_create_issue",
  "method": "POST",
  "path": "/projects/group%2Fproject/issues",
  "risk_level": "low",
  "status": "success"
}
```

Status values: `preview` (dryRun), `rejected` (no confirm), `success`, `error`.

### Required token scopes

- Read tools: at minimum `read_api` scope
- Write tools: requires `api` scope
- CI operations (retry / cancel): requires `api` scope and the user must have appropriate project permissions

## Token handling

- Tokens are read from environment variables only. They are never stored in files by this server.
- Tokens are sent to GitLab via the `PRIVATE-TOKEN` header over HTTPS.
- Token values are **never** printed to stdout, stderr, log output, or error messages.

## Output redaction

**API error responses** are passed through a redaction filter before being returned. The redaction handles:

| Pattern | Replacement |
|---------|-------------|
| `PRIVATE-TOKEN: <value>` | `PRIVATE-TOKEN: [REDACTED]` |
| `Authorization: Bearer <value>` | `Authorization: Bearer [REDACTED]` |
| `private_token=<value>` (query param) | `private_token=[REDACTED]` |
| `access_token=<value>` (query param) | `access_token=[REDACTED]` |
| `"private_token":"<value>"` (JSON) | `"private_token":"[REDACTED]"` |
| `"access_token":"<value>"` (JSON) | `"access_token":"[REDACTED]"` |
| `"token":"<value>"` (JSON) | `"token":"[REDACTED]"` |
| Email addresses | `[EMAIL REDACTED]` |

## Output normalization

Tool responses are normalized to include only stable, useful fields. Raw GitLab API metadata fields such as `permissions`, `avatar_url`, `statistics`, `runner`, `artifacts`, or `failure_reason` are filtered out.

**Important**: User-generated content is returned as-is. MR comment bodies, diff text, and job log output may contain sensitive information (API keys, credentials, internal URLs) committed by users. The connector does not scan or filter this content. The calling agent is responsible for handling it appropriately.

## Truncation

Large outputs (MR diffs, job logs) are truncated to stay within configurable byte limits. Limits are measured in **UTF-8 bytes**. When truncation occurs, the response includes `truncated: true`. With very small limits, the content may be empty but the `truncated` flag will be set.

Affected tools:

- `gitlab_get_merge_request_diff` — `maxBytes` limits total JSON payload size; truncates diff array by file when exceeded.
- `gitlab_get_job_log` — `maxBytes` limits total JSON payload size (default 200KB).

## User-Agent

All API requests include the header `User-Agent: gitlab-mcp-connector/<version>` for identification and debugging.
