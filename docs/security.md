# 安全

> English version: [security.en.md](security.en.md)

## 只读边界

本 MCP server 只暴露 GitLab API 的读取能力。它**永远不会**：

- 合并 merge request
- approve merge request
- 推送 commit 或创建分支
- 创建、更新、删除 MR、评论或 issue
- 重试或取消 pipeline
- 触发 job
- 修改任何 GitLab 资源

代码层面没有任何路径会向 GitLab 发起 `POST`、`PUT`、`PATCH`、`DELETE` 请求。

## Token 存储

- token 仅从环境变量读取，本 server 不会把 token 落盘到任何文件。
- token 通过 HTTPS 上的 `PRIVATE-TOKEN` 请求头发给 GitLab。
- token 值**永远不会**出现在 stdout、stderr、日志输出或错误信息里。

## 输出脱敏

GitLab API 返回的**错误信息**在返回给客户端之前会经过 redact，覆盖：

| 模式 | 替换为 |
|------|--------|
| `PRIVATE-TOKEN: <value>` | `PRIVATE-TOKEN: [REDACTED]` |
| `Authorization: Bearer <value>` | `Authorization: Bearer [REDACTED]` |
| `private_token=<value>`（query） | `private_token=[REDACTED]` |
| `access_token=<value>`（query） | `access_token=[REDACTED]` |
| `"private_token":"<value>"`（JSON） | `"private_token":"[REDACTED]"` |
| `"access_token":"<value>"`（JSON） | `"access_token":"[REDACTED]"` |
| `"token":"<value>"`（JSON） | `"token":"[REDACTED]"` |
| 邮箱地址 | `[EMAIL REDACTED]` |

## 输出 normalize

工具返回的字段经过 normalize，仅保留稳定可用的字段。原始 GitLab API 返回中的 `permissions`、`avatar_url`、`statistics`、`runner`、`artifacts`、`failure_reason` 等非稳定字段会被过滤掉。

**重要**：用户产生的内容会**原样返回**。MR 评论 body、diff 文本、Job 日志输出可能包含用户在 commit、评论、CI 输出里夹带的敏感信息（API key、凭据、内部 URL 等）。本 connector 不扫描也不过滤这些内容——这是 GitLab 内容本身的属性，不是 connector 引入的，由调用方 agent 按权限边界决定如何处理。

## maxBytes 截断

大体积输出（MR diff、Job 日志）会按可配置的字节上限截断。**所有上限均按 UTF-8 字节数衡量**，不是 JS 字符串长度。

- 触发截断时，响应里会带 `truncated: true` 字段。
- 上限非常小的时候，正文可能为空，但 `truncated` 标志一定会被设置，便于上层感知。

涉及的工具：

- `gitlab_get_merge_request_diff` — `maxBytes` 限制总 JSON payload 大小，超出时按文件维度截断 diff 数组。
- `gitlab_get_job_log` — `maxBytes` 限制总 JSON payload 大小，默认 200KB。

## User-Agent

所有 GitLab API 请求都会带 `User-Agent: gitlab-mcp-connector/<version>` 请求头，便于运维方识别和排查。

## 敏感内容注意事项

- **不要**把真实 token 写进 `~/.claude.json`、`~/.codex/config.toml`、`~/.cursor/mcp.json`、`config.json`、Git 仓库或任何 commit 内容。token 放独立 env 文件（如 `~/.env.gitlab-mcp`），权限收紧到 `chmod 600`，再通过 wrapper 脚本加载。
- 在共享渠道（聊天、issue、PR 描述）粘贴 MCP 配置片段或日志前，再确认一遍片段里只引用了环境变量名（如 `GITLAB_MCP_CONFIG`），没有 token 明文。
- 调用方 agent 在把 MR 评论、diff、Job 日志写进对外可见的内容（如分享文档、外部消息）之前，应假定其中可能含有用户夹带的敏感信息。
