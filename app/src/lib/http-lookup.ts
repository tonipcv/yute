import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { runLookup, type LookupType } from "@/lib/lookup";
import { findApiKey } from "@/lib/apikey";
import { rateLimit } from "@/lib/ratelimit";
import { reserveCredit, settleCredit, billingDecision, priceMicroUsd, reserveCreditsFor } from "@/lib/credits";
import { buildResolvedCore } from "@/lib/quality";
import { recordProviderCalls } from "@/lib/provider-stats";

export interface LookupHttpResult {
  status: number;
  headers?: Record<string, string>;
  body: Record<string, unknown>;
}

function parseParams(url: URL) {
  const email = url.searchParams.get("email")?.trim().toLowerCase() ?? "";
  const domain = url.searchParams.get("domain")?.trim().toLowerCase() ?? "";
  const name = url.searchParams.get("name")?.trim() ?? "";
  const phone = url.searchParams.get("phone")?.trim() ?? "";
  const queryType = (email ? "email" : phone ? "phone" : domain ? "domain" : name ? "name" : null) as LookupType | null;
  return { queryType, query: email || phone || domain || name };
}

/** Shared synchronous lookup handler used by /v1/lookup and the /mcp alias middleware. */
export async function handleLookupRequest(request: Request): Promise<LookupHttpResult> {
  const started = Date.now();
  const auth = await findApiKey(request.headers.get("authorization"), request.headers.get("x-api-key"));
  if (!auth) {
    return { status: 401, body: { error: "Missing or invalid API key. Pass an active yute_ key in the Authorization header." } };
  }

  const rl = rateLimit(`key:${auth.id}`);
  if (!rl.ok) {
    return { status: 429, headers: { "retry-after": String(rl.retryAfterSeconds) }, body: { error: "Rate limit exceeded.", limit: rl.limit, retry_after: rl.retryAfterSeconds } };
  }

  const { queryType, query } = parseParams(new URL(request.url));
  if (!queryType || !query) {
    return { status: 400, body: { error: "Send one of ?email=, ?phone=, ?domain=, or ?name=." } };
  }

  const reserved = await reserveCredit(auth.userId, reserveCreditsFor(queryType));
  if (!reserved.ok) {
    return {
      status: 402,
      body: {
        error: reserved.reason === "monthly_limit" ? "Monthly lookup limit reached." : "Insufficient credits.",
        reason: reserved.reason,
        balance: reserved.balance,
      },
    };
  }

  let result;
  try {
    result = await runLookup(queryType, query);
  } catch (err) {
    await settleCredit(auth.userId, false, { reason: "error", reserved: reserved.reserved });
    return { status: 502, body: { error: err instanceof Error ? err.message : "lookup failed", balance: reserved.balance } };
  }

  const decision = billingDecision(queryType, result);
  const settled = await settleCredit(auth.userId, decision.billable, { reason: decision.reason, credits: decision.credits, reserved: reserved.reserved });
  const core = buildResolvedCore(result);

  await Promise.all([
    prisma.requestLog.create({
      data: {
        userId: auth.userId,
        apiKeyId: auth.id,
        queryType,
        query,
        ok: result.ok,
        ms: result.ms,
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
    prisma.apiKey.update({ where: { id: auth.id }, data: { lastUsedAt: new Date() } }),
    recordProviderCalls(result.providerCalls.map((c) => ({ user: auth.userId, provider: c.provider, outcome: c.outcome, costMicroUsd: c.costMicroUsd, ms: c.ms }))),
  ]);

  return {
    status: 200,
    headers: {
      "cache-control": "no-store",
      "x-yute-balance": String(settled.balance),
      "x-yute-credits-charged": String(settled.charged),
    },
    body: {
      request_id: randomUUID(),
      object: "lookup",
      query: { type: queryType, value: query },
      resolved: result.resolved,
      resolved_core: core,
      sources: result.sources,
      confidence: result.confidence,
      mode: result.mode,
      cache: result.cacheHit,
      billable: decision.billable,
      billing_reason: decision.reason,
      cost_usd: Number((result.costMicroUsd / 1_000_000).toFixed(6)),
      credits_charged: settled.charged,
      balance: settled.balance,
      rate_limit: { limit: rl.limit, remaining: rl.remaining },
      ms: Date.now() - started,
    },
  };
}
