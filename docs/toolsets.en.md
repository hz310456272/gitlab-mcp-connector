# Toolsets

> 中文版见 [toolsets.md](toolsets.md)

## Why toolsets

As the connector grows (more read tools + write operations), users need a way to control which tools are exposed. Toolsets are named groups of tools — enable only what you need instead of exposing everything at once.

This matters for:
- **Write operations**: must be off by default, requiring explicit opt-in
- **Least privilege**: a team that only needs CI debugging doesn't need MR write access
- **Enterprise governance**: admins can control the available scope through toolset config

## Current version (v0.4.0)

**Default behavior**: all 29 read-only tools are exposed; 7 write tools are hidden by default. No toolset configuration needed for read-only usage.

Write tools are enabled via the `write` toolset:

```bash
export GITLAB_TOOLSETS="write"
```

Or in config.json:

```json
{
  "defaultHost": "company",
  "toolsets": "write",
  "hosts": {
    "company": {
      "baseUrl": "https://gitlab.example.com",
      "tokenEnv": "GITLAB_COMPANY_TOKEN"
    }
  }
}
```

## Tool groups

### Read-only tools (exposed by default)

| Toolset | Tools |
|---------|-------|
| `read.projects` | `gitlab_list_projects`, `gitlab_get_project` |
| `read.repository` | `gitlab_list_branches`, `gitlab_list_tags`, `gitlab_list_repository_tree`, `gitlab_get_repository_file`, `gitlab_list_commits`, `gitlab_get_commit`, `gitlab_compare_refs` |
| `read.mrs` | `gitlab_list_merge_requests`, `gitlab_get_merge_request`, `gitlab_get_merge_request_diff`, `gitlab_get_merge_request_comments`, `gitlab_list_merge_request_pipelines` |
| `read.ci` | `gitlab_get_pipeline_jobs`, `gitlab_get_job_log`, `gitlab_get_ci_config`, `gitlab_list_job_artifacts`, `gitlab_get_job_artifact_file` |
| `read.issues` | `gitlab_list_issues`, `gitlab_get_issue`, `gitlab_list_labels`, `gitlab_list_milestones` |
| `read.releases` | `gitlab_list_releases`, `gitlab_get_release` |
| `read.groups` | `gitlab_list_groups`, `gitlab_get_group`, `gitlab_list_group_projects` |
| `read.search` | `gitlab_search` (some scopes require GitLab Premium) |

### Write tools (requires `write` toolset)

| Tool | Description | Risk level | Requires confirm |
|------|-------------|------------|------------------|
| `gitlab_create_merge_request_note` | Create a note on a merge request | LOW | No |
| `gitlab_create_issue_note` | Create a note on an issue | LOW | No |
| `gitlab_create_issue` | Create an issue | LOW | No |
| `gitlab_create_merge_request` | Create a merge request | LOW | No |
| `gitlab_retry_job` | Retry a failed job | HIGH | Yes |
| `gitlab_cancel_pipeline` | Cancel a pipeline | HIGH | Yes |
| `gitlab_cancel_job` | Cancel a job | HIGH | Yes |

## Write safety mechanisms

All write tools pass through a unified write-safety middleware, executed in order:

1. **`dryRun` preview** — set `dryRun: true` to return a request summary without calling the API
2. **`confirm` gate** — HIGH-risk operations require `confirm: true` to proceed
3. **Dedup window** — duplicate requests within a short window return cached results, preventing double-execution
4. **Audit log** — every write operation emits structured JSON to stderr (timestamp, tool, method, path, risk_level, status)

### dryRun example

```json
{
  "tool": "gitlab_create_issue",
  "arguments": {
    "projectIdOrPath": "group/project",
    "title": "Bug: login fails",
    "dryRun": true
  }
}
```

Returns a preview:

```json
{
  "dry_run": true,
  "method": "POST",
  "path": "/projects/group%2Fproject/issues",
  "body": { "title": "Bug: login fails" },
  "risk_level": "low"
}
```

### HIGH-risk operation example

Cancelling a pipeline requires explicit confirmation:

```json
{
  "tool": "gitlab_cancel_pipeline",
  "arguments": {
    "projectIdOrPath": "group/project",
    "pipelineId": 123,
    "confirm": true
  }
}
```

Without `confirm: true`, the request is rejected with a message suggesting `dryRun` preview first.

## Configuration

### Simple mode (environment variables)

```bash
export GITLAB_BASE_URL="https://gitlab.example.com"
export GITLAB_TOKEN="your-personal-access-token"
export GITLAB_TOOLSETS="write"
```

### Multi-host mode (config.json)

```json
{
  "defaultHost": "company",
  "toolsets": "write",
  "hosts": {
    "company": {
      "baseUrl": "https://gitlab.example.com",
      "tokenEnv": "GITLAB_COMPANY_TOKEN"
    }
  }
}
```

The `GITLAB_TOOLSETS` environment variable takes precedence over the `toolsets` field in config.json.

## Required token scopes

- **Read tools**: at minimum `read_api` scope
- **Write tools**: requires `api` scope (`read_api` is not sufficient)
- CI operations (retry / cancel) require `api` scope and the user must have appropriate project permissions

## Security principles

- **Write is a separate toolset**. Only enabling `write` exposes write tools.
- **Write tools are off by default**. Even though the code exists, `tools/list` returns no write tools without the `write` toolset configured.
- **HIGH-risk operations require confirm**. Cannot skip confirmation.
- **All write operations support dryRun**. Preview before executing.
- **Audit logs never leak tokens**. Logs only record metadata like tool, path, and status.
