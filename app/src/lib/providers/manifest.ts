import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ProviderAdapter, ProviderInput, ProviderResult } from "@/lib/types";
import { firstEmail } from "@/lib/providers/util";

interface ManifestProvider {
  id: string;
  supports?: string[];
  enabled?: boolean;
  method?: "GET" | "POST";
  url: string;
  headers?: Record<string, string>;
  query?: Record<string, string>;
  body?: Record<string, unknown>;
  result?: Record<string, string>;
  costMicroUsd?: number;
  timeoutMs?: number;
  authEnv?: string;
  authHeader?: string;
  authPrefix?: string;
  confidence?: number;
  sourceNote?: string;
}

function loadManifest(): ManifestProvider[] {
  const inline = process.env.YUTE_PROVIDERS_JSON;
  if (inline) {
    try {
      const parsed = JSON.parse(inline);
      return Array.isArray(parsed) ? parsed : (parsed.providers ?? []);
    } catch {
      return [];
    }
  }
  const file = process.env.YUTE_PROVIDERS_FILE ?? join(process.cwd(), "providers.json");
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    const list = Array.isArray(parsed) ? parsed : (parsed.providers ?? []);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function envInterpolate(value: string): string {
  return value.replace(/\$\{([A-Z0-9_]+)\}/gi, (_, name: string) => process.env[name] ?? "");
}

function tokenValue(input: ProviderInput, token: string): string | undefined {
  switch (token) {
    case "value":
      return input.value;
    case "queryType":
      return input.queryType;
    case "email":
      return input.email;
    case "phone":
      return input.phone;
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

function template(value: unknown, input: ProviderInput): unknown {
  if (typeof value === "string") {
    return value.replace(/\{\{([a-zA-Z]+)\}\}/g, (_, token: string) => tokenValue(input, token) ?? "");
  }
  if (Array.isArray(value)) return value.map((v) => template(v, input));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = template(v, input);
    return out;
  }
  return value;
}

function resolvePath(obj: unknown, path: string): unknown {
  const parts = path.split(".").filter(Boolean);
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function makeAdapter(spec: ManifestProvider): ProviderAdapter {
  return {
    id: spec.id,
    supports: (spec.supports ?? ["name", "domain", "email"]) as ProviderInput["queryType"][],
    isConfigured: () => {
      if (spec.enabled === false) return false;
      if (spec.authEnv && !process.env[spec.authEnv]) return false;
      for (const value of Object.values(spec.headers ?? {})) {
        if (/\$\{[A-Z0-9_]+\}/i.test(value) && !envInterpolate(value)) return false;
      }
      return true;
    },
    async run(input: ProviderInput): Promise<ProviderResult | null> {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      for (const [k, v] of Object.entries(spec.headers ?? {})) headers[k] = envInterpolate(v);
      if (spec.authEnv && spec.authHeader) {
        const key = process.env[spec.authEnv] ?? "";
        if (!key) return null;
        headers[spec.authHeader] = `${spec.authPrefix ?? ""}${key}`;
      }

      const method = spec.method ?? "POST";
      let url = spec.url;
      if (spec.query) {
        const params = new URLSearchParams();
        for (const [k, v] of Object.entries(spec.query)) {
          const resolved = tokenValue(input, v);
          if (resolved) params.set(k, resolved);
        }
        if (params.toString()) url += (url.includes("?") ? "&" : "?") + params.toString();
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), spec.timeoutMs ?? 15_000);
      try {
        const res = await fetch(url, {
          method,
          headers,
          body: method === "POST" && spec.body ? JSON.stringify(template(spec.body, input)) : undefined,
          signal: controller.signal,
        });
        if (!res.ok) return null;
        const json = await res.json().catch(() => null);
        if (json == null) return null;

        const fields: Record<string, unknown> = {};
        for (const [field, path] of Object.entries(spec.result ?? {})) {
          let value: unknown = resolvePath(json, path);
          if (field === "email" && (typeof value !== "string" || !value)) value = firstEmail(json);
          if (Array.isArray(value)) value = value[0];
          if (value != null && value !== "") fields[field === "email" ? "emails" : field] = field === "email" ? [String(value)] : value;
        }
        if (Object.keys(fields).length === 0) return null;

        return {
          provider: spec.id,
          fields,
          sources: [{ provider: spec.id, field: fields.emails ? "email" : "person", note: spec.sourceNote ?? "manifest provider" }],
          confidence: spec.confidence ?? 65,
          costMicroUsd: spec.costMicroUsd ?? 10_000,
        };
      } catch {
        return null;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

export function manifestProviders(): ProviderAdapter[] {
  return loadManifest()
    .filter((spec) => spec && typeof spec.id === "string" && typeof spec.url === "string")
    .map(makeAdapter);
}
