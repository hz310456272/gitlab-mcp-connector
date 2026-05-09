# Docker

> English version: [docker.en.md](docker.en.md)

## 构建镜像

```bash
docker build -t gitlab-mcp-connector:local .
```

## 运行

### 简单模式

```bash
docker run -i --rm \
  -e GITLAB_BASE_URL="https://gitlab.example.com" \
  -e GITLAB_TOKEN="your-personal-access-token" \
  gitlab-mcp-connector:local
```

### 多 host 模式

把 config 文件挂载进容器，只传 `GITLAB_MCP_CONFIG`，各 host 的 token 通过 `-e` 注入：

```bash
docker run -i --rm \
  -e GITLAB_MCP_CONFIG=/config.json \
  -e GITLAB_COMPANY_TOKEN="your-company-token" \
  -v /absolute/path/to/config.json:/config.json:ro \
  gitlab-mcp-connector:local
```

config.json 内容参考 [configuration.md](configuration.md)。

### 从 GitHub Release 拉取（发布后可用）

```bash
docker pull ghcr.io/hz310456272/gitlab-mcp-connector:latest
```

## 客户端配置

MCP 客户端通过 stdio 和容器通信。`-i` 标志让 Docker 保持 stdin 开放。

客户端配置里的 `-e GITLAB_TOKEN` 作用是把宿主机上已设置的环境变量**透传**进容器。`GITLAB_TOKEN` 应在启动客户端之前通过 shell、env 文件或系统 secret manager 设置好。**不要把真实 token 写进客户端配置文件。**

### Claude Code

编辑 `~/.claude.json` 或项目 `.claude/settings.json`：

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

启动 Claude Code 之前，确保 shell 里已设置 `GITLAB_BASE_URL` 和 `GITLAB_TOKEN`：

```bash
export GITLAB_BASE_URL="https://gitlab.example.com"
export GITLAB_TOKEN="your-personal-access-token"
claude
```

多 host 模式：

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

编辑 `~/.codex/config.toml`：

```toml
[mcp_servers.gitlab]
command = "docker"
args = ["run", "-i", "--rm", "-e", "GITLAB_BASE_URL", "-e", "GITLAB_TOKEN", "gitlab-mcp-connector:local"]
```

启动 Codex 之前：

```bash
export GITLAB_BASE_URL="https://gitlab.example.com"
export GITLAB_TOKEN="your-personal-access-token"
```

### Cursor

编辑 `~/.cursor/mcp.json`：

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

启动 Cursor 之前确保 `GITLAB_BASE_URL` 和 `GITLAB_TOKEN` 已在环境中设置。

## 安全

- **不要把 token bake 进镜像**。token 通过 `-e` 环境变量或挂载的 env 文件在运行时注入。
- **不要把真实 token 写进客户端配置文件**（`~/.claude.json`、`~/.codex/config.toml`、`~/.cursor/mcp.json`）。这些配置可能被同步或 commit。用 shell 环境变量、wrapper 脚本或系统 secret manager 注入。
- config 文件用 `-v ... :ro` 只读挂载，不要 COPY 进镜像。
- 镜像内不含源码、测试、开发依赖，只保留运行所需的最小文件。

## 内网 / 自建 GitLab 注意事项

宿主机能访问 GitLab，不代表 Docker 容器一定能访问。容器有独立的网络栈，DNS 解析、VPN 路由、TLS 信任链都可能和宿主机不同。

### 网络连通性验证

先在容器内验证网络：

```bash
# 替换为你的 GitLab 实例地址
docker run --rm curlimages/curl:latest -I https://gitlab.example.com/api/v4/version
```

### 常见错误

| 错误信息 | 原因 | 修复方向 |
|----------|------|----------|
| `Could not resolve host` | DNS 解析失败 | 容器无法解析内网域名。使用 `--dns` 指定 DNS，或用 IP 地址代替域名 |
| `Connection timed out` | 网络/路由不可达 | 检查 VPN 是否连通、宿主机防火墙、Docker 网络配置 |
| `SELF_SIGNED_CERT_IN_CHAIN` / `certificate verify failed` | 自签证书或公司 CA 不被信任 | 挂载 CA 文件并设置 `NODE_EXTRA_CA_CERTS`（见下方） |
| `401` / `403` | token 无效或权限不足 | 检查 token 是否正确、是否带 `read_api` 或 `api` scope |

### 自签证书

挂载公司 CA 证书并设置 `NODE_EXTRA_CA_CERTS`：

```bash
docker run -i --rm \
  -e GITLAB_BASE_URL="https://gitlab.example.com" \
  -e GITLAB_TOKEN="your-personal-access-token" \
  -e NODE_EXTRA_CA_CERTS=/certs/company-ca.pem \
  -v /absolute/path/to/company-ca.pem:/certs/company-ca.pem:ro \
  gitlab-mcp-connector:local
```

**不要**用 `NODE_TLS_REJECT_UNAUTHORIZED=0` 关闭 TLS 校验。

### 宿主机网络模式

如果容器无法通过默认 bridge 网络访问内网 GitLab，可以尝试使用宿主机网络模式：

```bash
docker run -i --rm --network host \
  -e GITLAB_BASE_URL="https://gitlab.example.com" \
  -e GITLAB_TOKEN="your-personal-access-token" \
  gitlab-mcp-connector:local
```

注意：
- `--network host` 在 Linux 上让容器直接使用宿主机网络栈，DNS 和路由与宿主机一致。
- 在 Docker Desktop for macOS / Windows 上行为有限，容器网络不一定和宿主机完全一致。
- 如果仍然不通，先确认 curl 容器验证结果，再检查 Docker Desktop 网络、DNS、代理、公司 CA 配置。

更多排障细节见 [self-hosted-gitlab.md](self-hosted-gitlab.md)。
