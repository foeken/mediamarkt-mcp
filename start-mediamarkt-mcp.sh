#!/bin/zsh
set -euo pipefail

export HOME="/Users/andre.foeken"
export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin"
export MEDIAMARKT_MCP_HOST="127.0.0.1"
export MEDIAMARKT_MCP_PORT="23384"
TAILSCALE_HOST="$(tailscale status --json | jq -r '.Self.DNSName' | sed 's/\\.$//')"
if [[ -z "$TAILSCALE_HOST" || "$TAILSCALE_HOST" == "null" ]]; then
  print -u2 "Unable to determine the local Tailscale hostname"
  exit 1
fi
export MEDIAMARKT_MCP_PUBLIC_URL="https://${TAILSCALE_HOST}/mediamarkt/mcp"
export MEDIAMARKT_MCP_WIDGET_DOMAIN="https://${TAILSCALE_HOST}"
export MEDIAMARKT_UI="widget"
export MEDIAMARKT_MCP_TOKEN="$(security find-generic-password -a andre.foeken -s mediamarkt-mcp-token -w)"

cd "/Users/andre.foeken/Code/mediamarkt-mcp"
exec /opt/homebrew/bin/node index.mjs
