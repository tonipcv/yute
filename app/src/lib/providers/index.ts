import "server-only";
import type { ProviderAdapter, LookupType } from "@/lib/types";
import { FINDERS } from "@/lib/providers/finders";
import { manifestProviders } from "@/lib/providers/manifest";

/** All known providers: native finders + config-driven manifest providers. */
export function allProviders(): ProviderAdapter[] {
  return [...FINDERS, ...manifestProviders()];
}

export function configuredProviders(): ProviderAdapter[] {
  return allProviders().filter((p) => p.isConfigured());
}

export interface ProviderInfo {
  id: string;
  supports: LookupType[];
  configured: boolean;
}

export function providerCatalog(): ProviderInfo[] {
  return allProviders().map((p) => ({
    id: p.id,
    supports: p.supports as LookupType[],
    configured: p.isConfigured(),
  }));
}
