#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

PATTERNS=(
  "gitlab\.dhms\.net"
  "dhms-center"
  "tenant_web"
  "GITLAB_DHMS_TOKEN"
  "glpat-"
  "ghp_"
  "github_pat_"
  "/Users/"
)

TARGETS=(
  "README.md"
  "README.en.md"
  "docs"
  "package.json"
  "src"
  "tests"
)

pattern_args=""
for p in "${PATTERNS[@]}"; do
  if [ -n "$pattern_args" ]; then
    pattern_args="$pattern_args|"
  fi
  pattern_args="$pattern_args$p"
done

all_matches=""
for t in "${TARGETS[@]}"; do
  target="$ROOT/$t"
  [ -e "$target" ] || continue
  if [ -d "$target" ]; then
    matches=$(grep -rn -E "$pattern_args" "$target" 2>/dev/null \
      | grep -v '\.test\.\(ts\|js\):.*glpat-' \
      | grep -v '\.test\.\(ts\|js\):.*ghp_' \
      || true)
  else
    matches=$(grep -n -E "$pattern_args" "$target" 2>/dev/null || true)
  fi
  if [ -n "$matches" ]; then
    all_matches="$all_matches$matches"$'\n'
  fi
done

if [ -n "$all_matches" ]; then
  echo "Sensitive information detected:" >&2
  echo "$all_matches" >&2
  exit 1
fi

echo "Scan clean — zero matches."
