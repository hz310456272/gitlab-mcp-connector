# Client Compatibility

> 中文版见 [client-compatibility.md](client-compatibility.md)。

This document captures the verified status, setup steps, validation tools, and known notes for each MCP client used with `gitlab-mcp-connector`.

## Compatibility Matrix

| Client | Status | Verified scope |
|--------|--------|----------------|
| Claude Code | Tested | Full read-only workflow against a self-hosted GitLab instance |
| Codex | Tested | `gitlab_get_project`, `gitlab_list_branches`, `gitlab_list_merge_requests` |
| Cursor | Tested | MCP server loads with 29 tools enabled; single-tool `gitlab_list_branches` call returns expected branches |

All three clients use the same stdio MCP server. Differences below are about how each client is configured, not about server behavior.

## Shared Setup Assumptions

- **Transport**: stdio MCP server (`dist/server.js`). No HTTP/SSE.
- **Token handling**: never write `GITLAB_TOKEN` (or any other secret) into the client's MCP config file. Keep tokens in a separate env file or system secret store.
- **Wrapper script**: each client launches the connector through a small wrapper (e.g. `run-gitlab-mcp.sh`) that sources the env file and execs `node dist/server.js`. See `examples/claude-code/run-gitlab-mcp.sh` for a reference implementation; the same script works for Codex and Cursor.
- **Read-only**: all 29 tools are read-only. Verification flows below intentionally use only read operations.

## Claude Code

- **Config file**: `~/.claude.json` (global) or `.claude/settings.json` (per-project).
- **Recommended entry**: point `command` at the wrapper, not directly at `node`. This keeps the token outside `~/.claude.json`.

```json
{
  "mcpServers": {
    "gitlab": {
      "command": "/absolute/path/to/run-gitlab-mcp.sh"
    }
  }
}
```

Restart Claude Code after editing the config so it re-reads `mcpServers`.

### Verification tools

Run these in order — each one exercises a different code path (project lookup, repository read, MR listing):

1. `gitlab_get_project` with `projectIdOrPath: "group/project"`
2. `gitlab_list_branches` with `projectIdOrPath: "group/project"`
3. `gitlab_list_merge_requests` with `projectIdOrPath: "group/project"`, `state: "opened"`

If all three return non-error results, the connector is healthy on Claude Code.

## Codex

- **Config entry**: use `codex mcp add` (preferred) or edit `~/.codex/config.toml` directly.
- Like Claude Code, point Codex at the wrapper script so secrets stay out of `~/.codex/config.toml`.

```bash
codex mcp add gitlab -- /absolute/path/to/run-gitlab-mcp.sh
codex mcp list
codex mcp get gitlab
```

`codex mcp list` should show `gitlab` registered. `codex mcp get gitlab` should report the configured command.

### Verification tools

Same as Claude Code:

1. `gitlab_get_project` with `projectIdOrPath: "group/project"`
2. `gitlab_list_branches` with `projectIdOrPath: "group/project"`
3. `gitlab_list_merge_requests` with `projectIdOrPath: "group/project"`, `state: "opened"`

## Cursor

- **Config file**: `~/.cursor/mcp.json`.
- Append the `gitlab` entry under `mcpServers` — **do not overwrite** any existing servers there.

```json
{
  "mcpServers": {
    "gitlab": {
      "type": "stdio",
      "command": "/absolute/path/to/run-gitlab-mcp.sh"
    }
  }
}
```

After editing, reload the Cursor MCP settings. The MCP panel should show `gitlab` with **29 tools enabled**.

### Verification: validate one tool first

Cursor's MCP panel exposes per-tool invocation. Before asking the Agent to chain multiple tools, call `gitlab_list_branches` once with `projectIdOrPath: "group/project"`. A successful response confirms the connector, token, and stdio link are healthy.

If a multi-tool Agent run later appears stuck on a tool that worked individually:

1. Stop the Agent run.
2. Re-run the same tool by itself from the MCP panel — confirm it still returns quickly.
3. Try the multi-tool flow again with a smaller prompt or fewer tools per turn.

This pattern is documented because we have observed it in practice; see Known Notes below.

## Verification Prompts

### Claude Code / Codex

A short conversational prompt that exercises three tools:

> Using the `gitlab` MCP server, look up the project `group/project`, then list its open branches and any open merge requests. Return a one-line summary of each.

### Cursor (single-tool)

When validating Cursor for the first time, prefer a single-tool prompt:

> Using the `gitlab` MCP server, call `gitlab_list_branches` for project `group/project` and show the branch names.

Once that succeeds, expand to multi-tool prompts.

## Known Notes

- **Cursor multi-tool hang (single observation, not reproduced as a connector bug)**: in one session, a Cursor Agent run that chained several tool calls appeared to stall on `gitlab_list_branches`. The same wrapper invoked outside Cursor returned in ~326 ms, and the same single-tool call inside Cursor also succeeded. There is no evidence the connector's payload shape caused the hang; the behavior is consistent with a client-side Agent state issue.
- **No code change is recommended for this**. Changing the connector's output contract for one client risks regressing the Claude Code and Codex flows that are already verified. The mitigation is the workaround above (validate single-tool first, stop and re-run if a multi-tool run stalls).
- **`structuredContent` shape**: list tools return `{ items: [...] }` in `structuredContent` (an MCP record, not a raw array) and the same payload as a JSON array string in `content[0].text`. All three clients accept this shape.

## Security Notes

- The connector **never prints tokens** to stdout/stderr; error messages are redacted before output.
- **Do not** commit tokens into `~/.claude.json`, `~/.codex/config.toml`, or `~/.cursor/mcp.json`. Keep tokens in `~/.env.gitlab-mcp` (or another file outside any repo) with `chmod 600`, and load them through the wrapper script.
- The connector performs **no write operations**: no merge, approve, push, retry, cancel, comment, create, or delete. See [security.en.md](security.en.md) for the full boundary.
- When pasting MCP config snippets into a shared channel, double-check the `env` block — it should reference env-var names (e.g. `GITLAB_MCP_CONFIG`), not contain literal token values.
