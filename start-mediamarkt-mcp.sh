#!/bin/zsh
set -euo pipefail

export HOME="/Users/andre.foeken"
export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin"
export MEDIAMARKT_MCP_HOST="127.0.0.1"
export MEDIAMARKT_MCP_PORT="23384"
export MEDIAMARKT_MCP_PUBLIC_URL="https://donut.taila4148b.ts.net/mediamarkt/mcp"
export MEDIAMARKT_UI="widget"
export MEDIAMARKT_MCP_TOKEN="$(security find-generic-password -a andre.foeken -s mediamarkt-mcp-token -w)"

cd "/Users/andre.foeken/Code/mediamarkt-mcp"
exec /opt/homebrew/bin/node index.mjs
