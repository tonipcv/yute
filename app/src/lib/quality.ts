import type { LookupResult } from "@/lib/types";

export interface ResolvedCore {
  email: string | null;
  emailStatus: string | null;
  deliverable: boolean | null;
  confidence: number;
  mode: string;
  cache: boolean;
  provider: string | null;
}

export function buildResolvedCore(result: LookupResult): ResolvedCore {
  const r = result.resolved;
  const email = typeof r.email === "string" ? r.email : Array.isArray(r.emails) && r.emails.length ? String(r.emails[0]) : null;
  return {
    email,
    emailStatus: typeof r.status === "string" ? r.status : null,
    deliverable: typeof r.deliverable === "boolean" ? r.deliverable : null,
    confidence: result.confidence,
    mode: result.mode,
    cache: result.cacheHit,
    provider: result.provider ?? (typeof r.source === "string" ? r.source : null),
  };
}
