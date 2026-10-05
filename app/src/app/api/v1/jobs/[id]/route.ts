import { findApiKey } from "@/lib/apikey";
import { getJob } from "@/lib/jobs";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await findApiKey(request.headers.get("authorization"), request.headers.get("x-api-key"));
  if (!auth) return NextResponse.json({ error: "Missing or invalid API key." }, { status: 401 });

  const { id } = await ctx.params;
  const job = await getJob(auth.userId, id);
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });

  return NextResponse.json(
    {
      object: "enrichment_job",
      job_id: job.id,
      status: job.status,
      query: { type: job.queryType, value: job.query },
      result: job.result ?? null,
      mode: job.mode,
      confidence: job.confidence,
      credits_charged: job.creditsCharged,
      cost_usd: Number((job.costMicroUsd / 1_000_000).toFixed(6)),
      error: job.error ?? null,
      created_at: job.createdAt.toISOString(),
      updated_at: job.updatedAt.toISOString(),
    },
    { headers: { "cache-control": "no-store" } }
  );
}
