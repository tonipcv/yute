export type LookupType = "email" | "domain" | "name" | "phone";

export interface SourceRef {
  provider: string;
  field: string;
  url?: string;
  note?: string;
}

export interface ProviderInput {
  queryType: LookupType;
  value: string;
  email?: string;
  domain?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  phone?: string;
}

export interface ProviderResult {
  provider: string;
  fields: Record<string, unknown>;
  sources: SourceRef[];
  confidence: number;
  costMicroUsd: number;
}

export interface ProviderAdapter {
  id: string;
  supports: LookupType[];
  isConfigured(): boolean;
  run(input: ProviderInput): Promise<ProviderResult | null>;
}

export type ProviderOutcome = "result" | "miss" | "error";

export interface ProviderCall {
  provider: string;
  outcome: ProviderOutcome;
  costMicroUsd: number;
  ms: number;
}

export interface LookupResult {
  ok: boolean;
  ms: number;
  resolved: Record<string, unknown>;
  sources: SourceRef[];
  confidence: number;
  costMicroUsd: number;
  cacheHit: boolean;
  mode: string;
  provider?: string;
  providerCalls: ProviderCall[];
  error?: string;
}
