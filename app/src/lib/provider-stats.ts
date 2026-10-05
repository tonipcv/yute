import "server-only";
import { prisma } from "@/lib/prisma";

export type ProviderOutcome = "result" | "miss" | "error";

export interface ProviderCallRecord {
  user: string;
  provider: string;
  outcome: ProviderOutcome;
  costMicroUsd?: number;
  ms?: number;
}

/** Fire-and-forget telemetry for a provider call. Never throws. */
export async function recordProviderCalls(records: ProviderCallRecord[]): Promise<void> {
  if (!records.length) return;
  try {
    await prisma.providerStat.createMany({ data: records });
  } catch {
    // observability must never break a lookup
  }
}
