#!/usr/bin/env node
/**
 * yute MCP server (stdio).
 *
 * Env:
 *   YUTE_API_KEY      required — a yute_ API key
 *   YUTE_API_BASE_URL optional — default https://yute.heuv.dev
 *
 * Usage (Claude Desktop claude_desktop_config.json):
 *   { "mcpServers": { "yute": {
 *       "command": "node",
 *       "args": ["/path/to/mcp-server.js"],
 *       "env": { "YUTE_API_KEY": "yute_..." }
 *   } } }
 */
const readline = require("node:readline");

const API_BASE = (process.env.YUTE_API_BASE_URL || "https://app.yute.io").replace(/\/$/, "");
const API_KEY = process.env.YUTE_API_KEY;
const PROTOCOL_VERSION = "2025-06-18";

const TOOLS = [
  {
    name: "lookup",
    description:
      "Resolve a person or company. Provide exactly one of email, domain, name or phone. Returns resolved data, sources, confidence and email deliverability.",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string", description: "Person email to look up and validate" },
        domain: { type: "string", description: "Company domain to look up" },
        name: { type: "string", description: "Person full name to look up" },
        phone: { type: "string", description: "Phone number to normalize/validate" },
      },
    },
  },
  {
    name: "validate_email",
    description: "Validate a single email address (syntax, MX, SMTP, catch-all).",
    inputSchema: {
      type: "object",
      properties: { email: { type: "string" } },
      required: ["email"],
    },
  },
];

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

function result(id, value) {
  send({ jsonrpc: "2.0", id: id ?? null, result: value });
}

function error(id, code, message) {
  send({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
}

async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${API_KEY}`, accept: "application/json" },
  });
  return { ok: res.ok, status: res.status, json: await res.json().catch(() => null) };
}

async function callTool(name, args) {
  if (!API_KEY) return { isError: true, content: [{ type: "text", text: "YUTE_API_KEY is not set." }] };

  if (name === "lookup") {
    const { email, domain, name: personName, phone } = args || {};
    const params = new URLSearchParams();
    if (email) params.set("email", email);
    else if (phone) params.set("phone", phone);
    else if (domain) params.set("domain", domain);
    else if (personName) params.set("name", personName);
    else return { isError: true, content: [{ type: "text", text: "Provide one of email, domain, name or phone." }] };

    const { ok, json } = await apiGet(`/v1/lookup?${params.toString()}`);
    if (!ok) return { isError: true, content: [{ type: "text", text: JSON.stringify(json) }] };
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              resolved: json.resolved,
              resolved_core: json.resolved_core,
              sources: json.sources,
              confidence: json.confidence,
              mode: json.mode,
              credits_charged: json.credits_charged,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  if (name === "validate_email") {
    if (!args?.email) return { isError: true, content: [{ type: "text", text: "email is required." }] };
    const { ok, json } = await apiGet(`/v1/validate?email=${encodeURIComponent(args.email)}`);
    if (!ok) return { isError: true, content: [{ type: "text", text: JSON.stringify(json) }] };
    return { content: [{ type: "text", text: JSON.stringify(json, null, 2) }] };
  }

  return { isError: true, content: [{ type: "text", text: `Unknown tool: ${name}` }] };
}

async function handle(msg) {
  const { id, method, params } = msg;
  if (method === "initialize") {
    return result(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "yute", version: "1.0.0" },
    });
  }
  if (method === "notifications/initialized") return;
  if (method === "ping") return result(id, {});
  if (method === "tools/list") return result(id, { tools: TOOLS });
  if (method === "tools/call") {
    if (id === undefined || id === null) return;
    const out = await callTool(String(params?.name || ""), params?.arguments || {});
    return result(id, out);
  }
  if (id !== undefined && id !== null) error(id, -32601, `Method not found: ${method}`);
}

function main() {
  const rl = readline.createInterface({ input: process.stdin, terminal: false });
  rl.on("line", (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let msg;
    try {
      msg = JSON.parse(trimmed);
    } catch {
      return;
    }
    Promise.resolve(handle(msg)).catch((err) => error(msg?.id, -32603, err instanceof Error ? err.message : "internal error"));
  });
}

main();
