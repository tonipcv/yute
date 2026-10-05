import "server-only";
import type { LookupType, LookupResult, ProviderInput, ProviderCall, SourceRef } from "@/lib/types";
import { isDataForSeoConfigured, dataforseoSerp } from "@/lib/providers/dataforseo";
import { configuredProviders } from "@/lib/providers";
import { fetchPageText } from "@/lib/web";
import { extractFromWeb } from "@/lib/extract";
import { verifyEmail, resolveMx } from "@/lib/email-verify";
import { normalizePhone } from "@/lib/phone";
import { getCached, setCached } from "@/lib/cache";

export type { LookupType, LookupResult } from "@/lib/types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function buildInput(queryType: LookupType, value: string): ProviderInput {
  if (queryType === "email") {
    const domain = value.split("@")[1];
    return { queryType, value, email: value, domain };
  }
  if (queryType === "domain") {
    return { queryType, value, domain: value };
  }
  if (queryType === "phone") {
    const { e164 } = normalizePhone(value);
    return { queryType, value, phone: e164 ?? value };
  }
  const parts = value.trim().split(/\s+/);
  return {
    queryType,
    value,
    name: value,
    firstName: parts.length >= 2 ? parts[0] : undefined,
    lastName: parts.length >= 2 ? parts.slice(1).join(" ") : undefined,
  };
}

function buildKeyword(input: ProviderInput): string {
  if (input.queryType === "email") return `"${input.email}"`;
  if (input.queryType === "domain") return `${input.domain} company`;
  if (input.queryType === "phone") return `"${input.phone ?? input.value}"`;
  return input.name ? `"${input.name}"` : input.value;
}

function firstEmailFrom(fields: Record<string, unknown>): string | null {
  const raw = fields.emails;
  if (Array.isArray(raw)) {
    for (const e of raw) {
      const v = String(e).trim().toLowerCase();
      if (EMAIL_RE.test(v)) return v;
    }
  }
  const single = fields.email;
  if (typeof single === "string" && EMAIL_RE.test(single.toLowerCase())) return single.toLowerCase();
  return null;
}

export async function runLookup(queryType: LookupType, queryRaw: string): Promise<LookupResult> {
  const started = Date.now();
  const query = queryType === "name" ? queryRaw.trim() : queryRaw.trim().toLowerCase();
  const input = buildInput(queryType, query);
  const calls: ProviderCall[] = [];

  // 1. cache
  const cached = await getCached(queryType, query);
  if (cached) {
    return {
      ok: true,
      ms: Date.now() - started,
      resolved: cached.result,
      sources: cached.sources,
      confidence: cached.confidence,
      costMicroUsd: 0,
      cacheHit: true,
      mode: "cache",
      provider: undefined,
      providerCalls: [],
    };
  }

  const resolved: Record<string, unknown> = {};
  const sources: SourceRef[] = [];
  const modes: string[] = [];
  let costMicroUsd = 0;
  let confidence = 0;

  // 2. web-first: DataForSEO SERP + light page fetch + LLM extraction
  if (isDataForSeoConfigured()) {
    const serp = await dataforseoSerp(buildKeyword(input), {
      onResult: (outcome, ms) => calls.push({ provider: "dataforseo", outcome, costMicroUsd: outcome === "result" ? 2000 : 0, ms }),
    });
    if (serp) {
      costMicroUsd += serp.costMicroUsd;
      modes.push("web");

      const pages: Array<{ url: string; text: string }> = [];
      await Promise.all(
        serp.results.slice(0, 3).map(async (r) => {
          const text = await fetchPageText(r.url);
          if (text) pages.push({ url: r.url, text });
        })
      );

      const exStart = Date.now();
      const ex = await extractFromWeb(input, serp.results, pages);
      calls.push({
        provider: ex.extractor === "heuristic" ? "heuristic" : "llm",
        outcome: Object.keys(ex.fields).length ? "result" : "miss",
        costMicroUsd: ex.costMicroUsd,
        ms: Date.now() - exStart,
      });
      costMicroUsd += ex.costMicroUsd;
      sources.push(...ex.sources);
      Object.assign(resolved, ex.fields);
      confidence = Math.max(confidence, ex.confidence);
      modes.push(ex.extractor);

      // Always keep the raw links available as evidence.
      resolved.webResults = serp.results.slice(0, 5).map((r) => ({ title: r.title, url: r.url }));
    }
  }

  if (!input.domain && typeof resolved.companyDomain === "string") input.domain = resolved.companyDomain;
  if (!input.company && typeof resolved.companyName === "string") input.company = resolved.companyName;
  if (!input.company && typeof resolved.company === "string") input.company = resolved.company;

  let candidateEmail = input.email ?? firstEmailFrom(resolved) ?? undefined;
  if (queryType === "email" && !candidateEmail) candidateEmail = query;

  // 3. paid finder fallback (cheapest first) only if we still have no email
  let usedProvider: string | undefined;
  const maxCostMicroUsd = Number(process.env.YUTE_MAX_COST_MICRO_USD ?? 200_000);
  const candidatePhone = queryType === "phone" ? input.phone : undefined;
  if (!candidateEmail && !candidatePhone) {
    for (const finder of configuredProviders()) {
      if (costMicroUsd >= maxCostMicroUsd) break;
      if (!finder.supports.includes(queryType)) continue;
      const finderStart = Date.now();
      let result = null;
      let failed = false;
      try {
        result = await finder.run(input);
      } catch {
        failed = true;
      }
      const foundEmail = result ? firstEmailFrom(result.fields) : null;
      const foundPhone = result && typeof result.fields.phone === "string" ? (result.fields.phone as string) : null;
      calls.push({
        provider: finder.id,
        outcome: failed ? "error" : result ? "result" : "miss",
        costMicroUsd: result ? result.costMicroUsd : 0,
        ms: Date.now() - finderStart,
      });
      if (result) {
        costMicroUsd += result.costMicroUsd;
        sources.push(...result.sources);
        Object.assign(resolved, result.fields);
        confidence = Math.max(confidence, result.confidence);
        candidateEmail = foundEmail ?? candidateEmail;
        usedProvider = finder.id;
        modes.push(`provider:${finder.id}`);
        resolved.source = finder.id;
        if (foundEmail || foundPhone) break;
      }
    }
  }

  // 4. internal verification
  if (queryType === "email" || candidateEmail) {
    const target = queryType === "email" ? query : candidateEmail!;
    const vStart = Date.now();
    const verification = await verifyEmail(target);
    calls.push({ provider: "internal-verify", outcome: "result", costMicroUsd: 0, ms: Date.now() - vStart });
    resolved.email = verification.email;
    resolved.syntaxValid = verification.syntaxValid;
    resolved.domain = verification.domain;
    resolved.mxRecords = verification.mxRecords;
    resolved.deliverable = verification.status === "valid" || verification.status === "catch_all";
    resolved.status = verification.status;
    resolved.verification = verification;
    confidence = Math.max(confidence, verification.score);
    modes.push("verify");
  }

  if (queryType === "domain") {
    const mx = await resolveMx(query);
    resolved.domain = resolved.domain ?? query;
    resolved.mxRecords = mx.length;
    resolved.mxHost = mx[0] ?? null;
    resolved.domainLive = mx.length > 0;
  }

  if (queryType === "phone") {
    const norm = normalizePhone(query);
    const fromProvider = typeof resolved.phone === "string" && resolved.phone.length > 0;
    resolved.phone = fromProvider ? resolved.phone : norm.e164 ?? query;
    resolved.phoneValid = Boolean(norm.e164) || fromProvider;
    if (typeof resolved.lineType !== "string") resolved.lineType = "unknown";
    // Confirmed only when a provider returned a carrier-verified number.
    if (typeof resolved.verified !== "boolean") resolved.verified = false;
    if (resolved.phoneValid) confidence = Math.max(confidence, resolved.lineType !== "unknown" ? 70 : 40);
    modes.push("phone");
  }

  if (queryType === "name") {
    resolved.name = resolved.name ?? query;
  }

  const mode = modes.length ? modes.join("+") : "validation-only";
  const finalConfidence = Math.min(98, Math.max(0, Math.round(confidence)));

  const result: LookupResult = {
    ok: true,
    ms: Date.now() - started,
    resolved,
    sources,
    confidence: finalConfidence,
    costMicroUsd,
    cacheHit: false,
    mode,
    provider: usedProvider,
    providerCalls: calls,
  };

  await setCached(queryType, query, {
    result: resolved,
    sources,
    confidence: finalConfidence,
    mode,
    costMicroUsd,
  });

  return result;
}
