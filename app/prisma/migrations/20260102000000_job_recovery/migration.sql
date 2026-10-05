-- Job recovery: track attempts and start time so abandoned jobs can be
-- requeued and, after max attempts, settled back to the customer.

ALTER TABLE "EnrichmentJob" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "EnrichmentJob" ADD COLUMN "startedAt" TIMESTAMP(3);

CREATE INDEX "EnrichmentJob_status_startedAt_idx" ON "EnrichmentJob"("status", "startedAt");
