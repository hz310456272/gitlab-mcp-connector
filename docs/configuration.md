# Configuration

## Simple Mode (single GitLab instance)

Set two environment variables:

```bash
export GITLAB_BASE_URL="https://gitlab.example.com"
export GITLAB_TOKEN="your-personal-access-token"
```

- `GITLAB_BASE_URL` — Base URL of your GitLab instance. Defaults to `https://gitlab.com` if omitted.
- `GITLAB_TOKEN` — GitLab personal access token. Required in simple mode.

### Required token scopes

The token needs at minimum `read_api` scope. For accessing repository content (branches, tags, diffs), ensure the token has `api` scope or the project is public.

## Multi-Host Mode

Use a JSON config file to connect to multiple GitLab instances:

```bash
export GITLAB_MCP_CONFIG=/path/to/config.json
```

### config.json structure

```json
{
  "defaultHost": "company",
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
| `defaultHost` | Yes | Host alias used when no `host` parameter is provided to a tool |
| `hosts` | Yes | Map of host aliases to connection configs |
| `hosts.*.baseUrl` | Yes | GitLab instance base URL (e.g. `https://gitlab.example.com`) |
| `hosts.*.tokenEnv` | Yes | Name of the environment variable holding the token |

### Selecting a host

All MCP tools accept an optional `host` parameter matching a key in the `hosts` map:

```
gitlab_get_project({ projectIdOrPath: "group/project", host: "gitlab" })
```

If `host` is omitted, `defaultHost` is used.

## Environment variable precedence

1. If `GITLAB_MCP_CONFIG` is set → multi-host mode (ignores `GITLAB_BASE_URL` and `GITLAB_TOKEN`)
2. Otherwise → simple mode using `GITLAB_BASE_URL` and `GITLAB_TOKEN`

## Troubleshooting

- **"GITLAB_TOKEN is required"** — Set `GITLAB_TOKEN` or use `GITLAB_MCP_CONFIG`.
- **"Token not found: environment variable X is not set"** — The env var referenced by `tokenEnv` must exist at runtime.
- **"Unknown host"** — The `host` parameter must match a key in `hosts`.
