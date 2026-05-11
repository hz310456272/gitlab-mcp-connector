# gitlab-mcp-connector

> English version: [README.en.md](README.en.md)

一个只读的 GitLab MCP 连接器，让 Claude Code、Codex、Cursor 等 AI 编程工具安全读取 GitLab 项目、MR、分支、流水线和 Job 日志。

## 功能特性

- **只读设计** — 不做 merge、push、approve、comment、retry、cancel、delete 任何写操作
- **支持 GitLab.com 和私有化 GitLab** — 任意 GitLab 实例均可
- **支持多 GitLab host** — 一个 connector 同时连接多个 GitLab 实例
- **token 不写入客户端配置** — 通过 wrapper 脚本 + env 文件加载，避免在 `~/.claude.json`、`~/.codex/config.toml`、`~/.cursor/mcp.json` 中出现明文 token
- **输出字段经过 normalize** — 过滤掉 permissions、avatar URL、runner 等非稳定字段；commit 工具会保留 author_email / committer_email，便于识别作者、bot 或提交者；MR 评论、diff、Job 日志等用户内容原样返回
- **MCP 标准 stdio** — 兼容 Claude Code、Codex、Cursor 等所有 stdio MCP 客户端

## 兼容性

已真实验证的客户端：

| 客户端 | 状态 | 备注 |
|--------|------|------|
| Claude Code | 已验证 | 在自托管 GitLab 上完整跑通只读流程 |
| Codex | 已验证 | `gitlab_get_project`、`gitlab_list_branches`、`gitlab_list_merge_requests` 验证通过 |
| Cursor | 已验证 | MCP 面板显示 29 tools enabled，单工具 `gitlab_list_branches` 调用成功；如多工具 Agent run 卡住，建议先停止再单工具验证 |

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

### 使用 Docker

```bash
docker build -t gitlab-mcp-connector:local .
docker run -i --rm \
  -e GITLAB_BASE_URL="https://gitlab.example.com" \
  -e GITLAB_TOKEN="your-personal-access-token" \
  gitlab-mcp-connector:local
```

> 不要把真实 token 提交到任何配置文件；生产使用时建议从环境变量或 secret manager 注入。

详细 Docker 配置见 [docs/docker.md](docs/docker.md)。

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

## MCP 工具（29 个，全部只读）

所有工具返回 normalize 后的稳定字段 JSON。permissions、avatar URL、runner 等非稳定字段会被过滤；commit 工具会保留 author_email / committer_email，便于企业研发场景中识别作者、bot 或提交者；MR 评论 body、diff 文本、Job 日志等用户内容原样返回，可能含敏感信息，需要按权限边界对待。

| 工具 | 说明 | 主要参数 |
|------|------|----------|
| `gitlab_list_projects` | 列出可访问的项目 | `search`、`membership`、`owned`、`archived`、`visibility`、`page`、`perPage` |
| `gitlab_get_project` | 获取项目详情 | `projectIdOrPath`（ID 或 `group/sub/project`）|
| `gitlab_list_groups` | 列出可访问 group / subgroup | `search`、`topLevelOnly`、`orderBy`、`sort`、`page`、`perPage` |
| `gitlab_get_group` | 获取 group 详情 | `groupIdOrPath`（ID 或 `group/subgroup`）|
| `gitlab_list_group_projects` | 列出 group 下项目 | `groupIdOrPath`、`search`、`includeSubgroups`、`archived`、`visibility`、`orderBy`、`sort`、`page`、`perPage` |
| `gitlab_list_branches` | 列出仓库分支 | `projectIdOrPath`、`search`、`regex`、`page`、`perPage` |
| `gitlab_list_tags` | 列出仓库 tag | `projectIdOrPath`、`search`、`orderBy`、`sort`、`page`、`perPage` |
| `gitlab_list_repository_tree` | 列出仓库目录结构（文件和目录） | `projectIdOrPath`、`path`、`ref`、`recursive`、`page`、`perPage` |
| `gitlab_get_repository_file` | 获取仓库文件内容 | `projectIdOrPath`、`filePath`、`ref`、`maxBytes`（默认 200KB） |
| `gitlab_list_commits` | 列出仓库 commit | `projectIdOrPath`、`ref`、`path`、`since`、`until`、`page`、`perPage` |
| `gitlab_get_commit` | 获取 commit 详情（含 message 和 stats） | `projectIdOrPath`、`sha` |
| `gitlab_compare_refs` | 比较两个分支/tag/commit 的差异 | `projectIdOrPath`、`from`、`to`、`straight`、`maxFiles`、`maxBytes` |
| `gitlab_list_merge_requests` | 列出 MR（项目级或实例级） | `projectIdOrPath`（不传走实例级）、`state`、`scope`、`authorUsername`、`reviewerUsername`、`targetBranch`、`sourceBranch`、`search`、`page`、`perPage` |
| `gitlab_get_merge_request` | 获取 MR 详情 | `projectIdOrPath`、`mergeRequestIid` |
| `gitlab_get_merge_request_diff` | 获取 MR diff，支持大小限制 | `projectIdOrPath`、`mergeRequestIid`、`maxFiles`、`maxBytes` |
| `gitlab_get_merge_request_comments` | 获取 MR 评论与 discussion | `projectIdOrPath`、`mergeRequestIid` |
| `gitlab_list_merge_request_pipelines` | 列出 MR 关联的 pipeline | `projectIdOrPath`、`mergeRequestIid` |
| `gitlab_get_pipeline_jobs` | 列出 pipeline 中的 job | `projectIdOrPath`、`pipelineId`、`includeRetried` |
| `gitlab_get_job_log` | 获取 job 日志，支持大小限制 | `projectIdOrPath`、`jobId`、`maxBytes`（默认 200KB） |
| `gitlab_list_issues` | 列出 issue（项目级或实例级） | `projectIdOrPath`（不传走实例级）、`state`、`labels`、`milestone`、`scope`、`authorUsername`、`assigneeUsername`、`search`、`page`、`perPage` |
| `gitlab_get_issue` | 获取 issue 详情，支持大小限制 | `projectIdOrPath`、`issueIid`、`maxBytes`（默认 200KB） |
| `gitlab_list_labels` | 列出项目 labels | `projectIdOrPath`、`search`、`page`、`perPage` |
| `gitlab_list_milestones` | 列出项目 milestones | `projectIdOrPath`、`state`、`search`、`page`、`perPage` |
| `gitlab_list_releases` | 列出项目 releases | `projectIdOrPath`、`tagName`、`search`、`orderBy`、`sort`、`page`、`perPage` |
| `gitlab_get_release` | 获取指定 tag 的 release 详情 | `projectIdOrPath`、`tagName` |
| `gitlab_search` | 搜索 GitLab 资源（9 个 scope，3 个级别） | `scope`、`search`、`projectIdOrPath`（项目级）、`groupIdOrPath`（组级）、`ref`、`searchType`、`page`、`perPage` |
| `gitlab_get_ci_config` | 读取项目 CI 配置（原始文件 + GitLab CI Lint 解析结果） | `projectIdOrPath`、`ref`、`filePath`（默认 `.gitlab-ci.yml`）、`maxBytes`（默认 200KB） |
| `gitlab_list_job_artifacts` | 列出 job 的 artifact 元数据 | `projectIdOrPath`、`jobId` |
| `gitlab_get_job_artifact_file` | 读取 artifact archive 内指定文件内容 | `projectIdOrPath`、`jobId`、`artifactPath`、`maxBytes`（默认 200KB） |

所有工具均接受可选的 `host` 参数（多 host 模式下生效）。

当前 29 个工具全部只读，默认全部暴露。未来支持按 toolset 分组启用，详见 [docs/toolsets.md](docs/toolsets.md)。

### 输出规范化

每个工具只返回稳定、有用的字段：

- **Projects**：id、name、path_with_namespace、default_branch、visibility、web_url、repo URL、namespace
- **Groups**：id、name、path、full_path、full_name、description、visibility、web_url、parent_id（null 表示顶层 group）
- **Group projects**：复用 project normalizer，输出字段与 `gitlab_list_projects` 一致
- **Repository tree**：id、name、type（tree/blob）、path、mode
- **Repository file**：file_name、file_path、size、ref、binary、content、truncated、max_bytes；二进制文件 base64 编码
- **Commits（列表）**：id、short_id、title、author_name、author_email、authored_date、committer_name、committer_email、committed_date、web_url、parent_ids
- **Commit 详情**：同列表 + message、stats（additions/deletions/total）
- **Compare**：commits、diffs、truncated、max_bytes；commit 优先保留，diff 先截断
- **Merge requests**：id、iid、title、description、state、branches、author/reviewers（仅 username+name）、时间戳、draft、merge_status、labels
- **MR diff**：每个文件的 old_path/new_path/new_file/deleted_file/diff，带 `truncated` 标记
- **MR 评论**：扁平化 notes，含 discussion_id、note_id、type（system/user）、author、body、position（路径+行号）、resolvable/resolved
- **Pipelines**：id、status、ref、sha、时间戳、web_url
- **Jobs**：id、name、stage、status、web_url、started_at、finished_at、duration
- **Job log**：job_id、trace、truncated、max_bytes
- **Issues（列表）**：id、iid、title、description（截断到 500 字符）、state、web_url、author（username+name）、assignees（username+name）、labels、milestone（id+title+state）、type、confidential、时间戳；截断时设 `description_truncated: true`
- **Issue 详情**：同列表但 description 完整，max_bytes、description_truncated（按 maxBytes 截断时设置）
- **Labels**：id、name、color、text_color、description
- **Milestones**：id、iid、title、description、state、web_url、created_at、updated_at、due_date、start_date、expired
- **Releases（列表）**：tag_name、name、description（截断到 500 字符）、description_truncated、created_at、released_at、author（username+name）、commit（short_id+title+authored_date）、milestones（id+title+state）、assets（count+links）；`description_truncated` 始终为 boolean
- **Release 详情**：同列表但 description 完整、description_truncated 始终为 boolean
- **Search**：输出 `{ level, scope, results }`，每个 scope 有专用 normalizer；issues/MR/milestones 保留 project_id + iid 用于后续工具调用；commits 保留 project_id；blobs/wiki_blobs 保留 project_id + ref + path；notes 保留 project_id + noteable_iid + noteable_type；blob data 和 note body 超过 500 字符时截断，带 `data_truncated`/`body_truncated` 标记
- **CI config**：输出 file_path、ref、content（原始文件 UTF-8）、content_encoding、content_truncated、valid、errors、warnings、merged_yaml（include 展开后的完整 YAML）、merged_yaml_truncated、includes（type/location/context_project/context_sha，已过滤 blob/raw URL）、jobs（name/stage/when/allow_failure）、truncated、max_bytes。`filePath` 只用于读取原始文件；CI Lint GET 固定校验项目实际使用的 CI 配置入口（`.gitlab-ci.yml`），不一定等于自定义 `filePath`。当 `filePath` 不是 `.gitlab-ci.yml` 时输出 `lint_source: "project_default_ci_config"` 表明这一点。不使用 POST，不执行 pipeline，不模拟创建 pipeline，不下载 remote include
- **Job artifacts（列表）**：job_id、job_name、stage、status、web_url、started_at、finished_at、duration、artifacts_expire_at（可为 null）、artifacts（file_type/filename/size 数组）
- **Artifact file**：artifact_path、job_id、size、binary、encoding（base64 或 utf-8）、content、truncated、max_bytes。二进制文件 base64 编码，文本文件 UTF-8 解码。只能读取 archive artifact 内的文件，不能读取 trace 类型 job.log（job log 用 `gitlab_get_job_log`）。本轮不下载整个 archive zip，不写本地文件，不 keep/delete artifacts

### 截断策略

`maxBytes` 按 **UTF-8 字节数**（不是 JavaScript 字符串长度）衡量，限制**最终 JSON payload** 大小。

- `gitlab_get_repository_file` — `maxBytes` 限制最终 JSON payload（默认 200KB，最小 150B）。二进制文件返回 base64；文本文件 UTF-8 解码，超限时截断。
- `gitlab_compare_refs` — `maxBytes` 限制最终 JSON payload。commit 优先保留，diff 先截断；仍超预算则从末尾裁剪 commit。最小 100B。
- `gitlab_get_merge_request_diff` — `maxBytes` 限制最终 JSON payload。截断时设 `truncated: true`，逐个 diff 裁剪。
- `gitlab_get_job_log` — `maxBytes` 限制最终 JSON payload（默认 200KB）。截断时设 `truncated: true`。
- `gitlab_list_issues` — 列表视图 description 固定截断到 500 字符，截断时设 `description_truncated: true`。
- `gitlab_get_issue` — `maxBytes` 限制最终 JSON payload（默认 200KB）。如果用户传入值太小，会自动抬高到能容纳稳定元数据的最小预算；`max_bytes` 返回实际生效值。
- `gitlab_list_releases` — 列表视图 description 固定截断到 500 字符，截断时设 `description_truncated: true`；未截断时为 `false`。
- `gitlab_get_release` — 不做 maxBytes 限制，返回完整 release 数据。`description_truncated` 始终为 `false`。
- `gitlab_search` — blob `data` 和 note `body` 固定截断到 500 字符，截断时分别设 `data_truncated: true`/`body_truncated: true`。其他 scope 不截断。
- `gitlab_get_ci_config` — `maxBytes` 限制最终 JSON payload（默认 200KB）。截断优先 `merged_yaml`，再截断 `content`；稳定字段（valid/errors/warnings/includes/jobs）不截断。如果用户传入值太小，自动抬高到能容纳稳定元数据的最小预算；`max_bytes` 返回实际生效值。
- `gitlab_get_job_artifact_file` — `maxBytes` 限制最终 JSON payload（默认 200KB，最小 150B）。二进制文件 base64 编码后截断；文本文件 UTF-8 解码后截断，截断时设 `truncated: true`。

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
