import "server-only";
import type { ProviderInput, SourceRef } from "@/lib/types";
import type { SerpResult } from "@/lib/providers/dataforseo";
import { heuristicExtract } from "@/lib/extract-heuristic";
import { llmConfig, isLlmConfigured, chatJson } from "@/lib/llm";

export { isLlmConfigured };

export interface ExtractResult {
  fields: Record<string, unknown>;
  sources: SourceRef[];
  confidence: number;
  costMicroUsd: number;
  extractor: "heuristic" | "llm" | "heuristic+llm";
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const SYSTEM =
  "You extract structured B2B person/company data from web search results and page text. " +
  "Only report values that appear verbatim in the provided sources. Never invent, guess or infer an email address. " +
  "If a field is not present, return null (or an empty array). Return strict JSON only.";
const SCHEMA =
  '{"person":{"fullName":null,"firstName":null,"lastName":null,"role":null,"company":null,"linkedin":null,"emails":[],"socials":[]},' +
  '"company":{"name":null,"domain":null,"description":null},' +
  '"evidence":[{"field":"email","value":"...","url":"https://..."}]}';

function buildUserPrompt(input: ProviderInput, serp: SerpResult[], pages: Array<{ url: string; text: string }>): string {
  const inputPreview = [
    `query_type: ${input.queryType}`,
    `value: ${input.value}`,
    input.domain ? `known_domain: ${input.domain}` : "",
    input.name ? `known_name: ${input.name}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const searchBlock = serp.slice(0, 10).map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.description}`).join("\n\n");
  const pageBlock = pages.slice(0, 3).map((p, i) => `--- page ${i + 1}: ${p.url} ---\n${p.text.slice(0, 6000)}`).join("\n\n");
  return `INPUT\n${inputPreview}\n\nSEARCH RESULTS\n${searchBlock}\n\nPAGE CONTENT\n${pageBlock || "(none)"}\n\nReturn JSON with this exact shape:\n${SCHEMA}`;
}

/**
 * Extract person/company data. Always runs the deterministic heuristic pass;
 * if an LLM is configured it runs on top and merges (LLM wins on conflicts).
 */
export async function extractFromWeb(
  input: ProviderInput,
  serp: SerpResult[],
  pages: Array<{ url: string; text: string }>
): Promise<ExtractResult> {
  const base = heuristicExtract(input, serp, pages);
  const fields: Record<string, unknown> = { ...base.fields };
  const sources: SourceRef[] = [...base.sources];
  let confidence = base.confidence;
  let costMicroUsd = 0;
  let extractor: ExtractResult["extractor"] = "heuristic";

  const cfg = llmConfig();
  if (!cfg) return { fields, sources, confidence, costMicroUsd, extractor };

  const out = await chatJson(cfg, SYSTEM, buildUserPrompt(input, serp, pages));
  if (!out) return { fields, sources, confidence, costMicroUsd, extractor };

  costMicroUsd += out.costMicroUsd;
  extractor = "heuristic+llm";

  try {
    const parsed = JSON.parse(out.content) as {
      person?: Record<string, unknown>;
      company?: Record<string, unknown>;
      evidence?: Array<{ field?: string; value?: string; url?: string }>;
    };
    const person = parsed.person ?? {};
    const company = parsed.company ?? {};
    const emails = Array.isArray(person.emails)
      ? (person.emails as unknown[]).map((e) => String(e).trim().toLowerCase()).filter((e) => EMAIL_RE.test(e))
      : [];

    const llmFields: Record<string, unknown> = {};
    if (person.fullName) llmFields.fullName = person.fullName;
    if (person.firstName) llmFields.firstName = person.firstName;
    if (person.lastName) llmFields.lastName = person.lastName;
    if (person.role) llmFields.role = person.role;
    if (person.company) llmFields.company = person.company;
    if (person.linkedin) llmFields.linkedin = person.linkedin;
    if (Array.isArray(person.socials) && person.socials.length) llmFields.socials = person.socials;
    if (emails.length) llmFields.emails = emails;
    if (company.name) llmFields.companyName = company.name;
    if (company.domain) llmFields.companyDomain = company.domain;
    if (company.description) llmFields.companyDescription = company.description;

    Object.assign(fields, llmFields);
    for (const ev of parsed.evidence ?? []) {
      if (!ev || typeof ev.value !== "string") continue;
      sources.push({ provider: "dataforseo+llm", field: String(ev.field ?? "unknown"), url: ev.url, note: "extracted" });
    }
    if (emails.length) confidence = Math.max(confidence, 78);
    else if (llmFields.fullName || llmFields.companyName) confidence = Math.max(confidence, 55);
  } catch {
    // heuristic result stands
  }

  return { fields, sources, confidence, costMicroUsd, extractor };
}
