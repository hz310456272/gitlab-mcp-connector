# gitlab-mcp-connector

> English version: [README.en.md](README.en.md)

一个只读的 GitLab MCP 连接器，让 Claude Code、Codex、Cursor 等 AI 编程工具安全读取 GitLab 项目、MR、分支、流水线和 Job 日志。

## 功能特性

- **只读设计** — 不做 merge、push、approve、comment、retry、cancel、delete 任何写操作
- **支持 GitLab.com 和私有化 GitLab** — 任意 GitLab 实例均可
- **支持多 GitLab host** — 一个 connector 同时连接多个 GitLab 实例
- **token 不写入客户端配置** — 通过 wrapper 脚本 + env 文件加载，避免在 `~/.claude.json`、`~/.codex/config.toml`、`~/.cursor/mcp.json` 中出现明文 token
- **输出字段经过 normalize** — 过滤掉 permissions、emails、avatar URL、runner 等非稳定字段，只保留稳定可用的字段；MR 评论、diff、Job 日志等用户内容原样返回
- **MCP 标准 stdio** — 兼容 Claude Code、Codex、Cursor 等所有 stdio MCP 客户端

## 兼容性

已真实验证的客户端：

| 客户端 | 状态 | 备注 |
|--------|------|------|
| Claude Code | 已验证 | 在自托管 GitLab 上完整跑通只读流程 |
| Codex | 已验证 | `gitlab_get_project`、`gitlab_list_branches`、`gitlab_list_merge_requests` 验证通过 |
| Cursor | 已验证 | MCP 面板显示 11 tools enabled，单工具 `gitlab_list_branches` 调用成功；如多工具 Agent run 卡住，建议先停止再单工具验证 |

详细配置和验证流程见 [docs/client-compatibility.md](docs/client-compatibility.md)（中文）或 [docs/client-compatibility.en.md](docs/client-compatibility.en.md)（English）。

## 快速开始

### 从 npm 安装（推荐）

```bash
npm install -g gitlab-mcp-connector
```

### 从 GitHub Release 下载 tarball

```bash
# 下载最新 tarball（示例 URL，到 GitHub Release 页面复制实际链接）
curl -L -o gitlab-mcp-connector.tgz https://github.com/hz310456272/gitlab-mcp-connector/releases/latest/download/gitlab-mcp-connector.tgz
npm install -g gitlab-mcp-connector.tgz
```

### 从源码构建

```bash
git clone https://github.com/hz310456272/gitlab-mcp-connector.git
cd gitlab-mcp-connector
npm install
npm run build
```

### 配置并启动

```bash
# 设置环境变量
export GITLAB_BASE_URL="https://gitlab.example.com"
export GITLAB_TOKEN="your-personal-access-token"

# 启动（npm 全局安装时）
gitlab-mcp-connector

# 或从源码启动
node dist/server.js
```

> **不要**把 token 写进任何会被 commit 的配置文件。生产使用请走下面的多 host 模式。

## 配置方式

完整说明见 [docs/configuration.md](docs/configuration.md)。

### 简单模式（单个 GitLab 实例）

```bash
export GITLAB_BASE_URL="https://gitlab.example.com"   # 不设置时默认 https://gitlab.com
export GITLAB_TOKEN="your-personal-access-token"
```

token 放在环境变量或密钥管理器里，不要写进 MCP 客户端配置。

### 推荐模式：多 host + tokenEnv

```bash
export GITLAB_MCP_CONFIG=/path/to/config.json
```

config 文件只引用环境变量名，不存储 token 本身：

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

MCP 客户端配置里只设 `GITLAB_MCP_CONFIG`：

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

每个工具都接受可选的 `host` 参数，用来指定走哪一个 GitLab 实例。

> 不要把 `GITLAB_TOKEN` 或任何真实 token 写进 `~/.claude.json`、`~/.codex/config.toml`、`~/.cursor/mcp.json` 等客户端配置文件。

## MCP 工具（11 个，全部只读）

所有工具返回 normalize 后的稳定字段 JSON。permissions、邮箱、avatar URL、runner 等非稳定字段会被过滤；MR 评论 body、diff 文本、Job 日志等用户内容原样返回，可能含有用户提交时夹带的敏感信息，需要按权限边界对待。

| 工具 | 说明 | 主要参数 |
|------|------|----------|
| `gitlab_list_projects` | 列出可访问的项目 | `search`、`membership`、`owned`、`archived`、`visibility`、`page`、`perPage` |
| `gitlab_get_project` | 获取项目详情 | `projectIdOrPath`（ID 或 `group/sub/project`）|
| `gitlab_list_merge_requests` | 列出 MR（项目级或实例级） | `projectIdOrPath`（不传走实例级）、`state`、`scope`、`authorUsername`、`reviewerUsername`、`targetBranch`、`sourceBranch`、`search`、`page`、`perPage` |
| `gitlab_get_merge_request` | 获取 MR 详情 | `projectIdOrPath`、`mergeRequestIid` |
| `gitlab_get_merge_request_diff` | 获取 MR diff，支持大小限制 | `projectIdOrPath`、`mergeRequestIid`、`maxFiles`、`maxBytes` |
| `gitlab_get_merge_request_comments` | 获取 MR 评论与 discussion | `projectIdOrPath`、`mergeRequestIid` |
| `gitlab_list_merge_request_pipelines` | 列出 MR 关联的 pipeline | `projectIdOrPath`、`mergeRequestIid` |
| `gitlab_get_pipeline_jobs` | 列出 pipeline 中的 job | `projectIdOrPath`、`pipelineId`、`includeRetried` |
| `gitlab_get_job_log` | 获取 job 日志，支持大小限制 | `projectIdOrPath`、`jobId`、`maxBytes`（默认 200KB） |
| `gitlab_list_branches` | 列出仓库分支 | `projectIdOrPath`、`search`、`regex`、`page`、`perPage` |
| `gitlab_list_tags` | 列出仓库 tag | `projectIdOrPath`、`search`、`orderBy`、`sort`、`page`、`perPage` |

所有工具均接受可选的 `host` 参数（多 host 模式下生效）。

## 客户端接入

仓库 `examples/` 目录提供了三种客户端的最小可用配置模板：

- [`examples/claude-code/`](examples/claude-code/) — Claude Code 的 MCP 配置 + wrapper 脚本
- [`examples/codex/`](examples/codex/) — Codex 的 MCP 配置模板
- [`examples/cursor/`](examples/cursor/) — Cursor 的 MCP 配置模板

模板里全是占位符，**不要**把真实 token 提交到任何 MCP 客户端配置。逐客户端的安装、验证、排障步骤见 [docs/client-compatibility.md](docs/client-compatibility.md)。

## 安全边界

- **只读**：connector 没有任何写路径，不能 merge MR、不能发评论、不能 retry pipeline、不能改任何 GitLab 资源。
- **token 不外泄**：服务端永不把 token 打进 stdout/stderr，错误信息经 redact。
- **用户内容按权限边界对待**：MR 评论、diff、Job 日志属于"调用方在 GitLab 上本来就有权限看到的内容"，原样返回。其中可能包含用户在 commit、评论、CI 输出里夹带的敏感信息——这是 GitLab 内容本身的属性，不是 connector 引入的。

完整安全说明见 [docs/security.md](docs/security.md)。

## 已知注意事项

- **Cursor 多工具卡住**：曾在一次会话中观察到 Cursor Agent 连续调用多个工具时 UI 卡在 `gitlab_list_branches` 上，但同一 wrapper 在 Cursor 外部直接调用该工具 ~326ms 成功返回，Cursor 单工具调用也成功。证据更指向 Cursor Agent 的 UI/状态问题，不是 connector payload 问题。**当前不建议为此修改 connector 的输出契约**，避免回归已经验证通过的 Claude Code / Codex 流程。遇到时停掉 Agent，先单工具验证 `gitlab_list_branches`，再尝试小范围多工具调用。
- **Self-hosted GitLab + 自签证书**：见 [docs/self-hosted-gitlab.md](docs/self-hosted-gitlab.md)，覆盖 VPN、自签证书等场景。

## License

MIT
