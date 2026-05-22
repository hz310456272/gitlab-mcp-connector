# 配置

> English version: [configuration.en.md](configuration.en.md)

## 简单模式（单个 GitLab 实例）

设置两个环境变量即可：

```bash
export GITLAB_BASE_URL="https://gitlab.example.com"
export GITLAB_TOKEN="your-personal-access-token"
```

- `GITLAB_BASE_URL` — GitLab 实例的 base URL。不设置时默认 `https://gitlab.com`。必须是 `http://` 或 `https://` 开头的合法 URL。末尾斜杠会自动去掉。
- `GITLAB_TOKEN` — GitLab personal access token。简单模式下必填，空值等同于未设置。
- `GITLAB_TOOLSETS` — 可选。启用的 toolset，逗号分隔。设为 `write` 可启用写工具。不设置时只暴露只读工具。

### Token 所需权限

- **只读工具**：至少 `read_api` 权限。如果要读取仓库内容（分支、tag、diff 等），需要 `api` 权限，或者目标项目本身是 public。
- **写工具**：需要 `api` 权限（`read_api` 不够）。CI 操作（retry / cancel）还需用户有对应项目权限。

## 多 host 模式

通过一份 JSON config 文件同时连接多个 GitLab 实例：

```bash
export GITLAB_MCP_CONFIG=/path/to/config.json
```

### config.json 结构

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

### 字段说明

| 字段 | 必填 | 说明 |
|------|------|------|
| `defaultHost` | 是 | 工具调用未传 `host` 参数时使用的默认 host alias（不能为空字符串） |
| `hosts` | 是 | host alias 到连接配置的映射（必须是对象，不能是数组） |
| `hosts.*.baseUrl` | 是 | GitLab 实例 base URL（必须是 `http://` 或 `https://` 开头的合法 URL，末尾斜杠会自动去掉） |
| `hosts.*.tokenEnv` | 是 | 存储 token 的**环境变量名**，不是 token 本身 |
| `toolsets` | 否 | 启用的 toolset，逗号分隔字符串（如 `"write"`）。不设置时只暴露只读工具 |

### 选择 host

每个 MCP 工具都接受可选的 `host` 参数，对应 `hosts` 里的 key：

```
gitlab_get_project({ projectIdOrPath: "group/project", host: "gitlab" })
```

不传 `host` 时使用 `defaultHost`。

## 环境变量优先级

1. 设置了 `GITLAB_MCP_CONFIG` → 走多 host 模式（此时忽略 `GITLAB_BASE_URL` 和 `GITLAB_TOKEN`）
2. 否则 → 走简单模式，使用 `GITLAB_BASE_URL` 和 `GITLAB_TOKEN`

### 校验时机

- **启动时**：校验 config 结构（`defaultHost`、`hosts` 字段完整性）和每个 host 的 `baseUrl` 格式（合法 URL、http/https）。Simple Mode 同时校验 `GITLAB_TOKEN` 非空。
- **工具调用时**：校验 `tokenEnv` 指向的环境变量是否存在且有值。这发生在该 host 第一次被使用时（`resolveHost()`），而不是启动时。这意味着多 host 配置里暂时不用的 host 不会阻塞启动；但 `defaultHost` 的 token 通常会在第一次工具调用时暴露问题。

## 常见排错

- **`GITLAB_TOKEN is required`** — 设置 `GITLAB_TOKEN`，或改用 `GITLAB_MCP_CONFIG`。空字符串也视为未设置。
- **`Config file not found`** — `GITLAB_MCP_CONFIG` 指向的文件不存在。检查路径是否正确。
- **`not valid JSON`** — config 文件 JSON 语法有误。用 `jq . /path/to/config.json` 验证。
- **`must have a 'defaultHost' string`** — config.json 顶层必须有一个 `defaultHost` 字段。
- **`must have a 'hosts' object`** — config.json 顶层必须有一个 `hosts` 字段，且是对象。
- **`not found in hosts`** — `defaultHost` 的值必须在 `hosts` 里有一个同名 key。
- **`must have a 'baseUrl' string`** — 每个 host 必须有 `baseUrl`，且是合法的 `http://` 或 `https://` URL。
- **`must have a 'tokenEnv' string`** — 每个 host 必须有 `tokenEnv`，指定存放 token 的环境变量名。
- **`must use http:// or https://`** — `baseUrl` 不支持 `file://`、`ftp://` 等非 HTTP scheme。
- **`environment variable X is not set`** — `tokenEnv` 引用的环境变量在运行时必须存在且有值。建议用 wrapper 脚本 source env 文件再 exec server。
- **`Unknown host`** — 工具调用时传的 `host` 必须能匹配 `hosts` 里的某个 key。
- **`not a valid URL`** — `baseUrl` 或 `GITLAB_BASE_URL` 的值无法被解析为 URL。检查拼写。

> 不要把 token 明文写进 `config.json`、`~/.claude.json`、`~/.codex/config.toml`、`~/.cursor/mcp.json` 等任何 commit 进版本控制的文件。token 只放环境变量或系统级 secret 管理器。
