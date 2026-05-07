#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${GITLAB_MCP_ENV_FILE:-$HOME/.env.gitlab-mcp}"
SERVER_PATH="${GITLAB_MCP_SERVER_PATH:-/absolute/path/to/gitlab-mcp-connector/dist/server.js}"

if [ -f "$ENV_FILE" ]; then
  set -a
  source "$ENV_FILE"
  set +a
fi

exec node "$SERVER_PATH"
