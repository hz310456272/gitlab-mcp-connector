# Toolsets

> English version: [toolsets.en.md](toolsets.en.md)

## 为什么需要 toolsets

随着 connector 能力扩展（更多只读工具、未来写操作），需要一种机制让用户按需控制暴露哪些工具。toolsets 是分组的工具集合，用户可以只启用需要的组，而不是一次性暴露全部能力。

这对以下场景尤其重要：
- **写操作**：必须默认关闭，用户显式启用后才能使用
- **最小权限**：只需要 CI 排查的团队不需要暴露 MR 写操作
- **企业治理**：管理员可以通过 toolset 配置控制可用范围

## 当前版本（v0.1.x / v0.2.0）

**默认行为不变**：当前 11 个只读工具全部暴露，无需任何 toolset 配置。

这意味着：
- 不需要改 MCP 客户端配置
- 不需要加 `toolsets` 字段
- Claude Code / Codex / Cursor 已验证的行为不受影响

## 建议分组

| Toolset | 工具 | 当前可用 |
|---------|------|----------|
| `read.projects` | `gitlab_list_projects`、`gitlab_get_project` | 是 |
| `read.repository` | `gitlab_list_branches`、`gitlab_list_tags` | 是（files/commits 未来加入） |
| `read.mrs` | `gitlab_list_merge_requests`、`gitlab_get_merge_request`、`gitlab_get_merge_request_diff`、`gitlab_get_merge_request_comments`、`gitlab_list_merge_request_pipelines` | 是 |
| `read.ci` | `gitlab_get_pipeline_jobs`、`gitlab_get_job_log` | 是 |
| `read.issues` | issues / labels / milestones | 否（未来） |
| `write.mrs` | MR comment / create MR | 否（未来，默认关闭） |
| `write.issues` | issue comment / create issue | 否（未来，默认关闭） |
| `write.ci` | retry job / cancel pipeline | 否（未来，默认关闭） |

## 未来配置草案

> **以下配置示例仅为未来设计草案，当前版本不可用。**
>
> - 当前版本**不读取** `toolsets` 字段
> - 当前版本**不读取** `GITLAB_TOOLSETS` 环境变量
> - 即使配置了这些字段，也不会改变 11 个只读工具全部暴露的行为
>
> Tool filtering 将在 v0.4.0 与写能力一起实现。

toolsets 配置会加在 multi-host config.json 的顶层：

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

- 不设置 `toolsets` 或 `toolsets` 为空 → 暴露全部只读工具（当前行为）
- 设置 `toolsets` → 只暴露指定分组内的工具
- 写 toolset（`write.*`）必须显式列出才会启用

简单模式下也可以通过环境变量：

```bash
export GITLAB_TOOLSETS="read.projects,read.mrs"
```

以上均为设计草案，当前版本不实现 tool filtering。

## 安全原则

- **写能力必须独立 toolset**。不会出现"启用 read.ci 就自动带上 write.ci"的情况。
- **写 toolset 默认关闭**。即使代码已实现，未在配置中显式列出就不暴露。
- **写操作未来需要 `dryRun` / `confirm` / audit log**。这些是写能力的前置条件，不是 toolset 本身的一部分，但会在实现写 toolset 时一起完成。
- **当前不实现 tool filtering**。在写能力代码实际存在之前做过滤，会增加配置复杂度但不会带来实际安全收益——当前所有工具都是只读的。

## 实现计划

tool filtering 将在 v0.4.0（写能力）阶段和写工具一起实现。在那之前：
- 11 个只读工具保持全量暴露
- 配置格式保持向后兼容（不认识的字段会被忽略）
- 文档持续更新分组定义，确保实际实现时与设计一致
