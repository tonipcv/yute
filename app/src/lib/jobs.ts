import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { LookupType } from "@/lib/types";
import { runLookup } from "@/lib/lookup";
import { billingDecision, settleCredit, priceMicroUsd } from "@/lib/credits";
import { buildResolvedCore } from "@/lib/quality";
import { recordProviderCalls } from "@/lib/provider-stats";
import { deliverEvent, deliverToUrl } from "@/lib/webhooks";

export interface CreateJobParams {
  userId: string;
  apiKeyId?: string | null;
  queryType: LookupType;
  query: string;
  webhookUrl?: string | null;
  creditsReserved?: number;
}

const STALE_MS = Number(process.env.YUTE_JOB_STALE_MS ?? 5 * 60_000);
const MAX_ATTEMPTS = Number(process.env.YUTE_JOB_MAX_ATTEMPTS ?? 3);

export async function createJob(params: CreateJobParams) {
  const job = await prisma.enrichmentJob.create({
    data: {
      userId: params.userId,
      apiKeyId: params.apiKeyId ?? null,
      queryType: params.queryType,
      query: params.query,
      webhookUrl: params.webhookUrl ?? null,
      creditsReserved: params.creditsReserved ?? 1,
      status: "queued",
    },
  });
  // Opportunistic recovery: pick up jobs abandoned by a previous crash.
  void recoverStaleJobs().catch(() => undefined);
  return job;
}

/**
 * Run a job. Uses the durable pg-boss queue when YUTE_QUEUE=on, otherwise runs
 * inline. Either way, if the queue fails to start we fall back to inline so a
 * lookup is never lost.
 */
export function runJobAsync(jobId: string): void {
  if (process.env.YUTE_QUEUE === "on") {
    void enqueueJob(jobId)
      .then(() => undefined)
      .catch((err) => {
        console.error("enqueue failed, running inline", jobId, err);
        void processJob(jobId).catch((e) => console.error("inline job failed", jobId, e));
      });
    return;
  }
  void processJob(jobId).catch((e) => console.error("job failed", jobId, e));
}

let bossPromise: Promise<import("pg-boss").PgBoss> | null = null;

async function getBoss() {
  if (!bossPromise) {
    bossPromise = (async () => {
      const { PgBoss } = await import("pg-boss");
      const boss = new PgBoss({
        connectionString: process.env.DATABASE_URL,
        // Dedicated schema keeps the queue out of the app's tables.
        schema: process.env.YUTE_QUEUE_SCHEMA ?? "yute_queue",
      });
      boss.on("error", () => undefined);
      await boss.start();
      await boss.createQueue("enrichment").catch(() => undefined);
      await boss.work<{ jobId: string }>("enrichment", async (jobs) => {
        for (const job of jobs) {
          await processJob(job.data.jobId).catch((err) => console.error("queued job failed", job.data.jobId, err));
        }
      });
      // Requeue jobs left in "running" by a previous crash (after boss is ready).
      setTimeout(() => void recoverStaleJobs().catch(() => undefined), 1000);
      return boss;
    })();
  }
  return bossPromise;
}

async function enqueueJob(jobId: string): Promise<void> {
  const boss = await getBoss();
  await boss.send("enrichment", { jobId }, { retryLimit: 2 });
}

export async function processJob(jobId: string): Promise<void> {
  const job = await prisma.enrichmentJob.findUnique({ where: { id: jobId } });
  if (!job || job.status === "done" || job.status === "error") return;

  // Claim atomically: only a queued job can start. Retries or duplicate
  // deliveries of an already-running/done/errored job are ignored, so a
  // completed job is never reprocessed and never settled twice.
  const claimed = await prisma.enrichmentJob.updateMany({
    where: { id: jobId, status: "queued" },
    data: { status: "running", startedAt: new Date(), attempts: { increment: 1 } },
  });
  if (claimed.count === 0) return;

  const settleKey = `job-settle:${jobId}`;

  let result;
  try {
    result = await runLookup(job.queryType as LookupType, job.query);
  } catch (err) {
    // A lookup failure is final (a miss is not retryable): refund and stop.
    await settleCredit(job.userId, false, { reason: "error", requestId: jobId, reserved: job.creditsReserved, idempotencyKey: settleKey });
    await prisma.enrichmentJob.update({
      where: { id: jobId },
      data: { status: "error", error: err instanceof Error ? err.message : "lookup failed", creditsCharged: 0 },
    });
    await deliverEvent(job.userId, "enrichment.error", { job_id: jobId, error: "lookup failed" });
    return;
  }

  try {
    // If recovery already took this job over (marked it error and refunded),
    // do not settle or persist a result on top of it.
    const fresh = await prisma.enrichmentJob.findUnique({ where: { id: jobId }, select: { status: true } });
    if (fresh?.status !== "running") return;

    const decision = billingDecision(job.queryType, result);
    const settled = await settleCredit(job.userId, decision.billable, { reason: decision.reason, credits: decision.credits, reserved: job.creditsReserved, requestId: jobId, idempotencyKey: settleKey });
    const charged = settled.alreadySettled ? 0 : settled.charged;

    await Promise.all([
      prisma.requestLog.create({
        data: {
          userId: job.userId,
          apiKeyId: job.apiKeyId,
          queryType: job.queryType,
          query: job.query,
          ok: result.ok,
          ms: result.ms,
          mode: result.mode,
          source: result.provider ?? (typeof result.resolved.source === "string" ? result.resolved.source : null),
          provider: result.provider ?? null,
          confidence: result.confidence,
          cacheHit: result.cacheHit,
          costMicroUsd: result.costMicroUsd,
          priceMicroUsd: priceMicroUsd(charged),
          creditsCharged: charged,
          jobId,
        },
      }),
      recordProviderCalls(result.providerCalls.map((c) => ({ user: job.userId, provider: c.provider, outcome: c.outcome, costMicroUsd: c.costMicroUsd, ms: c.ms }))),
    ]);

    await prisma.enrichmentJob.update({
      where: { id: jobId },
      data: {
        status: "done",
        result: result.resolved as unknown as Prisma.InputJsonValue,
        mode: result.mode,
        confidence: result.confidence,
        costMicroUsd: result.costMicroUsd,
        creditsCharged: charged,
      },
    });

    const event = {
      job_id: jobId,
      query: { type: job.queryType, value: job.query },
      resolved: result.resolved,
      resolved_core: buildResolvedCore(result),
      sources: result.sources,
      confidence: result.confidence,
      mode: result.mode,
      billable: decision.billable,
      billing_reason: decision.reason,
      credits_charged: charged,
      cost_usd: Number((result.costMicroUsd / 1_000_000).toFixed(6)),
    };

    if (job.webhookUrl) await deliverToUrl(job.webhookUrl, "enrichment.completed", event).catch(() => undefined);
    await deliverEvent(job.userId, "enrichment.completed", event);
  } catch (err) {
    // Unexpected failure (DB/metering). Put the job back so the queue can
    // retry; billing is idempotent via settleKey, so no double charge/refund.
    await prisma.enrichmentJob
      .updateMany({ where: { id: jobId, status: "running" }, data: { status: "queued" } })
      .catch(() => undefined);
    throw err;
  }
}

/**
 * Requeue jobs stuck in "running" (e.g. the process died mid-flight) and, once
 * they exceed MAX_ATTEMPTS, refund their reserved credits and close them.
 */
export async function recoverStaleJobs(limit = 20): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_MS);
  const stale = await prisma.enrichmentJob.findMany({
    where: { status: "running", startedAt: { lt: cutoff } },
    select: { id: true, userId: true, creditsReserved: true, attempts: true },
    take: limit,
    orderBy: { startedAt: "asc" },
  });

  let recovered = 0;
  for (const j of stale) {
    if (j.attempts >= MAX_ATTEMPTS) {
      await prisma.enrichmentJob.update({
        where: { id: j.id },
        data: { status: "error", error: "abandoned" },
      });
      await settleCredit(j.userId, false, { reason: "abandoned", requestId: j.id, reserved: j.creditsReserved, idempotencyKey: `job-settle:${j.id}` });
      await deliverEvent(j.userId, "enrichment.error", { job_id: j.id, error: "abandoned" });
      recovered++;
      continue;
    }
    const reset = await prisma.enrichmentJob.updateMany({
      where: { id: j.id, status: "running" },
      data: { status: "queued" },
    });
    if (reset.count > 0) {
      runJobAsync(j.id);
      recovered++;
    }
  }
  return recovered;
}

export async function getJob(userId: string, id: string) {
  return prisma.enrichmentJob.findFirst({ where: { id, userId } });
}
