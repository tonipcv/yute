import { findApiKey } from "@/lib/apikey";
import { rateLimit } from "@/lib/ratelimit";
import { reserveCredit, settleCredit, reserveCreditsFor } from "@/lib/credits";
import { createJob, runJobAsync } from "@/lib/jobs";
import { assertSafeWebhookUrl } from "@/lib/webhooks";
import { reportError } from "@/lib/error-report";
import type { LookupType } from "@/lib/types";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function pick(body: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = body[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

export async function POST(request: Request) {
  const auth = await findApiKey(request.headers.get("authorization"), request.headers.get("x-api-key"));
  if (!auth) return NextResponse.json({ error: "Missing or invalid API key." }, { status: 401 });

  const rl = rateLimit(`key:${auth.id}`);
  if (!rl.ok) {
    return NextResponse.json({ error: "Rate limit exceeded.", retry_after: rl.retryAfterSeconds }, { status: 429, headers: { "retry-after": String(rl.retryAfterSeconds) } });
  }

  let body: Record<string, unknown> = {};
  try {
    const ct = request.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  const url = new URL(request.url);
  const email = (pick(body, ["email"]) || url.searchParams.get("email") || "").trim().toLowerCase();
  const domain = (pick(body, ["domain"]) || url.searchParams.get("domain") || "").trim().toLowerCase();
  const name = (pick(body, ["name"]) || url.searchParams.get("name") || "").trim();
  const webhookUrl = pick(body, ["webhook_url", "webhookUrl"]) || url.searchParams.get("webhook_url") || null;

  const queryType = (email ? "email" : domain ? "domain" : name ? "name" : null) as LookupType | null;
  const query = email || domain || name;
  if (!queryType || !query) {
    return NextResponse.json({ error: "Send email, domain or name (JSON body or query params)." }, { status: 400 });
  }

  if (webhookUrl) {
    try {
      await assertSafeWebhookUrl(webhookUrl);
    } catch {
      return NextResponse.json({ error: "webhook_url must be a public http(s) URL." }, { status: 400 });
    }
  }

  const reserved = await reserveCredit(auth.userId, reserveCreditsFor(queryType));
  if (!reserved.ok) {
    return NextResponse.json(
      { error: reserved.reason === "monthly_limit" ? "Monthly lookup limit reached." : "Insufficient credits.", reason: reserved.reason, balance: reserved.balance },
      { status: 402 }
    );
  }

  try {
    const job = await createJob({ userId: auth.userId, apiKeyId: auth.id, queryType, query, webhookUrl, creditsReserved: reserved.reserved });
    runJobAsync(job.id);
    return NextResponse.json(
      { object: "enrichment_job", job_id: job.id, status: job.status, query: { type: queryType, value: query }, balance: reserved.balance },
      { status: 202, headers: { "x-yute-balance": String(reserved.balance) } }
    );
  } catch (err) {
    void reportError(err, { route: "/v1/enrich", userId: auth.userId });
    await settleCredit(auth.userId, false, { reason: "error", reserved: reserved.reserved });
    return NextResponse.json({ error: err instanceof Error ? err.message : "failed to create job" }, { status: 500 });
  }
}
