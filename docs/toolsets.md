# Toolsets

> English version: [toolsets.en.md](toolsets.en.md)

## 为什么需要 toolsets

随着 connector 能力扩展（只读工具 + 写操作），需要一种机制让用户按需控制暴露哪些工具。toolsets 是分组的工具集合，用户可以只启用需要的组，而不是一次性暴露全部能力。

这对以下场景尤其重要：
- **写操作**：必须默认关闭，用户显式启用后才能使用
- **最小权限**：只需要 CI 排查的团队不需要暴露 MR 写操作
- **企业治理**：管理员可以通过 toolset 配置控制可用范围

## 当前版本（v0.4.0）

**默认行为**：29 个只读工具全部暴露，7 个写工具默认隐藏。无需任何 toolset 配置即可使用只读工具。

写工具通过 `write` toolset 启用：

```bash
export GITLAB_TOOLSETS="write"
```

或在 config.json 中配置：

```json
{
  "defaultHost": "company",
  "toolsets": "write",
  "hosts": {
    "company": {
      "baseUrl": "https://gitlab.example.com",
      "tokenEnv": "GITLAB_COMPANY_TOKEN"
    }
  }
}
```

## 工具分组

### 只读工具（默认暴露）

| Toolset | 工具 |
|---------|------|
| `read.projects` | `gitlab_list_projects`、`gitlab_get_project` |
| `read.repository` | `gitlab_list_branches`、`gitlab_list_tags`、`gitlab_list_repository_tree`、`gitlab_get_repository_file`、`gitlab_list_commits`、`gitlab_get_commit`、`gitlab_compare_refs` |
| `read.mrs` | `gitlab_list_merge_requests`、`gitlab_get_merge_request`、`gitlab_get_merge_request_diff`、`gitlab_get_merge_request_comments`、`gitlab_list_merge_request_pipelines` |
| `read.ci` | `gitlab_get_pipeline_jobs`、`gitlab_get_job_log`、`gitlab_get_ci_config`、`gitlab_list_job_artifacts`、`gitlab_get_job_artifact_file` |
| `read.issues` | `gitlab_list_issues`、`gitlab_get_issue`、`gitlab_list_labels`、`gitlab_list_milestones` |
| `read.releases` | `gitlab_list_releases`、`gitlab_get_release` |
| `read.groups` | `gitlab_list_groups`、`gitlab_get_group`、`gitlab_list_group_projects` |
| `read.search` | `gitlab_search`（部分 scope 需 GitLab Premium） |

### 写工具（需要 `write` toolset）

| 工具 | 说明 | 风险等级 | 需 confirm |
|------|------|----------|------------|
| `gitlab_create_merge_request_note` | 在 MR 上创建评论 | LOW | 否 |
| `gitlab_create_issue_note` | 在 issue 上创建评论 | LOW | 否 |
| `gitlab_create_issue` | 创建 issue | LOW | 否 |
| `gitlab_create_merge_request` | 创建 MR | LOW | 否 |
| `gitlab_retry_job` | 重试失败的 job | HIGH | 是 |
| `gitlab_cancel_pipeline` | 取消 pipeline | HIGH | 是 |
| `gitlab_cancel_job` | 取消 job | HIGH | 是 |

## 写操作安全机制

所有写工具都经过统一的写安全中间件，按顺序执行：

1. **`dryRun` 预览** — 设置 `dryRun: true` 返回请求摘要，不实际调 API
2. **`confirm` 守卫** — HIGH 风险操作必须传 `confirm: true` 才能执行
3. **去重窗口** — 短时间内相同请求自动返回缓存结果，防止重复执行
4. **审计日志** — 每次写操作在 stderr 输出结构化 JSON（timestamp、tool、method、path、risk_level、status）

### dryRun 示例

```json
{
  "tool": "gitlab_create_issue",
  "arguments": {
    "projectIdOrPath": "group/project",
    "title": "Bug: login fails",
    "dryRun": true
  }
}
```

返回预览：

```json
{
  "dry_run": true,
  "method": "POST",
  "path": "/projects/group%2Fproject/issues",
  "body": { "title": "Bug: login fails" },
  "risk_level": "low"
}
```

### HIGH 风险操作示例

取消 pipeline 必须显式确认：

```json
{
  "tool": "gitlab_cancel_pipeline",
  "arguments": {
    "projectIdOrPath": "group/project",
    "pipelineId": 123,
    "confirm": true
  }
}
```

不传 `confirm: true` 会被拒绝，并提示使用 `dryRun` 预览。

## 配置方式

### 简单模式（环境变量）

```bash
export GITLAB_BASE_URL="https://gitlab.example.com"
export GITLAB_TOKEN="your-personal-access-token"
export GITLAB_TOOLSETS="write"
```

### 多 host 模式（config.json）

```json
{
  "defaultHost": "company",
  "toolsets": "write",
  "hosts": {
    "company": {
      "baseUrl": "https://gitlab.example.com",
      "tokenEnv": "GITLAB_COMPANY_TOKEN"
    }
  }
}
```

`GITLAB_TOOLSETS` 环境变量优先级高于 config.json 中的 `toolsets` 字段。

## Token 所需权限

- **只读工具**：至少 `read_api` scope
- **写工具**：需要 `api` scope（`read_api` 不够）
- CI 操作（retry / cancel）需要 `api` scope 且用户需有对应项目权限

## 安全原则

- **写能力独立 toolset**。启用 `write` 才会暴露写工具。
- **写工具默认关闭**。即使代码已实现，未配置 `write` toolset 则 `tools/list` 不返回任何写工具。
- **HIGH 风险操作必须 confirm**。不能跳过确认直接执行。
- **所有写操作支持 dryRun**。可以先预览再执行。
- **审计日志不泄露 token**。日志只记录 tool、path、status 等元信息。
