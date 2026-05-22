# Configuration

> 中文版见 [configuration.md](configuration.md)。

## Simple Mode (single GitLab instance)

Set two environment variables:

```bash
export GITLAB_BASE_URL="https://gitlab.example.com"
export GITLAB_TOKEN="your-personal-access-token"
```

- `GITLAB_BASE_URL` — Base URL of your GitLab instance. Defaults to `https://gitlab.com` if omitted. Must be a valid URL starting with `http://` or `https://`. Trailing slashes are stripped automatically.
- `GITLAB_TOKEN` — GitLab personal access token. Required in simple mode. Empty values are treated as unset.
- `GITLAB_TOOLSETS` — Optional. Comma-separated list of toolsets to enable. Set to `write` to enable write tools. When unset, only read-only tools are exposed.

### Required token scopes

- **Read tools**: at minimum `read_api` scope. For accessing repository content (branches, tags, diffs), ensure the token has `api` scope or the project is public.
- **Write tools**: requires `api` scope (`read_api` is not sufficient). CI operations (retry / cancel) also require the user to have appropriate project permissions.

## Multi-Host Mode

Use a JSON config file to connect to multiple GitLab instances:

```bash
export GITLAB_MCP_CONFIG=/path/to/config.json
```

### config.json structure

```json
{
  "defaultHost": "company",
  "toolsets": "write",
  "hosts": {
    "company": {
      "baseUrl": "https://gitlab.example.com",
      "tokenEnv": "GITLAB_COMPANY_TOKEN"
    },
    "gitlab": {
      "baseUrl": "https://gitlab.com",
      "tokenEnv": "GITLAB_COM_TOKEN"
    }
  }
}
```

### Fields

| Field | Required | Description |
|-------|----------|-------------|
| `defaultHost` | Yes | Host alias used when no `host` parameter is provided to a tool (must be a non-empty string) |
| `hosts` | Yes | Map of host aliases to connection configs (must be an object, not an array) |
| `hosts.*.baseUrl` | Yes | GitLab instance base URL (must be a valid `http://` or `https://` URL; trailing slashes are stripped automatically) |
| `hosts.*.tokenEnv` | Yes | Name of the environment variable holding the token (not the token itself) |
| `toolsets` | No | Comma-separated string of enabled toolsets (e.g. `"write"`). When unset, only read-only tools are exposed |

### Selecting a host

All MCP tools accept an optional `host` parameter matching a key in the `hosts` map:

```
gitlab_get_project({ projectIdOrPath: "group/project", host: "gitlab" })
```

If `host` is omitted, `defaultHost` is used.

## Environment variable precedence

1. If `GITLAB_MCP_CONFIG` is set → multi-host mode (ignores `GITLAB_BASE_URL` and `GITLAB_TOKEN`)
2. Otherwise → simple mode using `GITLAB_BASE_URL` and `GITLAB_TOKEN`

### Validation timing

- **At startup**: The connector validates config structure (`defaultHost`, `hosts` field completeness) and each host's `baseUrl` format (valid URL, http/https). In simple mode, `GITLAB_TOKEN` must also be non-empty.
- **At tool call time**: The connector checks that the environment variable named by `tokenEnv` exists and has a value. This happens when the host is first used (`resolveHost()`), not at startup. This means unused hosts in a multi-host config won't block startup, but `defaultHost` token issues will typically surface on the first tool call.

## Troubleshooting

- **`GITLAB_TOKEN is required`** — Set `GITLAB_TOKEN`, or use `GITLAB_MCP_CONFIG` for multi-host mode. Empty strings are treated as unset.
- **`Config file not found`** — The file pointed to by `GITLAB_MCP_CONFIG` does not exist. Check the path.
- **`not valid JSON`** — The config file has invalid JSON syntax. Validate with `jq . /path/to/config.json`.
- **`must have a 'defaultHost' string`** — config.json must have a `defaultHost` field at the top level.
- **`must have a 'hosts' object`** — config.json must have a `hosts` field that is an object.
- **`not found in hosts`** — The `defaultHost` value must match a key in the `hosts` object.
- **`must have a 'baseUrl' string`** — Each host must have a `baseUrl` that is a valid `http://` or `https://` URL.
- **`must have a 'tokenEnv' string`** — Each host must have a `tokenEnv` naming the environment variable that holds the token.
- **`must use http:// or https://`** — `baseUrl` does not support non-HTTP schemes like `file://` or `ftp://`.
- **`environment variable X is not set`** — The env var referenced by `tokenEnv` must exist and have a value at runtime. Use a wrapper script to source an env file before exec-ing the server.
- **`Unknown host`** — The `host` parameter must match a key in `hosts`.
- **`not a valid URL`** — The `baseUrl` or `GITLAB_BASE_URL` value cannot be parsed as a URL. Check for typos.

Do not put tokens in `config.json`, `~/.claude.json`, `~/.codex/config.toml`, `~/.cursor/mcp.json`, or any file you commit to version control. Use environment variables or a system secret manager.
