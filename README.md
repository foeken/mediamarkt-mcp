# mediamarkt-mcp

MCP server that exposes MediaMarkt NL's "AI-modus" shopping assistant as one tool, `ask_mediamarkt`.

## How it works

The MediaMarkt site's chat widget POSTs to `https://www.mediamarkt.nl/api/v1/ai-chat` (Vercel AI SDK UI-message format, SSE response). No login or cookies are needed, only `x-mms-country/-language/-salesline` headers and a browser User-Agent. The assistant runs its own tools (search, compare, availability, stores) and streams back MCP-style tool results; this server collects the text answer plus the structured product list.

Unofficial endpoint: it can change or be blocked at any time. See MediaMarkt's [AI chatbot terms](https://www.mediamarkt.nl/nl/legal/gebruiksvoorwaarden-ai-chatbot).

## Install

```sh
npm install
npm run check   # live smoke test against mediamarkt.nl
```

## Use

Codex (stdio):

```sh
codex mcp add mediamarkt -- node /path/to/mediamarkt-mcp/index.mjs
```

ChatGPT / remote clients (Streamable HTTP, stateless):

```sh
node index.mjs --http 3000   # then expose it, e.g. cloudflared tunnel --url http://localhost:3000
```

## Tool

`ask_mediamarkt({ question, language? })` — `language` is `nl` (default) or `en`; the answer follows the question's language, `en` also switches product names and URLs to the English storefront. Returns `content[0].text` (the assistant's answer) and `structuredContent.products[]` (`productId`, `ean`, `name`, `brand`, `price`, `currency`, `deliveryTime`, `url`).
