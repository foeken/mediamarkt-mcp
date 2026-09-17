#!/usr/bin/env node
// MediaMarkt NL AI shopping assistant as an MCP server.
//   HTTP (default):  node index.mjs           -> http://localhost:${PORT:-3000}
//   stdio:           node index.mjs --stdio
//   UI:              MEDIAMARKT_UI=text (default) | widget   (widget = MCP Apps product carousel)
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "node:http";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { z } from "zod";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36";
const UI = process.env.MEDIAMARKT_UI === "widget" ? "widget" : "text";
const HOST = process.env.MEDIAMARKT_MCP_HOST || "127.0.0.1";
const PORT = Number(process.env.MEDIAMARKT_MCP_PORT || process.env.PORT || "3000");
const BEARER_TOKEN = process.env.MEDIAMARKT_MCP_TOKEN;
const PUBLIC_URL = process.env.MEDIAMARKT_MCP_PUBLIC_URL || `http://${HOST}:${PORT}/mcp`;
const WIDGET_DOMAIN = process.env.MEDIAMARKT_MCP_WIDGET_DOMAIN;
const WIDGET_URI = "ui://mediamarkt/product-carousel/v2.html";
const WIDGET_MIME = "text/html;profile=mcp-app";

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
    if (ev.type === "tool-output-available") {
      const images = Object.fromEntries((ev.output?._meta?.products ?? []).map(p => p.cofrProductAggregate)
        .filter(Boolean).map(p => [p.productId, p.cofrMediaAssetsFeature?.productMainImage?.link]));
      for (const p of ev.output?.structuredContent?.data?.products ?? []) products.push({ ...p, seller: p.seller ?? "MediaMarkt", image: images[p.productId] });
    }
  }
  return { text, products };
}

export function build() {
  if (UI === "widget" && !WIDGET_DOMAIN) throw new Error("MEDIAMARKT_MCP_WIDGET_DOMAIN is required when MEDIAMARKT_UI=widget");
  const s = new McpServer({ name: "mediamarkt", version: "0.2.0" });
  s.registerTool("ask_mediamarkt",
    { description: "Ask MediaMarkt NL's AI shopping assistant (product search, comparisons, availability, stores). It answers in the language of the question; returns the answer text plus structured products (name, price, seller, image, url).",
      inputSchema: { question: z.string(),
        language: z.enum(["nl", "en"]).default("en").describe("Storefront language: pick the language the user is writing in. 'en' gives English product names and /en/ URLs.") },
      _meta: UI === "widget" ? { ui: { resourceUri: WIDGET_URI }, "openai/outputTemplate": WIDGET_URI } : undefined },
    async ({ question, language }) => { const r = await askMediaMarkt(question, language);
      const products = r.products.map(p => `- ${p.name}${p.price == null ? "" : ` — € ${p.price}`}${p.seller ? ` — ${p.seller}` : ""}`).join("\n");
      return { content: [{ type: "text", text: [r.text, products && `Products:\n${products}`].filter(Boolean).join("\n\n") }], structuredContent: r }; });
  if (UI === "widget") s.registerResource("product-carousel", WIDGET_URI, { mimeType: WIDGET_MIME }, async () => ({
    contents: [{ uri: WIDGET_URI, mimeType: WIDGET_MIME, text: readFileSync(new URL("./widget.html", import.meta.url), "utf8"),
      _meta: { ui: { prefersBorder: false, domain: WIDGET_DOMAIN, csp: { resourceDomains: ["https://assets.mmsrg.com"] } } } }] }));
  return s;
}

function authorized(req) {
  if (!BEARER_TOKEN) return false;
  const expected = Buffer.from(`Bearer ${BEARER_TOKEN}`);
  const supplied = Buffer.from(req.headers.authorization || "");
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

function writeJson(res, status, body, headers = {}) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", ...headers });
  res.end(JSON.stringify(body));
}

const argv = process.argv.slice(2);
const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? "").href;
if (!isMain) {
  // imported as a library: export only
} else if (argv.includes("--check")) {
  const r = await askMediaMarkt("What is the cheapest Ubiquiti access point?");
  if (!(r.text.length > 20 && r.products.length > 0 && r.products[0].image)) { console.error("check failed", r); process.exit(1); }
  console.log("ok:", r.text.slice(0, 160).replace(/\n/g, " "), "| products:", r.products.length, "| ui:", UI);
} else if (argv.includes("--stdio")) {
  await build().connect(new StdioServerTransport());
} else {
  if (!BEARER_TOKEN || BEARER_TOKEN.length < 24) throw new Error("MEDIAMARKT_MCP_TOKEN is required and must contain at least 24 characters");
  if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) throw new Error(`Invalid MEDIAMARKT_MCP_PORT: ${process.env.MEDIAMARKT_MCP_PORT}`);
  createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host || `${HOST}:${PORT}`}`);
    if (url.pathname === "/health") {
      writeJson(res, 200, { ok: true, service: "mediamarkt-mcp" });
      return;
    }
    if (url.pathname === "/.well-known/oauth-protected-resource/mcp") {
      writeJson(res, 200, { resource: PUBLIC_URL, bearer_methods_supported: ["header"] });
      return;
    }
    if (url.pathname !== "/mcp") {
      writeJson(res, 404, { error: "not_found" });
      return;
    }
    if (!authorized(req)) {
      writeJson(res, 401, { jsonrpc: "2.0", error: { code: -32001, message: "Authentication required" }, id: null }, {
        "www-authenticate": `Bearer resource_metadata="${new URL("./.well-known/oauth-protected-resource/mcp", PUBLIC_URL)}"`,
      });
      return;
    }
    try {
      const t = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined }); // stateless
      await build().connect(t); await t.handleRequest(req, res);
    } catch (error) {
      if (!res.headersSent) writeJson(res, 500, { error: "internal_error" });
      else res.end();
      console.error(`mediamarkt-mcp request error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }).listen(PORT, HOST, () => console.error(`mediamarkt-mcp (${UI}) on http://${HOST}:${PORT}`));
}
