# 配置

> English version: [configuration.en.md](configuration.en.md)

## 简单模式（单个 GitLab 实例）

设置两个环境变量即可：

```bash
export GITLAB_BASE_URL="https://gitlab.example.com"
export GITLAB_TOKEN="your-personal-access-token"
```

- `GITLAB_BASE_URL` — GitLab 实例的 base URL。不设置时默认 `https://gitlab.com`。
- `GITLAB_TOKEN` — GitLab personal access token。简单模式下必填。

### Token 所需权限

至少需要 `read_api` 权限。如果要读取仓库内容（分支、tag、diff 等），需要 `api` 权限，或者目标项目本身是 public。

## 多 host 模式

通过一份 JSON config 文件同时连接多个 GitLab 实例：

```bash
export GITLAB_MCP_CONFIG=/path/to/config.json
```

### config.json 结构

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

### 字段说明

| 字段 | 必填 | 说明 |
|------|------|------|
| `defaultHost` | 是 | 工具调用未传 `host` 参数时使用的默认 host alias |
| `hosts` | 是 | host alias 到连接配置的映射 |
| `hosts.*.baseUrl` | 是 | GitLab 实例 base URL（如 `https://gitlab.example.com`） |
| `hosts.*.tokenEnv` | 是 | 存储 token 的**环境变量名**，不是 token 本身 |

### 选择 host

每个 MCP 工具都接受可选的 `host` 参数，对应 `hosts` 里的 key：

```
gitlab_get_project({ projectIdOrPath: "group/project", host: "gitlab" })
```

不传 `host` 时使用 `defaultHost`。

## 环境变量优先级

1. 设置了 `GITLAB_MCP_CONFIG` → 走多 host 模式（此时忽略 `GITLAB_BASE_URL` 和 `GITLAB_TOKEN`）
2. 否则 → 走简单模式，使用 `GITLAB_BASE_URL` 和 `GITLAB_TOKEN`

## 常见排错

- **`GITLAB_TOKEN is required`** — 设置 `GITLAB_TOKEN`，或改用 `GITLAB_MCP_CONFIG`。
- **`Token not found: environment variable X is not set`** — config 里 `tokenEnv` 引用的环境变量在运行时必须存在。建议用 wrapper 脚本 source env 文件再 exec server。
- **`Unknown host`** — 工具调用时传的 `host` 必须能匹配 `hosts` 里的某个 key。

> 不要把 token 明文写进 `config.json`、`~/.claude.json`、`~/.codex/config.toml`、`~/.cursor/mcp.json` 等任何 commit 进版本控制的文件。token 只放环境变量或系统级 secret 管理器。
