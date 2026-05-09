# 客户端兼容性

> English version: [client-compatibility.en.md](client-compatibility.en.md)

本文记录 `gitlab-mcp-connector` 在各 MCP 客户端上的真实验证状态、配置方式、验证工具和已知注意事项，方便同事快速接入。

## 兼容性矩阵

| 客户端 | 状态 | 已验证范围 |
|--------|------|------------|
| Claude Code | 已验证 | 在自托管 GitLab 上跑通完整只读流程 |
| Codex | 已验证 | `gitlab_get_project`、`gitlab_list_branches`、`gitlab_list_merge_requests` |
| Cursor | 已验证 | MCP 面板显示 20 tools enabled，单工具 `gitlab_list_branches` 调用返回预期分支 |

三个客户端用的都是同一套 stdio MCP server。下面的差异只体现在**怎么配置**，不在 connector 行为上。

## 共同前提

- **传输方式**：stdio MCP server（`dist/server.js`），不走 HTTP/SSE。
- **token 处理**：`GITLAB_TOKEN`（或任何 secret）**不要**写进客户端 MCP 配置文件。token 放在独立 env 文件或系统级 secret 管理器里。
- **wrapper 脚本**：每个客户端启动 connector 时都通过一个小 wrapper（如 `run-gitlab-mcp.sh`）来 source env 文件再 exec `node dist/server.js`。参考实现见 `examples/claude-code/run-gitlab-mcp.sh`，同一份脚本在 Codex、Cursor 下也能直接复用。
- **只读**：20 个工具全部只读，下面的验证流程也只用读操作。

## Claude Code

- **配置文件**：全局 `~/.claude.json`，或项目级 `.claude/settings.json`。
- **推荐方式**：`command` 指向 wrapper 脚本，不要直接指 `node`，这样 token 不会出现在 `~/.claude.json` 里。

```json
{
  "mcpServers": {
    "gitlab": {
      "command": "/absolute/path/to/run-gitlab-mcp.sh"
    }
  }
}
```

改完配置重启 Claude Code，让它重新读取 `mcpServers`。

### 验证工具

按顺序跑下面三个，分别覆盖项目查询、仓库读取、MR 列表三条路径：

1. `gitlab_get_project`，参数 `projectIdOrPath: "group/project"`
2. `gitlab_list_branches`，参数 `projectIdOrPath: "group/project"`
3. `gitlab_list_merge_requests`，参数 `projectIdOrPath: "group/project"`、`state: "opened"`

三个都返回非 error 即视为 Claude Code 这一端 connector 健康。

## Codex

- **配置入口**：推荐用 `codex mcp add`，也可直接编辑 `~/.codex/config.toml`。
- 和 Claude Code 一样，`command` 指向 wrapper，不把 token 写进 `~/.codex/config.toml`。

```bash
codex mcp add gitlab -- /absolute/path/to/run-gitlab-mcp.sh
codex mcp list
codex mcp get gitlab
```

`codex mcp list` 应能列出 `gitlab`；`codex mcp get gitlab` 应能看到 wrapper 路径。

### 验证工具

与 Claude Code 相同：

1. `gitlab_get_project`，参数 `projectIdOrPath: "group/project"`
2. `gitlab_list_branches`，参数 `projectIdOrPath: "group/project"`
3. `gitlab_list_merge_requests`，参数 `projectIdOrPath: "group/project"`、`state: "opened"`

## Cursor

- **配置文件**：`~/.cursor/mcp.json`。
- 在 `mcpServers` 下**追加** `gitlab` 条目，**不要覆盖**已有的其他 server。

```json
{
  "mcpServers": {
    "gitlab": {
      "type": "stdio",
      "command": "/absolute/path/to/run-gitlab-mcp.sh"
    }
  }
}
```

改完后在 Cursor 里 reload MCP 设置。MCP 面板应能看到 `gitlab`，并显示 **20 tools enabled**。

### 验证：先单工具

Cursor 的 MCP 面板支持单工具调用。在让 Agent 一次性串多个工具之前，先单独调一次 `gitlab_list_branches`，参数 `projectIdOrPath: "group/project"`。返回成功就说明 connector、token、stdio 链路都正常。

如果之后多工具 Agent run 卡在某个**单调用本来能跑通**的工具上：

1. 停止 Agent run。
2. 在 MCP 面板里再单独调一次同一个工具，确认仍然能快速返回。
3. 缩小提示词范围，或减少单轮工具数量，再试一次多工具流程。

这套规避方案是基于真实观察记录下来的，详见下面"已知注意事项"。

## 验证提示词

### Claude Code / Codex

一段会串起三个工具的对话提示词：

> 用 `gitlab` MCP server，先查项目 `group/project`，再列出它的 open 分支以及 open 状态的 merge requests，每条返回一行摘要。

### Cursor（单工具）

第一次接 Cursor 时建议用单工具提示词：

> 用 `gitlab` MCP server 调 `gitlab_list_branches`，项目 `group/project`，把分支名列出来。

单工具跑通之后，再扩展到多工具提示词。

## 已知注意事项

- **Cursor 多工具卡住（单次观察，未证实是 connector bug）**：在一次会话里，Cursor Agent 连续串多个工具调用时，UI 卡在 `gitlab_list_branches` 上。同一 wrapper 在 Cursor 外部直接调该工具 ~326ms 成功返回，Cursor 内部单工具调用也成功。没有证据表明 connector 的 payload 形状是肇因，行为更符合客户端 Agent 状态机的问题。
- **不建议为这一现象修改 connector 的默认输出契约**。为了一个客户端单点观察去改输出格式，会让已经验证通过的 Claude Code / Codex 流程承担回归风险。当前的处理就是上面那套规避方案：先单工具验证、卡住时停掉、再小范围重试。
- **`structuredContent` 的形状**：list 类工具的 `structuredContent` 已经包成 `{ items: [...] }`（MCP record，非裸数组），同时 `content[0].text` 仍是 JSON 数组字符串。三个客户端都接受这种形状。

## 安全注意事项

- connector **永不打印 token** 到 stdout/stderr；错误信息经过 redact 才输出。
- **不要**把 token 写进 `~/.claude.json`、`~/.codex/config.toml`、`~/.cursor/mcp.json`。token 放在 `~/.env.gitlab-mcp`（或仓库外的其它文件）里，权限收紧到 `chmod 600`，再通过 wrapper 脚本加载。
- connector **没有任何写操作**：不会 merge、approve、push、retry、cancel、comment、create、delete。完整边界见 [security.md](security.md)。
- 在共享渠道粘贴 MCP 配置片段前再确认一遍 `env` 块——里面应该只引用环境变量名（如 `GITLAB_MCP_CONFIG`），不该出现 token 明文。
