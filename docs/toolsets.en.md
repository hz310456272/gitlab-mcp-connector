# Toolsets

> 中文版见 [toolsets.md](toolsets.md)。

## Why toolsets

As the connector grows (more read tools, future write operations), users need a way to control which tools are exposed. Toolsets are named groups of tools — enable only what you need instead of exposing everything at once.

This matters for:
- **Write operations**: must be off by default, requiring explicit opt-in
- **Least privilege**: a team that only needs CI debugging doesn't need MR write access
- **Enterprise governance**: admins can control the available scope through toolset config

## Current version (v0.1.x / v0.2.0)

**Default behavior is unchanged**: all 25 read-only tools are exposed with no toolset configuration needed.

This means:
- No changes to MCP client config
- No `toolsets` field required
- Claude Code / Codex / Cursor verified behavior is unaffected

## Proposed groups

| Toolset | Tools | Available now |
|---------|-------|---------------|
| `read.projects` | `gitlab_list_projects`, `gitlab_get_project` | Yes |
| `read.repository` | `gitlab_list_branches`, `gitlab_list_tags`, `gitlab_list_repository_tree`, `gitlab_get_repository_file`, `gitlab_list_commits`, `gitlab_get_commit`, `gitlab_compare_refs` | Yes |
| `read.mrs` | `gitlab_list_merge_requests`, `gitlab_get_merge_request`, `gitlab_get_merge_request_diff`, `gitlab_get_merge_request_comments`, `gitlab_list_merge_request_pipelines` | Yes |
| `read.ci` | `gitlab_get_pipeline_jobs`, `gitlab_get_job_log` | Yes |
| `read.issues` | `gitlab_list_issues`, `gitlab_get_issue`, `gitlab_list_labels`, `gitlab_list_milestones` | Yes |
| `read.releases` | `gitlab_list_releases`, `gitlab_get_release` | Yes |
| `read.groups` | `gitlab_list_groups`, `gitlab_get_group`, `gitlab_list_group_projects` | Yes (membership excluded) |
| `write.mrs` | MR comment / create MR | No (future, off by default) |
| `write.issues` | issue comment / create issue | No (future, off by default) |
| `write.ci` | retry job / cancel pipeline | No (future, off by default) |

## Future config draft

> **The config examples below are future design drafts and are not available in the current version.**
>
> - The current version **does not read** the `toolsets` field
> - The current version **does not read** the `GITLAB_TOOLSETS` environment variable
> - Configuring these fields will not change the behavior of exposing all 25 read-only tools
>
> Tool filtering will be implemented in v0.4.0 alongside write capabilities.

Toolsets will be added at the top level of the multi-host config.json:

```json
{
  "defaultHost": "company",
  "toolsets": ["read.projects", "read.repository", "read.mrs", "read.ci"],
  "hosts": {
    "company": {
      "baseUrl": "https://gitlab.example.com",
      "tokenEnv": "GITLAB_COMPANY_TOKEN"
    }
  }
}
```

- No `toolsets` or empty `toolsets` → expose all read-only tools (current behavior)
- `toolsets` set → only expose tools in the specified groups
- Write toolsets (`write.*`) must be explicitly listed to be enabled

Simple mode may also support an environment variable:

```bash
export GITLAB_TOOLSETS="read.projects,read.mrs"
```

All of the above is a design draft — tool filtering is not implemented in the current version.

## Security principles

- **Write tools must have separate toolsets**. Enabling `read.ci` will never implicitly enable `write.ci`.
- **Write toolsets are off by default**. Even when the code exists, tools are not exposed unless explicitly listed in config.
- **Write operations will require `dryRun` / `confirm` / audit log** in the future. These are prerequisites for write capability, not part of the toolset mechanism itself, and will be implemented alongside write toolsets.
- **Tool filtering is not implemented yet**. Filtering before write-capable code exists adds config complexity without real security benefit — all current tools are read-only.

## Implementation plan

Tool filtering will ship in v0.4.0 alongside write tools. Until then:
- All 25 read-only tools remain fully exposed
- Config format stays backward-compatible (unknown fields are ignored)
- Group definitions in this doc will be updated as tools are added, ensuring implementation matches the design
