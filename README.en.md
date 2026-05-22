# gitlab-mcp-connector

> 中文版见 [README.md](README.md)。

A GitLab MCP (Model Context Protocol) server for AI coding agents (Claude Code, Codex, Cursor, etc.) to summarize MRs, review code, check pipelines, diagnose CI failures — and optionally perform controlled write operations (create issues/MRs, comment, retry/cancel CI).

## Features

- **Read-only by default, controlled write** — write tools are off by default; enable via `GITLAB_TOOLSETS="write"`; HIGH-risk operations require `confirm`
- **GitLab.com & self-hosted** — works with any GitLab instance
- **Multi-host support** — connect to multiple GitLab instances simultaneously
- **Security-first** — connector never prints tokens; API errors are redacted; raw metadata is normalized. Note: tool output (comments, diffs, job logs) returns user-visible GitLab content and may contain sensitive information committed by users.
- **MCP standard** — uses stdio transport, compatible with any MCP client

## Compatibility

Verified clients:

| Client | Status | Notes |
|--------|--------|-------|
| Claude Code | Tested | Full read-only workflow verified against a self-hosted GitLab instance |
| Codex | Tested | `gitlab_get_project`, `gitlab_list_branches`, and `gitlab_list_merge_requests` verified |
| Cursor | Tested | `gitlab_list_branches` verified; MCP panel shows 29 tools enabled; if a multi-tool Agent run appears stuck, stop it and verify one tool call at a time |

See [docs/client-compatibility.en.md](docs/client-compatibility.en.md) for setup and verification notes for Claude Code, Codex, and Cursor.

## Quick Start

### Install from npm (recommended)

```bash
npm install -g gitlab-mcp-connector
```

### Install from GitHub Release tarball

```bash
# Download the latest tarball (example URL — copy the actual link from the GitHub Release page)
curl -L -o gitlab-mcp-connector.tgz https://github.com/hz310456272/gitlab-mcp-connector/releases/latest/download/gitlab-mcp-connector.tgz
npm install -g gitlab-mcp-connector.tgz
```

### Build from source

```bash
git clone https://github.com/hz310456272/gitlab-mcp-connector.git
cd gitlab-mcp-connector
npm install
npm run build
```

### Using Docker

```bash
docker build -t gitlab-mcp-connector:local .
docker run -i --rm \
  -e GITLAB_BASE_URL="https://gitlab.example.com" \
  -e GITLAB_TOKEN="your-personal-access-token" \
  gitlab-mcp-connector:local
```

> Do not commit real tokens to any config file. For production use, inject tokens from environment variables or a secret manager.

See [docs/docker.en.md](docs/docker.en.md) for full Docker configuration.

### Configure and run

```bash
# Set environment variables
export GITLAB_BASE_URL="https://gitlab.example.com"
export GITLAB_TOKEN="your-personal-access-token"

# Run (if installed globally via npm)
gitlab-mcp-connector

# Or run from source
node dist/server.js
```

> **Do not** commit tokens to config files. For production use, see [Multi-Host Mode](#multi-host-mode) below.

## Configuration

See [docs/configuration.en.md](docs/configuration.en.md) for full details.

### Simple Mode (single GitLab instance)

```bash
export GITLAB_BASE_URL="https://gitlab.example.com"   # defaults to https://gitlab.com
export GITLAB_TOKEN="your-personal-access-token"
```

> Keep tokens in environment variables or a secret manager. Do not hard-code them in MCP config files you commit to version control.

### Multi-Host Mode (recommended)

```bash
export GITLAB_MCP_CONFIG=/path/to/config.json
```

Token values are read from separate environment variables — the config file only references the variable names:

```json
{
  "defaultHost": "company",
  "hosts": {
    "company": {
      "baseUrl": "https://gitlab.example.com",
      "tokenEnv": "GITLAB_COMPANY_TOKEN"
    }
  }
}
```

In your MCP client config, only set `GITLAB_MCP_CONFIG`:

```json
{
  "mcpServers": {
    "gitlab": {
      "command": "node",
      "args": ["/absolute/path/to/gitlab-mcp-connector/dist/server.js"],
      "env": {
        "GITLAB_MCP_CONFIG": "/path/to/config.json"
      }
    }
  }
}
```

Each MCP tool accepts an optional `host` parameter to select which instance to query.

## MCP Tools (29 read-only + 7 write = 36 total)

All tools return normalized, stable-field JSON. Unstable fields such as permissions, avatar URLs, and runner details are filtered out. Commit tools intentionally keep author_email and committer_email because they are useful for identifying authors, bots, and committers in engineering workflows. User-generated content such as MR comments, diffs, and job logs is returned as-is and may contain sensitive information.

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `gitlab_list_projects` | List accessible projects | `search`, `membership`, `owned`, `archived`, `visibility`, `page`, `perPage` |
| `gitlab_get_project` | Get project details | `projectIdOrPath` (ID or `group/sub/project`) |
| `gitlab_list_groups` | List accessible groups / subgroups | `search`, `topLevelOnly`, `orderBy`, `sort`, `page`, `perPage` |
| `gitlab_get_group` | Get group details | `groupIdOrPath` (ID or `group/subgroup`) |
| `gitlab_list_group_projects` | List projects in a group | `groupIdOrPath`, `search`, `includeSubgroups`, `archived`, `visibility`, `orderBy`, `sort`, `page`, `perPage` |
| `gitlab_list_branches` | List repository branches | `projectIdOrPath`, `search`, `regex`, `page`, `perPage` |
| `gitlab_list_tags` | List repository tags | `projectIdOrPath`, `search`, `orderBy`, `sort`, `page`, `perPage` |
| `gitlab_list_repository_tree` | List repository tree (files and directories) | `projectIdOrPath`, `path`, `ref`, `recursive`, `page`, `perPage` |
| `gitlab_get_repository_file` | Get file content from repository | `projectIdOrPath`, `filePath`, `ref`, `maxBytes` (default 200KB) |
| `gitlab_list_commits` | List repository commits | `projectIdOrPath`, `ref`, `path`, `since`, `until`, `page`, `perPage` |
| `gitlab_get_commit` | Get commit details (includes message and stats) | `projectIdOrPath`, `sha` |
| `gitlab_compare_refs` | Compare two branches/tags/commits | `projectIdOrPath`, `from`, `to`, `straight`, `maxFiles`, `maxBytes` |
| `gitlab_list_merge_requests` | List MRs (project or instance level) | `projectIdOrPath` (omit for instance-level), `state`, `scope`, `authorUsername`, `reviewerUsername`, `targetBranch`, `sourceBranch`, `search`, `page`, `perPage` |
| `gitlab_get_merge_request` | Get MR details | `projectIdOrPath`, `mergeRequestIid` |
| `gitlab_get_merge_request_diff` | Get MR diff with size limits | `projectIdOrPath`, `mergeRequestIid`, `maxFiles`, `maxBytes` |
| `gitlab_get_merge_request_comments` | Get MR comments & discussions | `projectIdOrPath`, `mergeRequestIid` |
| `gitlab_list_merge_request_pipelines` | List pipelines for an MR | `projectIdOrPath`, `mergeRequestIid` |
| `gitlab_get_pipeline_jobs` | List jobs in a pipeline | `projectIdOrPath`, `pipelineId`, `includeRetried` |
| `gitlab_get_job_log` | Get job log with size limits | `projectIdOrPath`, `jobId`, `maxBytes` (default 200KB) |
| `gitlab_list_issues` | List issues (project or instance level) | `projectIdOrPath` (omit for instance-level), `state`, `labels`, `milestone`, `scope`, `authorUsername`, `assigneeUsername`, `search`, `page`, `perPage` |
| `gitlab_get_issue` | Get issue details with size limits | `projectIdOrPath`, `issueIid`, `maxBytes` (default 200KB) |
| `gitlab_list_labels` | List project labels | `projectIdOrPath`, `search`, `page`, `perPage` |
| `gitlab_list_milestones` | List project milestones | `projectIdOrPath`, `state`, `search`, `page`, `perPage` |
| `gitlab_list_releases` | List project releases | `projectIdOrPath`, `tagName`, `search`, `orderBy`, `sort`, `page`, `perPage` |
| `gitlab_get_release` | Get release details by tag name | `projectIdOrPath`, `tagName` |
| `gitlab_search` | Search GitLab resources (9 scopes, 3 levels) | `scope`, `search`, `projectIdOrPath` (project level), `groupIdOrPath` (group level), `ref`, `searchType`, `page`, `perPage` |
| `gitlab_get_ci_config` | Read project CI config (raw file + GitLab CI Lint parsed results) | `projectIdOrPath`, `ref`, `filePath` (default `.gitlab-ci.yml`), `maxBytes` (default 200KB) |
| `gitlab_list_job_artifacts` | List artifact metadata for a job | `projectIdOrPath`, `jobId` |
| `gitlab_get_job_artifact_file` | Read a single artifact file from a job's artifacts archive | `projectIdOrPath`, `jobId`, `artifactPath`, `maxBytes` (default 200KB) |

All tools accept an optional `host` parameter (multi-host mode).

### Write tools (requires `write` toolset)

Write tools are not exposed by default. Enable via `export GITLAB_TOOLSETS="write"` or `"toolsets": "write"` in config.json.

| Tool | Description | Risk | Key Parameters |
|------|-------------|------|----------------|
| `gitlab_create_merge_request_note` | Create a note on a merge request | LOW | `projectIdOrPath`, `mergeRequestIid`, `body`, `dryRun` |
| `gitlab_create_issue_note` | Create a note on an issue | LOW | `projectIdOrPath`, `issueIid`, `body`, `dryRun` |
| `gitlab_create_issue` | Create an issue | LOW | `projectIdOrPath`, `title`, `description`, `labels`, `assigneeIds`, `milestoneId`, `dryRun` |
| `gitlab_create_merge_request` | Create a merge request | LOW | `projectIdOrPath`, `sourceBranch`, `targetBranch`, `title`, `description`, `labels`, `assigneeIds`, `reviewerIds`, `milestoneId`, `dryRun` |
| `gitlab_retry_job` | Retry a failed job | HIGH | `projectIdOrPath`, `jobId`, `dryRun`, `confirm` |
| `gitlab_cancel_pipeline` | Cancel a pipeline | HIGH | `projectIdOrPath`, `pipelineId`, `dryRun`, `confirm` |
| `gitlab_cancel_job` | Cancel a job | HIGH | `projectIdOrPath`, `jobId`, `dryRun`, `confirm` |

All write tools support `dryRun: true` preview. HIGH-risk operations require `confirm: true`. See [docs/toolsets.en.md](docs/toolsets.en.md) for details.

The 29 read-only tools are exposed by default with no extra configuration.

### Output normalization

Each tool returns only stable, useful fields:
- **Projects**: id, name, path_with_namespace, default_branch, visibility, web_url, repo URLs, namespace
- **Groups**: id, name, path, full_path, full_name, description, visibility, web_url, parent_id (null for top-level groups)
- **Group projects**: reuses project normalizer, same output fields as `gitlab_list_projects`
- **Repository tree**: id, name, type (tree/blob), path, mode
- **Repository file**: file_name, file_path, size, ref, binary, content, truncated, max_bytes; base64-encoded for binary files
- **Commits (list)**: id, short_id, title, author_name, author_email, authored_date, committer_name, committer_email, committed_date, web_url, parent_ids
- **Commit detail**: same as list + message, stats (additions/deletions/total)
- **Compare**: commits, diffs, truncated, max_bytes; commits preserved, diffs truncated first under budget
- **Merge requests**: id, iid, title, description, state, branches, author/reviewers (username+name only), timestamps, draft, merge_status, labels
- **MR diff**: per-file old_path/new_path/new_file/deleted_file/diff, with `truncated` flag
- **MR comments**: flattened notes with discussion_id, note_id, type (system/user), author, body, position (paths + line numbers), resolvable/resolved
- **Pipelines**: id, status, ref, sha, timestamps, web_url
- **Jobs**: id, name, stage, status, web_url, started_at, finished_at, duration
- **Job log**: job_id, trace, truncated, max_bytes
- **Issues (list)**: id, iid, title, description (truncated to 500 chars), state, web_url, author (username+name), assignees (username+name), labels, milestone (id+title+state), type, confidential, timestamps; `description_truncated: true` when cut
- **Issue detail**: same as list but full description, max_bytes, description_truncated when truncated by maxBytes
- **Labels**: id, name, color, text_color, description
- **Milestones**: id, iid, title, description, state, web_url, created_at, updated_at, due_date, start_date, expired
- **Releases (list)**: tag_name, name, description (truncated to 500 chars), description_truncated, created_at, released_at, author (username+name), commit (short_id+title+authored_date), milestones (id+title+state), assets (count+links); `description_truncated` is always a boolean
- **Release detail**: same as list but full description, `description_truncated` is always a boolean
- **Search**: output is `{ level, scope, results }` with scope-specific normalizers; issues/MR/milestones retain project_id + iid for follow-up tool calls; commits retain project_id; blobs/wiki_blobs retain project_id + ref + path; notes retain project_id + noteable_iid + noteable_type; blob data and note body are truncated at 500 chars with `data_truncated`/`body_truncated` flags
- **CI config**: output includes file_path, ref, content (raw file UTF-8), content_encoding, content_truncated, valid, errors, warnings, merged_yaml (include-expanded full YAML), merged_yaml_truncated, includes (type/location/context_project/context_sha; blob/raw URLs filtered), jobs (name/stage/when/allow_failure), truncated, max_bytes. `filePath` only controls which raw file is read; CI Lint GET always validates the project's actual CI config entry point (`.gitlab-ci.yml`), which may differ from a custom `filePath`. When `filePath` is not `.gitlab-ci.yml`, the output includes `lint_source: "project_default_ci_config"` to indicate this. No POST requests, no pipeline execution, no pipeline creation simulation, no remote include downloads
- **Job artifacts (list)**: job_id, job_name, stage, status, web_url, started_at, finished_at, duration, artifacts_expire_at (may be null), artifacts (file_type/filename/size array)
- **Artifact file**: artifact_path, job_id, size, binary, encoding (base64 or utf-8), content, truncated, max_bytes. Binary files are base64-encoded; text files are UTF-8 decoded. Only reads files inside the archive artifact; cannot read trace-type job.log (use `gitlab_get_job_log` for job logs). Does not download the entire archive zip, does not write to local files, does not keep/delete artifacts

### Truncation

`maxBytes` limits are measured in **UTF-8 bytes** (not JavaScript string length) and cap the **total JSON payload**.

- `gitlab_get_repository_file` — `maxBytes` limits the total JSON payload (default 200KB, minimum 150B). Binary files are returned as base64; text files are UTF-8 decoded and truncated if needed.
- `gitlab_compare_refs` — `maxBytes` limits the total JSON payload. Commits are preserved; diffs are truncated first. If still over budget, commits are trimmed from the end. Minimum floor is 100B.
- `gitlab_get_merge_request_diff` — `maxBytes` limits the total JSON payload. When truncated, `truncated: true` is set and individual diffs are cut.
- `gitlab_get_job_log` — `maxBytes` limits the total JSON payload (default 200KB). When truncated, `truncated: true` is set.
- `gitlab_list_issues` — descriptions are truncated to 500 characters in list view; `description_truncated: true` is set when cut.
- `gitlab_get_issue` — `maxBytes` caps the final JSON payload (default 200KB). If the requested value is too small to hold stable metadata, it is raised to the minimum budget needed for a stable response; `max_bytes` reports the effective value.
- `gitlab_list_releases` — descriptions are truncated to 500 characters in list view; `description_truncated: true` when cut, `false` otherwise.
- `gitlab_get_release` — no maxBytes limit; returns the full release data. `description_truncated` is always `false`.
- `gitlab_search` — blob `data` and note `body` are truncated to 500 characters; `data_truncated: true`/`body_truncated: true` when cut. Other scopes are not truncated.
- `gitlab_get_ci_config` — `maxBytes` caps the total JSON payload (default 200KB). `merged_yaml` is truncated first, then `content`; stable fields (valid/errors/warnings/includes/jobs) are never truncated. If the requested value is too small to hold stable metadata, it is raised to the minimum budget needed; `max_bytes` reports the effective value.
- `gitlab_get_job_artifact_file` — `maxBytes` caps the total JSON payload (default 200KB, minimum 150B). Binary files are base64-encoded and truncated; text files are UTF-8 decoded and truncated with `truncated: true` set.

### Security boundary

- **Read-only by default**: without the `write` toolset, the connector cannot merge MRs, post comments, retry pipelines, or modify any GitLab resource.
- **Controlled writes**: when write tools are enabled, HIGH-risk operations require `confirm: true`; all writes support `dryRun` preview; audit logs are emitted to stderr.
- **No token leaks**: the connector never prints tokens to stdout/stderr; API errors are redacted.

See [docs/security.en.md](docs/security.en.md) for full details.

## Integration Examples

See the `examples/` directory for configuration snippets:

- `examples/claude-code/` — Claude Code MCP config + wrapper script
- `examples/codex/` — Codex MCP config template
- `examples/cursor/` — Cursor MCP config template

All examples use placeholder values. Do not commit real tokens to MCP config files.

Per-client setup, verification prompts, and known notes live in [docs/client-compatibility.en.md](docs/client-compatibility.en.md).

Cursor note: Cursor can load and call this stdio MCP server. If Cursor Agent appears stuck during a multi-tool run, stop the run and verify with a single tool call first, for example `gitlab_list_branches`.

### Claude Code + Self-Hosted GitLab (recommended setup)

Do **not** put your GitLab token directly in `~/.claude.json`. Instead, use a wrapper script that loads the token from a separate env file.

#### Step 1: Create an env file

Save your GitLab URL and token in a dedicated file (not committed to any repo):

```bash
# ~/.env.gitlab-mcp
GITLAB_BASE_URL=https://gitlab.example.com
GITLAB_TOKEN=your-personal-access-token
```

Restrict permissions: `chmod 600 ~/.env.gitlab-mcp`

#### Step 2: Create a MCP config file

```json
// ~/.config/gitlab-mcp-connector/config.json
{
  "defaultHost": "company",
  "hosts": {
    "company": {
      "baseUrl": "https://gitlab.example.com",
      "tokenEnv": "GITLAB_TOKEN"
    }
  }
}
```

Update your env file to add: `GITLAB_MCP_CONFIG=/path/to/config.json`

#### Step 3: Set up the wrapper script

Copy `examples/claude-code/run-gitlab-mcp.sh` to a location on your machine:

```bash
cp examples/claude-code/run-gitlab-mcp.sh ~/.local/bin/run-gitlab-mcp.sh
chmod +x ~/.local/bin/run-gitlab-mcp.sh
```

Edit the script to set `SERVER_PATH` to your installed `dist/server.js` path, or set `GITLAB_MCP_SERVER_PATH` in the env file.

The wrapper sources your env file (loading `GITLAB_BASE_URL`, `GITLAB_TOKEN`, `GITLAB_MCP_CONFIG`, etc.) and then execs the server.

Override paths with environment variables:
- `GITLAB_MCP_ENV_FILE` — path to env file (default: `~/.env.gitlab-mcp`)
- `GITLAB_MCP_SERVER_PATH` — path to `dist/server.js`

#### Step 4: Configure Claude Code

Edit `~/.claude.json` (or your project `.claude/settings.json`):

```json
{
  "mcpServers": {
    "gitlab": {
      "command": "/absolute/path/to/run-gitlab-mcp.sh"
    }
  }
}
```

Restart Claude Code after changing MCP config.

#### Troubleshooting

If tools don't appear in Claude Code:

1. Check `~/.claude.json` has the correct `mcpServers` entry
2. Verify the wrapper script is executable: `ls -la /path/to/run-gitlab-mcp.sh`
3. Verify the env file exists and has `GITLAB_TOKEN` set: `source ~/.env.gitlab-mcp && echo $GITLAB_TOKEN | head -c 4`
4. Test the server manually: `~/.local/bin/run-gitlab-mcp.sh` then type `{"jsonrpc":"2.0","method":"initialize","id":1,"params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"test","version":"0.0.1"}}}` + Enter + Ctrl+D
5. Check that `node /path/to/dist/server.js` can start without errors

This is a **read-only by default** connector. Write tools are off unless `GITLAB_TOOLSETS="write"` is set.

## Self-Hosted GitLab

See [docs/self-hosted-gitlab.en.md](docs/self-hosted-gitlab.en.md) for private deployments, VPN, and self-signed certificates.

## License

MIT
