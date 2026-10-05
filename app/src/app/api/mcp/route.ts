import { findApiKey } from "@/lib/apikey";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/ratelimit";
import { reserveCredit, settleCredit, billingDecision, reserveCreditsFor, priceMicroUsd } from "@/lib/credits";
import { buildResolvedCore } from "@/lib/quality";
import { recordProviderCalls } from "@/lib/provider-stats";
import { runLookup, type LookupType } from "@/lib/lookup";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROTOCOL_VERSION = "2025-06-18";

const LOOKUP_TOOL = {
  name: "lookup",
  description:
    "Look up a person or company. Provide exactly one of email, domain or name. Returns resolved data with sources, confidence and email deliverability validation.",
  inputSchema: {
    type: "object",
    properties: {
      email: { type: "string", description: "Person email to look up and validate" },
      domain: { type: "string", description: "Company domain to look up" },
      name: { type: "string", description: "Person full name to look up" },
    },
  },
};

interface RpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

function rpcResult(id: string | number | null | undefined, result: unknown) {
  return { jsonrpc: "2.0", id: id ?? null, result };
}
function rpcError(id: string | number | null | undefined, code: number, message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

export async function POST(request: Request) {
  const auth = await findApiKey(request.headers.get("authorization"), request.headers.get("x-api-key"));
  if (!auth) {
    return NextResponse.json(rpcError(null, -32001, "Missing or invalid API key"), { status: 401 });
  }

  let req: RpcRequest;
  try {
    req = (await request.json()) as RpcRequest;
  } catch {
    return NextResponse.json(rpcError(null, -32700, "Parse error"), { status: 400 });
  }

  const { id, method, params } = req;

  // Notifications (no id) get an empty 202.
  if (id === undefined || id === null) {
    if (method === "notifications/initialized") return new NextResponse(null, { status: 202 });
  }

  if (method === "initialize") {
    return NextResponse.json(
      rpcResult(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "yute", version: "1.0.0" },
      })
    );
  }

  if (method === "ping") return NextResponse.json(rpcResult(id, {}));

  if (method === "tools/list") {
    return NextResponse.json(rpcResult(id, { tools: [LOOKUP_TOOL] }));
  }

  if (method === "tools/call") {
    const name = String((params?.name as string) ?? "");
    const args = (params?.arguments as Record<string, unknown>) ?? {};
    if (name !== "lookup") return NextResponse.json(rpcError(id, -32602, `Unknown tool: ${name}`));

    const rl = rateLimit(`key:${auth.id}`);
    if (!rl.ok) return NextResponse.json(rpcError(id, -32003, "Rate limit exceeded"));

    const email = String(args.email ?? "").trim().toLowerCase();
    const domain = String(args.domain ?? "").trim().toLowerCase();
    const personName = String(args.name ?? "").trim();
    const queryType = (email ? "email" : domain ? "domain" : personName ? "name" : null) as LookupType | null;
    const query = email || domain || personName;
    if (!queryType || !query) {
      return NextResponse.json(rpcError(id, -32602, "Provide one of email, domain or name"));
    }

    const reserved = await reserveCredit(auth.userId, reserveCreditsFor(queryType));
    if (!reserved.ok) {
      return NextResponse.json(
        rpcResult(id, { isError: true, content: [{ type: "text", text: `Insufficient credits (${reserved.reason}).` }] })
      );
    }

    const started = Date.now();
    let result;
    try {
      result = await runLookup(queryType, query);
    } catch (err) {
      await settleCredit(auth.userId, false, { reason: "error", reserved: reserved.reserved });
      return NextResponse.json(
        rpcResult(id, { isError: true, content: [{ type: "text", text: `Lookup failed: ${err instanceof Error ? err.message : "unknown error"}` }] })
      );
    }
    const decision = billingDecision(queryType, result);
    const settled = await settleCredit(auth.userId, decision.billable, { reason: decision.reason, credits: decision.credits, reserved: reserved.reserved });

    // Record usage so MCP clients show up in logs, monthly usage and metrics.
    await Promise.all([
      prisma.requestLog.create({
        data: {
          userId: auth.userId,
          apiKeyId: auth.id,
          queryType,
          query,
          ok: result.ok,
          ms: result.ms || Date.now() - started,
          mode: result.mode,
          source: result.provider ?? (typeof result.resolved.source === "string" ? result.resolved.source : null),
          provider: result.provider ?? null,
          confidence: result.confidence,
          cacheHit: result.cacheHit,
          costMicroUsd: result.costMicroUsd,
          priceMicroUsd: priceMicroUsd(settled.charged),
          creditsCharged: settled.charged,
        },
      }),
      recordProviderCalls(result.providerCalls.map((c) => ({ user: auth.userId, provider: c.provider, outcome: c.outcome, costMicroUsd: c.costMicroUsd, ms: c.ms }))),
      prisma.apiKey.update({ where: { id: auth.id }, data: { lastUsedAt: new Date() } }),
    ]);

    return NextResponse.json(
      rpcResult(id, {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                resolved: result.resolved,
                resolved_core: buildResolvedCore(result),
                sources: result.sources,
                confidence: result.confidence,
                mode: result.mode,
                billable: decision.billable,
                billing_reason: decision.reason,
                credits_charged: settled.charged,
                balance: settled.balance,
              },
              null,
              2
            ),
          },
        ],
        isError: !result.ok,
      })
    );
  }

  return NextResponse.json(rpcError(id, -32601, `Method not found: ${method}`));
}

export async function GET() {
  return NextResponse.json({
    object: "mcp",
    protocolVersion: PROTOCOL_VERSION,
    tools: [LOOKUP_TOOL.name],
    hint: "POST JSON-RPC 2.0 with Authorization: Bearer <yute_ key>",
  });
}
