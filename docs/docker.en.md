# Docker

> 中文版见 [docker.md](docker.md)。

## Build the image

```bash
docker build -t gitlab-mcp-connector:local .
```

## Running

### Simple Mode

```bash
docker run -i --rm \
  -e GITLAB_BASE_URL="https://gitlab.example.com" \
  -e GITLAB_TOKEN="your-personal-access-token" \
  gitlab-mcp-connector:local
```

### Multi-Host Mode

Mount the config file and pass `GITLAB_MCP_CONFIG`. Inject each host's token via `-e`:

```bash
docker run -i --rm \
  -e GITLAB_MCP_CONFIG=/config.json \
  -e GITLAB_COMPANY_TOKEN="your-company-token" \
  -v /absolute/path/to/config.json:/config.json:ro \
  gitlab-mcp-connector:local
```

See [configuration.en.md](configuration.en.md) for the config.json format.

### Pull from GitHub Release (available after publish)

```bash
docker pull ghcr.io/hz310456272/gitlab-mcp-connector:latest
```

## Client Configuration

MCP clients communicate with the container over stdio. The `-i` flag keeps stdin open.

The `-e GITLAB_TOKEN` in client config **passes through** the environment variable already set on the host into the container. Set `GITLAB_TOKEN` via your shell, an env file, or a system secret manager before launching the client. **Do not put real tokens in client config files.**

### Claude Code

Edit `~/.claude.json` or your project `.claude/settings.json`:

```json
{
  "mcpServers": {
    "gitlab": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "-e", "GITLAB_BASE_URL",
        "-e", "GITLAB_TOKEN",
        "gitlab-mcp-connector:local"
      ]
    }
  }
}
```

Before launching Claude Code, ensure `GITLAB_BASE_URL` and `GITLAB_TOKEN` are set in your shell:

```bash
export GITLAB_BASE_URL="https://gitlab.example.com"
export GITLAB_TOKEN="your-personal-access-token"
claude
```

Multi-host mode:

```json
{
  "mcpServers": {
    "gitlab": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "-e", "GITLAB_MCP_CONFIG",
        "-e", "GITLAB_COMPANY_TOKEN",
        "-v", "/absolute/path/to/config.json:/config.json:ro",
        "gitlab-mcp-connector:local"
      ]
    }
  }
}
```

### Codex

Edit `~/.codex/config.toml`:

```toml
[mcp_servers.gitlab]
command = "docker"
args = ["run", "-i", "--rm", "-e", "GITLAB_BASE_URL", "-e", "GITLAB_TOKEN", "gitlab-mcp-connector:local"]
```

Before launching Codex:

```bash
export GITLAB_BASE_URL="https://gitlab.example.com"
export GITLAB_TOKEN="your-personal-access-token"
```

### Cursor

Edit `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "gitlab": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "-e", "GITLAB_BASE_URL",
        "-e", "GITLAB_TOKEN",
        "gitlab-mcp-connector:local"
      ]
    }
  }
}
```

Ensure `GITLAB_BASE_URL` and `GITLAB_TOKEN` are set in your environment before launching Cursor.

## Security

- **Do not bake tokens into the image.** Inject tokens at runtime via `-e` environment variables or mounted env files.
- **Do not put real tokens in client config files** (`~/.claude.json`, `~/.codex/config.toml`, `~/.cursor/mcp.json`). These files may be synced or committed. Use shell environment variables, wrapper scripts, or a system secret manager.
- Mount config files as read-only with `-v ... :ro`, do not COPY them into the image.
- The image contains no source code, tests, or dev dependencies — only the minimum files needed to run.

## Self-Hosted GitLab / Internal Network Notes

Your host machine being able to reach GitLab does not guarantee the Docker container can. Containers have their own network stack — DNS resolution, VPN routing, and TLS trust chains may differ from the host.

### Network connectivity check

Verify connectivity from inside a container first:

```bash
# Replace with your GitLab instance URL
docker run --rm curlimages/curl:latest -I https://gitlab.example.com/api/v4/version
```

### Common errors

| Error message | Cause | Fix |
|---------------|-------|-----|
| `Could not resolve host` | DNS resolution failed | The container cannot resolve internal hostnames. Use `--dns` to specify a DNS server, or use an IP address instead |
| `Connection timed out` | Network / routing unreachable | Check VPN connectivity, host firewall, or Docker network configuration |
| `SELF_SIGNED_CERT_IN_CHAIN` / `certificate verify failed` | Self-signed certificate or untrusted company CA | Mount the CA file and set `NODE_EXTRA_CA_CERTS` (see below) |
| `401` / `403` | Invalid token or insufficient permissions | Check the token is correct and has `read_api` or `api` scope |

### Self-signed certificates

Mount the company CA certificate and set `NODE_EXTRA_CA_CERTS`:

```bash
docker run -i --rm \
  -e GITLAB_BASE_URL="https://gitlab.example.com" \
  -e GITLAB_TOKEN="your-personal-access-token" \
  -e NODE_EXTRA_CA_CERTS=/certs/company-ca.pem \
  -v /absolute/path/to/company-ca.pem:/certs/company-ca.pem:ro \
  gitlab-mcp-connector:local
```

**Do not** use `NODE_TLS_REJECT_UNAUTHORIZED=0` to disable TLS verification.

### Host network mode

If the container cannot reach your internal GitLab through the default bridge network, try host network mode:

```bash
docker run -i --rm --network host \
  -e GITLAB_BASE_URL="https://gitlab.example.com" \
  -e GITLAB_TOKEN="your-personal-access-token" \
  gitlab-mcp-connector:local
```

Note:
- `--network host` on Linux makes the container use the host's network stack directly — DNS and routing are identical to the host.
- On Docker Desktop for macOS / Windows, behavior is limited and container networking may not be fully identical to the host.
- If connectivity still fails, verify with the curl container test first, then check Docker Desktop network, DNS, proxy, and company CA settings.

For more troubleshooting details, see [self-hosted-gitlab.en.md](self-hosted-gitlab.en.md).
