# 私有化 GitLab

> English version: [self-hosted-gitlab.en.md](self-hosted-gitlab.en.md)

本 connector 可对接任意 GitLab 实例 —— GitLab.com、自托管、内网部署都可以。

## baseUrl 格式

`baseUrl` 必须包含 scheme 和主机名，**不要带末尾斜杠**：

```
https://gitlab.example.com
https://gitlab.internal.example.com
https://192.168.1.50
```

非标准端口：

```
https://gitlab.example.com:8443
```

connector 会自动在 `baseUrl` 后拼接 `/api/v4/...` 路径，不要在 `baseUrl` 里手动加 `/api/v4`。

## VPN / 内网

如果 GitLab 实例只能通过 VPN 访问：

1. 在启动 MCP server 前确保 VPN 已连接。
2. `baseUrl` 用内网主机名或 IP。
3. MCP server 是长驻进程，VPN 中途断开后续 API 调用会以连接错误失败。需要时手动重连 VPN，并由客户端重新拉起 MCP server（重启 Claude Code / Codex / Cursor 即可）。

## 内网 DNS

如果 GitLab 用的是内网域名：

1. 确认 connector 所在机器上能正确解析该域名。
2. 用 `curl` 验证：
   ```bash
   curl -I https://gitlab.internal.example.com/api/v4/version
   ```
3. 如果 DNS 仅在 VPN 内生效，先连上 VPN 再运行——见上一节。

## TLS 证书 / 自签证书

Node.js 的 TLS 行为受 Node 版本、构建方式（系统 OpenSSL vs 内置）、启动参数等多重因素影响。

遇到证书链错误时，按推荐顺序尝试：

1. **首选**：把内部 CA 证书加进系统信任库。
   - **macOS**：钥匙串 → 系统 → 信任
   - **Linux**：拷到 `/usr/local/share/ca-certificates/`，然后跑 `update-ca-certificates`

2. **可选**：通过 `NODE_EXTRA_CA_CERTS` 指向 CA bundle，让 Node 进程额外信任：
   ```bash
   export NODE_EXTRA_CA_CERTS=/absolute/path/to/ca-bundle.crt
   ```
   这一行可以放进 wrapper 脚本 source 的 env 文件里，仅对 connector 进程生效。

3. **不要**用 `NODE_TLS_REJECT_UNAUTHORIZED=0`。它会全局关闭 TLS 校验，存在中间人风险，不要为图省事在生产或共享环境里启用。

## curl 验证

在排查 connector 之前，先用 `curl` 直接验证机器到 GitLab 的连通性，能快速定位问题归属：

```bash
# 通用连通性 + 版本（无需 token）
curl -I https://gitlab.example.com/api/v4/version

# 带 token 验证身份（注意：不要把这条命令贴到聊天里）
curl -H "PRIVATE-TOKEN: $GITLAB_TOKEN" https://gitlab.example.com/api/v4/projects?membership=true

# 自签场景临时验证 CA bundle（不要长期使用）
curl --cacert /absolute/path/to/ca-bundle.crt https://gitlab.example.com/api/v4/version
```

`curl` 通了但 connector 不通，再去看 connector 自身；`curl` 都不通，先解决网络/DNS/证书。

## 常见排错

- **`ECONNREFUSED`** — host 或端口不对，或 GitLab 实例从当前机器不可达。先 `curl -I` 验证。
- **`ENOTFOUND`** — DNS 解析失败。检查主机名拼写，或改用 IP，或确认 VPN 已连。
- **`UNABLE_TO_VERIFY_LEAF_SIGNATURE` / `CERT_HAS_EXPIRED`** — TLS 证书链问题。见上面"TLS 证书"。优先把 CA 加到系统信任库或 `NODE_EXTRA_CA_CERTS`，**不要**关全局校验。
- **`401 Unauthorized`** — token 缺失、过期，或权限不足。检查 token 是否还在有效期、是否带 `read_api` 或 `api` scope。
- **`SELF_SIGNED_CERT_IN_CHAIN`** — 证书链里有自签节点。同样按 TLS 一节处理。
