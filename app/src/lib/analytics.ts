import "server-only";
import { prisma } from "@/lib/prisma";

export interface ProviderRow {
  provider: string;
  attempts: number;
  hits: number;
  errors: number;
  coverage: number;
  costMicroUsd: number;
  avgMs: number;
}

export interface QualitySummary {
  requests: number;
  scanned: number;
  hitRate: number;
  coverage: number;
  quality: number;
  deliverableRate: number;
  creditUtilization: number;
  costMicroUsd: number;
  /** List value of consumed credits at the nominal price (not money received). */
  priceMicroUsd: number;
  /** Actual money collected from the customer in the window. */
  collectedMicroUsd: number;
  marginMicroUsd: number;
  marginPct: number;
  costPerDeliverableMicroUsd: number;
  spendBySource: Array<{ source: string; requests: number; costMicroUsd: number }>;
  providers: ProviderRow[];
}

export async function computeQuality(userId: string, sinceDays = 30): Promise<QualitySummary> {
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);

  const [total, counted, resolvedLogs, agg, bySource, providerGroups, collected] = await Promise.all([
    prisma.requestLog.count({ where: { userId, createdAt: { gte: since } } }),
    prisma.requestLog.count({ where: { userId, createdAt: { gte: since }, creditsCharged: { gt: 0 } } }),
    prisma.requestLog.findMany({
      where: { userId, createdAt: { gte: since } },
      select: { query: true, ok: true, confidence: true, cacheHit: true },
    }),
    prisma.requestLog.aggregate({
      where: { userId, createdAt: { gte: since } },
      _sum: { costMicroUsd: true, priceMicroUsd: true },
    }),
    prisma.requestLog.groupBy({
      by: ["source"],
      where: { userId, createdAt: { gte: since } },
      _count: { _all: true },
      _sum: { costMicroUsd: true },
    }),
    prisma.providerStat.groupBy({
      by: ["provider", "outcome"],
      where: { user: userId, createdAt: { gte: since } },
      _count: { _all: true },
      _sum: { costMicroUsd: true, ms: true },
    }),
    prisma.stripeEvent.aggregate({
      where: { userId, processedAt: { gte: since }, amountCents: { gt: 0 } },
      _sum: { amountCents: true },
    }),
  ]);

  const scanned = new Set(resolvedLogs.map((l) => l.query.toLowerCase())).size;
  const good = resolvedLogs.filter((l) => (l.confidence ?? 0) >= 50 || l.cacheHit).length;
  const costMicroUsd = agg._sum.costMicroUsd ?? 0;
  const priceMicroUsd = agg._sum.priceMicroUsd ?? 0;
  const collectedMicroUsd = (collected._sum.amountCents ?? 0) * 10_000;
  const marginMicroUsd = collectedMicroUsd - costMicroUsd;

  const providerMap = new Map<string, ProviderRow>();
  for (const g of providerGroups) {
    const row = providerMap.get(g.provider) ?? { provider: g.provider, attempts: 0, hits: 0, errors: 0, coverage: 0, costMicroUsd: 0, avgMs: 0 };
    const count = g._count._all;
    row.attempts += count;
    row.costMicroUsd += g._sum.costMicroUsd ?? 0;
    row.avgMs += g._sum.ms ?? 0;
    if (g.outcome === "result") row.hits += count;
    if (g.outcome === "error") row.errors += count;
    providerMap.set(g.provider, row);
  }
  const providers = [...providerMap.values()]
    .map((r) => ({ ...r, coverage: r.attempts ? Math.round((r.hits / r.attempts) * 100) : 0, avgMs: r.attempts ? Math.round(r.avgMs / r.attempts) : 0 }))
    .sort((a, b) => b.attempts - a.attempts);

  return {
    requests: total,
    scanned,
    hitRate: total ? Math.round((counted / total) * 100) : 0,
    coverage: scanned ? Math.round((resolvedLogs.filter((l) => (l.confidence ?? 0) >= 50).length / scanned) * 100) : 0,
    quality: resolvedLogs.length ? Math.round((good / resolvedLogs.length) * 100) : 0,
    deliverableRate: total ? Math.round((counted / total) * 100) : 0,
    creditUtilization: total ? Math.round((counted / total) * 100) : 0,
    costMicroUsd,
    priceMicroUsd,
    collectedMicroUsd,
    marginMicroUsd,
    marginPct: collectedMicroUsd ? Math.round((marginMicroUsd / collectedMicroUsd) * 100) : 0,
    costPerDeliverableMicroUsd: counted ? Math.round(costMicroUsd / counted) : 0,
    spendBySource: bySource
      .map((s) => ({ source: s.source ?? "internal", requests: s._count._all, costMicroUsd: s._sum.costMicroUsd ?? 0 }))
      .sort((a, b) => b.costMicroUsd - a.costMicroUsd),
    providers,
  };
}

export async function spendSummary(userId: string, sinceDays = 30) {
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
  const [agg, collected] = await Promise.all([
    prisma.requestLog.aggregate({
      where: { userId, createdAt: { gte: since } },
      _sum: { costMicroUsd: true, priceMicroUsd: true },
      _count: { _all: true },
    }),
    prisma.stripeEvent.aggregate({
      where: { userId, processedAt: { gte: since }, amountCents: { gt: 0 } },
      _sum: { amountCents: true },
    }),
  ]);
  const cost = agg._sum.costMicroUsd ?? 0;
  const price = agg._sum.priceMicroUsd ?? 0;
  const collectedMicroUsd = (collected._sum.amountCents ?? 0) * 10_000;
  const marginMicroUsd = collectedMicroUsd - cost;
  return {
    requests: agg._count._all,
    costMicroUsd: cost,
    priceMicroUsd: price,
    collectedMicroUsd,
    marginMicroUsd,
    marginPct: collectedMicroUsd ? Math.round((marginMicroUsd / collectedMicroUsd) * 100) : 0,
  };
}
