#!/bin/bash
set -euo pipefail

# Only run in Claude Code cloud sessions
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

# Register the REA MCP server and install the REA skill for Claude Code.
# Idempotent: re-running refreshes the registration without duplicating it.
npx -y rea-agents@6.4.0 setup --client claude_code --yes < /dev/null > /dev/null
