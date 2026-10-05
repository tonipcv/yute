import "server-only";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { LookupType, SourceRef } from "@/lib/types";

const TTL_DAYS: Record<LookupType, number> = { email: 30, domain: 30, name: 30, phone: 30 };

export function cacheKey(queryType: LookupType, value: string): string {
  return createHash("sha256").update(`${queryType}:${value.trim().toLowerCase()}`).digest("hex");
}

export interface CachedEntry {
  result: Record<string, unknown>;
  sources: SourceRef[];
  confidence: number;
  mode: string;
}

export async function getCached(queryType: LookupType, value: string): Promise<CachedEntry | null> {
  try {
    const row = await prisma.enrichmentCache.findUnique({ where: { key: cacheKey(queryType, value) } });
    if (!row || row.expiresAt.getTime() < Date.now()) return null;
    return {
      result: (row.result as Record<string, unknown>) ?? {},
      sources: (row.sources as unknown as SourceRef[]) ?? [],
      confidence: row.confidence,
      mode: row.mode ?? "cache",
    };
  } catch {
    return null;
  }
}

export async function setCached(
  queryType: LookupType,
  value: string,
  entry: CachedEntry & { costMicroUsd: number }
): Promise<void> {
  const expiresAt = new Date(Date.now() + TTL_DAYS[queryType] * 24 * 60 * 60 * 1000);
  try {
    await prisma.enrichmentCache.upsert({
      where: { key: cacheKey(queryType, value) },
      create: {
        key: cacheKey(queryType, value),
        queryType,
        query: value,
        result: entry.result as unknown as Prisma.InputJsonValue,
        sources: entry.sources as unknown as Prisma.InputJsonValue,
        confidence: entry.confidence,
        mode: entry.mode,
        costMicroUsd: entry.costMicroUsd,
        expiresAt,
      },
      update: {
        result: entry.result as unknown as Prisma.InputJsonValue,
        sources: entry.sources as unknown as Prisma.InputJsonValue,
        confidence: entry.confidence,
        mode: entry.mode,
        costMicroUsd: entry.costMicroUsd,
        expiresAt,
      },
    });
  } catch {
    // cache writes must never break a lookup
  }
}
