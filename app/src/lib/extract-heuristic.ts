import "server-only";
import type { ProviderInput, SourceRef } from "@/lib/types";
import type { SerpResult } from "@/lib/providers/dataforseo";

const EMAIL_RE = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;
const EMAIL_SCAN_RE = /[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+/gi;
const ROLE_RE = /\b(founder|co-?founder|ceo|cto|cfo|coo|cmo|vp|vice president|head of|director|manager|lead|engineer|developer|designer|sales|marketing|growth|product|recruiter|partner)\b/i;

const ROLE_NOISE = new Set([
  "about", "home", "contact", "login", "signin", "sign in", "blog", "news", "privacy",
  "terms", "careers", "jobs", "press", "products", "pricing", "docs", "help", "support",
]);

const EVENT_DOMAINS = [
  "linkedin.com", "twitter.com", "x.com", "facebook.com", "instagram.com", "youtube.com",
  "crunchbase.com", "pitchbook.com", "glassdoor.com", "indeed.com", "g2.com", "medium.com",
  "reddit.com", "wikipedia.org", "github.com", "bloomberg.com", "reuters.com", "techcrunch.com",
];

function cleanTitle(title: string): string {
  return title.split(/\s+[|\-–—]\s+/)[0].trim();
}

/**
 * Deterministic extraction from SERP results + page text. No LLM, no cost.
 * Best-effort person/company fields with evidence URLs.
 */
export function heuristicExtract(
  input: ProviderInput,
  serp: SerpResult[],
  pages: Array<{ url: string; text: string }>
): { fields: Record<string, unknown>; sources: SourceRef[]; confidence: number } {
  const fields: Record<string, unknown> = {};
  const sources: SourceRef[] = [];
  const blob = [
    ...serp.map((r) => `${r.title}\n${r.description}\n${r.url}`),
    ...pages.map((p) => p.text),
  ].join("\n");

  // --- emails visible in snippets/pages ---
  const emails = new Set<string>();
  for (const m of blob.matchAll(EMAIL_SCAN_RE)) {
    const e = m[0].toLowerCase();
    if (EMAIL_RE.test(e)) emails.add(e);
  }
  if (emails.size) {
    fields.emails = [...emails].slice(0, 5);
    const first = [...emails][0];
    sources.push({ provider: "dataforseo+heuristic", field: "email", note: "visible in result text", url: serp[0]?.url });
  }

  // --- LinkedIn profile ---
  const linkedin = serp.map((r) => r.url).find((u) => /linkedin\.com\/(in|pub)\//i.test(u));
  if (linkedin) {
    fields.linkedin = linkedin;
    sources.push({ provider: "dataforseo+heuristic", field: "linkedin", url: linkedin });
  }

  // --- company domain: for a name query, the most frequent non-noise domain ---
  const counts = new Map<string, number>();
  for (const r of serp) {
    const d = r.domain;
    if (!d || EVENT_DOMAINS.some((s) => d === s || d.endsWith("." + s))) continue;
    counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  const topDomain = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (topDomain && input.queryType !== "domain") {
    fields.companyDomain = topDomain;
    sources.push({ provider: "dataforseo+heuristic", field: "companyDomain", note: "most frequent domain in results" });
  }

  // --- person hints from result titles that look like profiles ---
  const title = serp.map((r) => r.title).find((t) => t && ROLE_RE.test(t) && !ROLE_NOISE.has(cleanTitle(t).toLowerCase()));
  if (title && (input.queryType === "name" || input.queryType === "email")) {
    const roleMatch = title.match(ROLE_RE);
    if (roleMatch) fields.role = roleMatch[0];
  }
  if (input.name) fields.fullName = input.name;

  // --- company description from the top organic result snippet ---
  const snippet = serp.find((r) => r.description && r.description.length > 40)?.description;
  if (snippet && input.queryType === "domain") {
    fields.companyDescription = snippet.slice(0, 240);
    sources.push({ provider: "dataforseo+heuristic", field: "companyDescription", note: "top result snippet" });
  }

  // confidence: presence of structured signal, not just links
  let confidence = 25;
  if (fields.emails) confidence = 55;
  else if (fields.linkedin || fields.companyDomain) confidence = 45;
  if (fields.role || fields.companyDescription) confidence = Math.max(confidence, 50);

  return { fields, sources, confidence };
}
