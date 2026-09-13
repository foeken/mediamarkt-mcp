#!/usr/bin/env node
// MediaMarkt NL AI shopping assistant as an MCP server.
// stdio (Codex/Claude):  mediamarkt-mcp            HTTP (ChatGPT):  mediamarkt-mcp --http [port]
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { z } from "zod";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36";

// ponytail: single-turn; pass the full messages[] history if follow-ups are ever needed.
export async function askMediaMarkt(question, language = "en") {
  const id = `conv_${randomUUID()}`;
  const res = await fetch("https://www.mediamarkt.nl/api/v1/ai-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": UA, Referer: `https://www.mediamarkt.nl/${language}/`,
      "x-mms-country": "NL", "x-mms-language": language, "x-mms-salesline": "Media", "x-flow-id": randomUUID() },
    body: JSON.stringify({ conversationId: id, id, language, trigger: "submit-message",
      messages: [{ id: randomUUID().slice(0, 16), role: "user", metadata: { path: `/${language}/` },
                   parts: [{ type: "text", text: question }] }] }),
  });
  if (!res.ok) throw new Error(`mediamarkt ${res.status}`);
  let text = "", products = [];
  for (const line of (await res.text()).split("\n")) {
    if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
    const ev = JSON.parse(line.slice(6));
    if (ev.type === "text-delta") text += ev.delta;
    if (ev.type === "tool-output-available") products.push(...(ev.output?.structuredContent?.data?.products ?? []));
  }
  return { text, products };
}

export function build() {
  const s = new McpServer({ name: "mediamarkt", version: "0.1.0" });
  s.registerTool("ask_mediamarkt",
    { description: "Ask MediaMarkt NL's AI shopping assistant (product search, comparisons, availability, stores). It answers in the language of the question; returns the answer text plus structured products (name, price, url).",
      inputSchema: { question: z.string(),
        language: z.enum(["nl", "en"]).default("en").describe("Storefront language: pick the language the user is writing in. 'en' gives English product names and /en/ URLs.") } },
    async ({ question, language }) => { const r = await askMediaMarkt(question, language);
      return { content: [{ type: "text", text: r.text }], structuredContent: r }; });
  return s;
}

const argv = process.argv.slice(2);
if (argv.includes("--check")) {
  const r = await askMediaMarkt("What is the cheapest Ubiquiti access point?", "en");
  console.assert(r.text.length > 20 && r.products.length > 0, "check failed", r);
  console.log("ok:", r.text.slice(0, 160).replace(/\n/g, " "), "| products:", r.products.length);
} else if (argv.includes("--http")) {
  const port = Number(argv[argv.indexOf("--http") + 1]) || 3000;
  createServer(async (req, res) => {
    const t = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined }); // stateless
    await build().connect(t); await t.handleRequest(req, res);
  }).listen(port, () => console.error(`mediamarkt-mcp on http://localhost:${port}`));
} else {
  await build().connect(new StdioServerTransport());
}
