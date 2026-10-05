import "server-only";
import type { ProviderAdapter, ProviderInput, ProviderResult } from "@/lib/types";
import { firstEmail, firstString } from "@/lib/providers/util";

const DEFAULT_INPUT_MAP: Record<string, string> = {
  Email: "email",
  domain: "domain",
  full_name: "name",
};

function inputMap(): Record<string, string> {
  const raw = process.env.CLAY_INPUTS;
  if (!raw) return DEFAULT_INPUT_MAP;
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return Object.keys(parsed).length ? parsed : DEFAULT_INPUT_MAP;
  } catch {
    return DEFAULT_INPUT_MAP;
  }
}

function tokenValue(input: ProviderInput, token: string): string | undefined {
  switch (token) {
    case "email":
      return input.email;
    case "domain":
      return input.domain ?? input.company;
    case "company":
      return input.company ?? input.domain;
    case "name":
      return input.name ?? (input.firstName && input.lastName ? `${input.firstName} ${input.lastName}` : undefined);
    case "firstName":
      return input.firstName;
    case "lastName":
      return input.lastName;
    default:
      return undefined;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Pick the routine for a query type: CLAY_ROUTINES map first, then the single CLAY_ROUTINE_ID. */
function routineFor(queryType: string): string | undefined {
  const raw = process.env.CLAY_ROUTINES;
  if (raw) {
    try {
      const map = JSON.parse(raw) as Record<string, string>;
      if (map[queryType]) return map[queryType];
    } catch {
      // ignore malformed map
    }
  }
  return process.env.CLAY_ROUTINE_ID;
}

/**
 * Clay as an optional provider (BYOK). Runs a configured Clay routine
 * ("Enrich Person and Find Contact Details") and reads the result.
 * Requires CLAY_API_KEY + CLAY_ROUTINE_ID. Placed last in the waterfall.
 */
export const clayProvider: ProviderAdapter = {
  id: "clay",
  supports: ["email", "domain", "name"],
  isConfigured: () => Boolean(process.env.CLAY_API_KEY && (process.env.CLAY_ROUTINE_ID || process.env.CLAY_ROUTINES)),
  async run(input: ProviderInput): Promise<ProviderResult | null> {
    const apiKey = process.env.CLAY_API_KEY;
    const routineId = routineFor(input.queryType);
    if (!apiKey || !routineId) return null;

    const base = process.env.CLAY_API_BASE ?? "https://api.clay.com/public/v0";
    const headers = { "Content-Type": "application/json", "clay-api-key": apiKey };

    const inputs: Record<string, string> = {};
    for (const [clayKey, token] of Object.entries(inputMap())) {
      const value = tokenValue(input, token);
      if (value) inputs[clayKey] = value;
    }
    if (Object.keys(inputs).length === 0) return null;

    try {
      const startRes = await fetch(`${base}/routines/${routineId}/run`, {
        method: "POST",
        headers,
        body: JSON.stringify({ items: [{ id: `yute-${input.queryType}`, inputs }] }),
      });
      if (!startRes.ok) return null;
      const start = (await startRes.json()) as { routine_run_id?: string };
      const runId = start.routine_run_id;
      if (!runId) return null;

      const deadline = Date.now() + Number(process.env.CLAY_TIMEOUT_MS ?? 30_000);
      while (Date.now() < deadline) {
        await sleep(Number(process.env.CLAY_POLL_MS ?? 2500));
        const res = await fetch(`${base}/routines/run/${runId}/results`, { headers });
        if (!res.ok) continue;
        const body = (await res.json()) as {
          status?: string;
          data?: Array<{ status?: string; result?: unknown }>;
        };
        if (body.status !== "complete") continue;

        const result = body.data?.[0]?.result ?? null;
        const email = firstEmail(result);
        const fullName = firstString(result, ["name", "full_name", "fullName"]);
        const role = firstString(result, ["title", "job_title", "role"]);
        const company = firstString(result, ["company", "company_name", "org", "organization"]);
        const linkedin = firstString(result, ["linkedin", "linkedin_url", "profile_url"]);

        const fields: Record<string, unknown> = {};
        if (email) fields.emails = [email];
        if (fullName) fields.fullName = fullName;
        if (role) fields.role = role;
        if (company) fields.company = company;
        if (linkedin) fields.linkedin = linkedin;
        if (Object.keys(fields).length === 0) return null;

        return {
          provider: "clay",
          fields,
          sources: [{ provider: "clay", field: email ? "email" : "person", note: "clay routine" }],
          confidence: email ? 75 : 60,
          costMicroUsd: Number(process.env.CLAY_COST_MICRO_USD ?? 20000),
        };
      }
      return null;
    } catch {
      return null;
    }
  },
};
