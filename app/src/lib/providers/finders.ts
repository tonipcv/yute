import "server-only";
import type { ProviderAdapter, ProviderInput, ProviderResult } from "@/lib/types";
import { firstEmail } from "@/lib/providers/util";
import { clayProvider } from "@/lib/providers/clay";

function splitName(input: ProviderInput): { first?: string; last?: string } {
  if (input.firstName || input.lastName) return { first: input.firstName, last: input.lastName };
  const name = input.name ?? "";
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return {};
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

async function postJson(url: string, headers: Record<string, string>, body: unknown, timeoutMs = 15000): Promise<{ ok: boolean; json: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const json = await res.json().catch(() => null);
    return { ok: res.ok, json };
  } catch {
    return { ok: false, json: null };
  } finally {
    clearTimeout(timer);
  }
}

/** Prospeo — cheap independent finder (~$0.01 per hit). */
export const prospeoFinder: ProviderAdapter = {
  id: "prospeo",
  supports: ["name", "domain", "email"],
  isConfigured: () => Boolean(process.env.PROSPEO_API_KEY),
  async run(input): Promise<ProviderResult | null> {
    const key = process.env.PROSPEO_API_KEY;
    if (!key) return null;
    const { first, last } = splitName(input);
    const company = input.domain ?? input.company;
    if (!first || !last || !company) return null;

    const { json } = await postJson("https://api.prospeo.io/email-finder", { "X-KEY": key }, {
      first_name: first,
      last_name: last,
      company,
    });
    const rec = json as { error?: boolean; error_code?: string } | null;
    if (!rec || rec.error) return null;
    const email = firstEmail(json);
    if (!email) return null;
    return {
      provider: "prospeo",
      fields: { emails: [email] },
      sources: [{ provider: "prospeo", field: "email", note: "email finder" }],
      confidence: 70,
      costMicroUsd: 10000,
    };
  },
};

/** Findymail — ranked #1 by Clay, ~$0.02 per verified hit. */
export const findymailFinder: ProviderAdapter = {
  id: "findymail",
  supports: ["name", "domain", "email"],
  isConfigured: () => Boolean(process.env.FINDYMAIL_API_KEY),
  async run(input): Promise<ProviderResult | null> {
    const key = process.env.FINDYMAIL_API_KEY;
    if (!key) return null;
    const name = input.name ?? (input.firstName && input.lastName ? `${input.firstName} ${input.lastName}` : undefined);
    const domain = input.domain ?? input.company;
    if (!name || !domain) return null;

    const { json } = await postJson("https://app.findymail.com/api/search/name", { Authorization: `Bearer ${key}` }, {
      name,
      domain,
    });
    const email = firstEmail(json);
    if (!email) return null;
    return {
      provider: "findymail",
      fields: { emails: [email] },
      sources: [{ provider: "findymail", field: "email", note: "email finder (verified)" }],
      confidence: 80,
      costMicroUsd: 20000,
    };
  },
};

/** Hunter — domain + name pattern finder, ~$0.02 per hit. */
export const hunterFinder: ProviderAdapter = {
  id: "hunter",
  supports: ["name", "domain", "email"],
  isConfigured: () => Boolean(process.env.HUNTER_API_KEY),
  async run(input): Promise<ProviderResult | null> {
    const key = process.env.HUNTER_API_KEY;
    if (!key) return null;
    const domain = input.domain ?? input.company;
    const { first, last } = splitName(input);
    if (!domain || !first) return null;

    const params = new URLSearchParams({ domain, first_name: first, api_key: key });
    if (last) params.set("last_name", last);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    let json: unknown = null;
    try {
      const res = await fetch(`https://api.hunter.io/v2/email-finder?${params.toString()}`, { signal: controller.signal });
      json = await res.json().catch(() => null);
    } catch {
      json = null;
    } finally {
      clearTimeout(timer);
    }
    const email = firstEmail((json as { data?: unknown } | null)?.data ?? json);
    if (!email) return null;
    return {
      provider: "hunter",
      fields: { emails: [email] },
      sources: [{ provider: "hunter", field: "email", note: "email finder" }],
      confidence: 65,
      costMicroUsd: 20000,
    };
  },
};

/**
 * Ordered cheapest-first so the first configured provider gets first crack.
 * Clay is the last resort (BYOK, one credit per routine run).
 */
export const FINDERS: ProviderAdapter[] = [prospeoFinder, findymailFinder, hunterFinder, clayProvider];

export function configuredFinders(): ProviderAdapter[] {
  return FINDERS.filter((f) => f.isConfigured());
}
