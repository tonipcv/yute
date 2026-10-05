"use server";

import { requireSessionUserId } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { runLookup, type LookupType } from "@/lib/lookup";
import { reserveCredit, settleCredit, billingDecision, priceMicroUsd, reserveCreditsFor } from "@/lib/credits";
import { buildResolvedCore } from "@/lib/quality";
import { recordProviderCalls } from "@/lib/provider-stats";

export interface PlaygroundState {
  ok: boolean;
  error?: string;
  query?: string;
  queryType?: LookupType;
  ms?: number;
  resolved?: Record<string, unknown>;
  sources?: unknown[];
  confidence?: number;
  costUsd?: number;
  mode?: string;
  cache?: boolean;
  creditsCharged?: number;
  balance?: number;
  resolvedCore?: ReturnType<typeof buildResolvedCore>;
}

export async function runLookupAction(_prev: PlaygroundState | undefined, formData: FormData): Promise<PlaygroundState> {
  const userId = await requireSessionUserId();
  const queryType = String(formData.get("queryType") ?? "") as LookupType;
  const raw = String(formData.get("query") ?? "").trim();
  const query = queryType === "name" ? raw : raw.toLowerCase();

  if (!queryType || !["email", "domain", "name"].includes(queryType)) {
    return { ok: false, error: "Unknown query type." };
  }
  if (!query) {
    return { ok: false, error: "Type a value to look up." };
  }

  const reserved = await reserveCredit(userId, reserveCreditsFor(queryType));
  if (!reserved.ok) {
    return {
      ok: false,
      error: reserved.reason === "monthly_limit" ? "Monthly lookup limit reached." : "Insufficient credits.",
      balance: reserved.balance,
    };
  }

  let result;
  try {
    result = await runLookup(queryType, query);
  } catch (err) {
    const refunded = await settleCredit(userId, false, { reason: "error", reserved: reserved.reserved });
    return { ok: false, error: err instanceof Error ? err.message : "Lookup failed.", balance: refunded.balance };
  }
  const decision = billingDecision(queryType, result);
  const settled = await settleCredit(userId, decision.billable, { reason: decision.reason, credits: decision.credits, reserved: reserved.reserved });

  await Promise.all([
    prisma.requestLog.create({
      data: {
        userId,
        apiKeyId: null,
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
    recordProviderCalls(result.providerCalls.map((c) => ({ user: userId, provider: c.provider, outcome: c.outcome, costMicroUsd: c.costMicroUsd, ms: c.ms }))),
  ]);

  return {
    ok: result.ok,
    error: result.error,
    query,
    queryType,
    ms: result.ms,
    resolved: result.resolved,
    sources: result.sources,
    confidence: result.confidence,
    costUsd: Number((result.costMicroUsd / 1_000_000).toFixed(6)),
    mode: result.mode,
    cache: result.cacheHit,
    creditsCharged: settled.charged,
    balance: settled.balance,
    resolvedCore: buildResolvedCore(result),
  };
}
