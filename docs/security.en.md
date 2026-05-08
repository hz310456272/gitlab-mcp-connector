# Security

> 中文版见 [security.md](security.md)。

## Read-only by design

This MCP server only exposes read operations against the GitLab API. It will never:

- Merge a merge request
- Approve a merge request
- Push commits or create branches
- Create, update, or delete MRs, comments, or issues
- Retry or cancel pipelines
- Trigger jobs
- Modify any GitLab resource

The server does not contain any code path that makes `POST`, `PUT`, `PATCH`, or `DELETE` requests to GitLab.

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

## User-Agent

All API requests include the header `User-Agent: gitlab-mcp-connector/<version>` for identification and debugging.
