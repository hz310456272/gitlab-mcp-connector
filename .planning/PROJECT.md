# gitlab-mcp-connector v0.4→v1.0

## What This Is

An open-source, production-grade GitLab MCP (Model Context Protocol) server that enables AI agents (Claude Code, Codex, Cursor, etc.) to interact with GitLab as naturally as they interact with GitHub via the official GitHub MCP Server. Currently at v0.3.0 with 29 read-only tools verified across three clients and a private GitLab instance. This initiative covers the remaining roadmap: safe controlled write capabilities (v0.4.0), enterprise security & governance (v0.5.0), and stable public release (v1.0.0).

## Core Value

AI agents can safely and reliably perform real GitLab collaboration workflows (comment on MRs, create issues, manage pipelines) through MCP tools — with write operations off by default, fully auditable, and protected by layered safeguards.

## Requirements

### Validated

<!-- Shipped in v0.1.0–v0.3.0 -->

- ✓ 29 read-only MCP tools covering repository, commits, MRs, issues, labels, milestones, releases, groups, search, CI/CD — v0.1.0–v0.3.0
- ✓ Multi-client compatibility (Claude Code, Codex, Cursor) — v0.3.0
- ✓ Private GitLab instance support (VPN, self-signed certs, internal DNS) — v0.1.0
- ✓ npm publish + Docker image distribution — v0.2.0
- ✓ Token redaction in all output channels — v0.1.0
- ✓ maxBytes truncation with truncated flag — v0.1.0
- ✓ Output normalization (filter permissions, emails, avatars, runners) — v0.1.0

### Active

<!-- v0.4.0: Safe controlled write -->

- [ ] Toolset system: tools grouped by capability (read, write, ci), write tools only registered when `GITLAB_TOOLSETS` env includes "write"
- [ ] Token scope self-check at startup: probe token capabilities before registering write tools; silently degrade to read-only if scope insufficient
- [ ] MR comment tool (gitlab_create_merge_request_note)
- [ ] Issue comment tool (gitlab_create_issue_note)
- [ ] Create issue tool (gitlab_create_issue)
- [ ] Create MR tool (gitlab_create_merge_request)
- [ ] Retry failed job tool (gitlab_retry_job)
- [ ] Cancel pipeline tool (gitlab_cancel_pipeline)
- [ ] Cancel job tool (gitlab_cancel_job)
- [ ] dryRun mode for all write tools: returns method + path + body preview without executing
- [ ] Risk-level classification: low-risk (create/comment) vs high-risk (cancel/retry); high-risk operations require `confirm: true` parameter
- [ ] Write tool documentation: token scope requirements, risk levels, dryRun examples

<!-- v0.5.0: Enterprise security & governance -->

- [ ] Host allowlist: restrict callable GitLab instances via config
- [ ] Project allowlist: restrict accessible project scope via config
- [ ] Structured audit log: tool name, host, project, operation, status, timestamp — token always redacted
- [ ] Request ID / User-Agent hardening for GitLab-side traceability
- [ ] Rate limit handling with exponential backoff
- [ ] Config schema validation with friendly startup errors
- [ ] Security documentation: threat model, disclosure policy, injection defense

<!-- v1.0.0: Stable public release -->

- [ ] API stability contract: tool names + parameter schemas + output schemas locked; only additive changes allowed
- [ ] Semver policy document
- [ ] Migration guide (0.x → 1.0)
- [ ] Complete client compatibility matrix
- [ ] CONTRIBUTING.md + SECURITY.md
- [ ] GitHub release notes workflow

### Out of Scope

| Feature | Reason |
|---------|--------|
| Streamable HTTP transport | Emerging spec, adds deployment complexity. Defer to v1.x. stdio is the proven path. |
| Write operations without toolset opt-in | Design principle: write default off, explicit enable required |
| Token stored in client config files | Security principle: wrapper + env file only |
| Code execution / shell access tools | Out of MCP connector scope — belongs to IDE/tool layer |
| Git operations (clone, push, fetch) | Git protocol is separate from GitLab REST API scope |
| GraphQL API support | REST API covers all needed operations; GraphQL adds complexity without clear benefit |

## Context

- **Codebase state**: TypeScript ESM project, `@modelcontextprotocol/sdk` v1.29.0, zod schemas, vitest + undici mock testing, npm published, Docker support
- **Architecture pattern**: One file per domain in `src/tools/`, each exports handler + zod schema + tool descriptor. Shared normalization in `normalize.ts`. GitLab API client in `src/gitlab/client.ts`.
- **Existing toolset infrastructure**: `docs/toolsets.md` already documents the planned toolset grouping. Config system supports multi-host via env vars.
- **Known technical debt** (from codebase map): 5x duplicated `byteLength()`, 2x duplicated `truncateContentInPayload()`, 6+ similar truncation implementations, 3 stale hardcoded version strings, 1014-line normalize.ts monolith, no request timeouts, author emails exposed in commit output.
- **Verification history**: Real GitLab tested on 25/29 tools (4 tools limited by company data availability). Three clients verified.

## Constraints

- **Tech Stack**: TypeScript / ESM / Node >=18 / `@modelcontextprotocol/sdk` / zod / vitest — established, no migration
- **Security**: Token never in client config, never in output. Write operations default off. redact() applied to all error paths.
- **Compatibility**: Must not break existing read tools or regress Claude Code / Codex / Cursor compatibility
- **GitLab API**: REST API v4 only. Must work with GitLab CE/EE 16+ and private instances.
- **Distribution**: npm + Docker + source install three paths must all work
- **Documentation**: Chinese default + English backup, cross-linked, placeholder-only (no real company data)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Toolset config via env var `GITLAB_TOOLSETS` | Consistent with existing env-based config (GITLAB_BASE_URL, GITLAB_TOKEN). Follows "token not in client config" principle. | — Pending |
| dryRun returns API preview (method + path + body) | More useful for debugging than simulated results. Agent can see exactly what would be sent. Minimal implementation cost. | — Pending |
| Risk by destructiveness: create/comment = low, cancel/retry = high | Low-risk ops are reversible/append-only. High-risk ops mutate state that can't be undone. Maps to clear user mental model. | — Pending |
| Token scope self-check at startup | Fail fast + silent degradation: if token lacks `api` scope, write tools simply don't appear. Safer than 403 at call time. Follows "安全默认" principle. | — Pending |
| HTTP transport deferred to v1.x | stdio is proven and stable. HTTP transport spec is still evolving. Not worth blocking v1.0. | — Pending |
| v1.0 API stability: lock tool names + param schemas + output schemas | Strongest contract gives downstream users confidence. Only additive changes (new fields, new tools) allowed post v1.0. | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-21 after initialization*
