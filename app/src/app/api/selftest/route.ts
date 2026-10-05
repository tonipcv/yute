import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { reserveCredit, settleCredit } from "@/lib/credits";
import { fulfillCheckoutPurchase } from "@/lib/billing";
import { recoverStaleJobs } from "@/lib/jobs";
import { assertSafeWebhookUrl, isPrivateIp } from "@/lib/webhooks";
import { POST as stripeWebhookPOST } from "@/app/api/stripe/webhook/route";
import { createHmac, randomUUID } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Status = "pass" | "fail" | "skip";
interface Result {
  name: string;
  status: Status;
  detail?: string;
}

/**
 * Billing/security smoke test. Guarded by YUTE_ADMIN_SECRET, blocked in
 * production unless YUTE_SELFTEST_ALLOW_PROD=true, and it cleans up every row
 * it creates (including StripeEvent, which has no FK to User). Run against an
 * isolated database. Usage:
 *   curl -H "x-admin-secret: $YUTE_ADMIN_SECRET" https://<host>/api/selftest
 */
export async function GET(request: Request) {
  const adminSecret = process.env.YUTE_ADMIN_SECRET;
  if (!adminSecret || request.headers.get("x-admin-secret") !== adminSecret) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (process.env.NODE_ENV === "production" && process.env.YUTE_SELFTEST_ALLOW_PROD !== "true") {
    return NextResponse.json({ error: "disabled_in_production" }, { status: 404 });
  }

  const results: Result[] = [];
  const pass = (name: string, ok: boolean, detail?: string) => results.push({ name, status: ok ? "pass" : "fail", detail });
  const skip = (name: string, detail: string) => results.push({ name, status: "skip", detail });

  const createdEventIds: string[] = [];
  const uid = (await prisma.user.create({ data: { email: `selftest-${randomUUID()}@test.local`, passwordHash: "x", creditBalance: 5, plan: "pro" } })).id;

  try {
    // 1. Concurrency: 10 parallel reserves of 1 from balance 5 -> exactly 5 ok, balance 0.
    const rs = await Promise.all(Array.from({ length: 10 }, () => reserveCredit(uid, 1)));
    const oks = rs.filter((r) => r.ok).length;
    const bal = (await prisma.user.findUnique({ where: { id: uid }, select: { creditBalance: true } }))!.creditBalance;
    pass("concurrent reserve: no negative balance", oks === 5 && bal === 0, `ok=${oks} balance=${bal}`);

    // 2. Idempotent settle: same key twice -> one refund ledger row, balance restored once.
    await prisma.user.update({ where: { id: uid }, data: { creditBalance: 10 } });
    const key = `test-settle:${randomUUID()}`;
    await settleCredit(uid, false, { reason: "error", reserved: 3, idempotencyKey: key });
    const s2 = await settleCredit(uid, false, { reason: "error", reserved: 3, idempotencyKey: key });
    const refundRows = await prisma.creditLedger.count({ where: { idempotencyKey: key } });
    const bal2 = (await prisma.user.findUnique({ where: { id: uid }, select: { creditBalance: true } }))!.creditBalance;
    pass("idempotent settle: one refund only", refundRows === 1 && bal2 === 13 && s2.alreadySettled === true, `rows=${refundRows} balance=${bal2}`);

    // 3. Stripe fulfillment: same session, two different event ids -> one grant; same event twice -> duplicate.
    const sessionId = `cs_${randomUUID()}`;
    const e1 = `evt_${randomUUID()}`;
    const e2 = `evt_${randomUUID()}`;
    const f1 = await fulfillCheckoutPurchase({ eventId: e1, eventType: "checkout.session.completed", sessionId, userId: uid, credits: 1000, amountCents: 5000, currency: "usd", pack: "pack_1k" });
    const f2 = await fulfillCheckoutPurchase({ eventId: e2, eventType: "checkout.session.async_payment_succeeded", sessionId, userId: uid, credits: 1000, amountCents: 5000, currency: "usd", pack: "pack_1k" });
    const ledgerGrants = await prisma.creditLedger.count({ where: { idempotencyKey: `stripe_session:${sessionId}` } });
    pass("fulfill: one grant per session", f1.granted === true && f2.duplicate === true && ledgerGrants === 1, `f1=${f1.granted} f2=${f2.duplicate} rows=${ledgerGrants}`);

    // 4. SSRF: private targets (incl. IPv4-mapped IPv6) rejected, public accepted.
    const shouldReject = ["http://127.0.0.1/hook", "http://localhost/hook", "http://[::ffff:127.0.0.1]/hook", "http://[::1]/hook", "http://[fd00:ec2::254]/hook", "http://169.254.169.254/hook"];
    let allRejected = true;
    for (const u of shouldReject) {
      try { await assertSafeWebhookUrl(u); allRejected = false; } catch { /* expected */ }
    }
    let publicOk = false;
    try { await assertSafeWebhookUrl("https://example.com/hook"); publicOk = true; } catch { publicOk = false; }
    pass("ssrf: private/mapped/metadata rejected", allRejected, shouldReject.join(", "));
    pass("ssrf: public https accepted", publicOk, `public=${publicOk}`);

    // 5. isPrivateIp ranges.
    const priv = ["10.0.0.1", "172.16.5.4", "192.168.1.1", "169.254.169.254", "127.0.0.1", "::1", "fd00::1", "fd00:ec2::254", "::ffff:10.0.0.1", "::ffff:7f00:1"];
    const pub = ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"];
    pass("isPrivateIp classifies", priv.every(isPrivateIp) && pub.every((ip) => !isPrivateIp(ip)), `priv=${priv.filter(isPrivateIp).length}/${priv.length}`);

    // 6. End-to-end webhook route: signature, payment gating, replay.
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (process.env.STRIPE_SECRET_KEY && secret) {
      const sign = (body: string) => {
        const t = Math.floor(Date.now() / 1000);
        const v1 = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
        return `t=${t},v1=${v1}`;
      };
      const post = (payload: string) =>
        stripeWebhookPOST(
          new Request("http://localhost/api/stripe/webhook", {
            method: "POST",
            headers: { "stripe-signature": sign(payload), "content-type": "application/json" },
            body: payload,
          })
        );

      await prisma.user.update({ where: { id: uid }, data: { creditBalance: 0 } });
      const sid = `cs_${randomUUID()}`;
      const mkEvent = (id: string, type: string, paymentStatus: string) => {
        createdEventIds.push(id);
        return JSON.stringify({
          id,
          object: "event",
          type,
          data: {
            object: {
              id: sid,
              object: "checkout.session",
              payment_status: paymentStatus,
              amount_total: 1900,
              currency: "usd",
              metadata: { userId: uid, credits: "250", pack: "pack_1k" },
            },
          },
        });
      };

      const pending = await post(mkEvent(`evt_${randomUUID()}`, "checkout.session.completed", "unpaid"));
      const afterPending = (await prisma.user.findUnique({ where: { id: uid }, select: { creditBalance: true } }))!.creditBalance;
      pass("webhook: unpaid session grants nothing", pending.status === 200 && afterPending === 0, `status=${pending.status} balance=${afterPending}`);

      const paid = await post(mkEvent(`evt_${randomUUID()}`, "checkout.session.async_payment_succeeded", "paid"));
      const afterPaid = (await prisma.user.findUnique({ where: { id: uid }, select: { creditBalance: true } }))!.creditBalance;
      pass("webhook: paid session grants credits", paid.status === 200 && afterPaid === 250, `status=${paid.status} balance=${afterPaid}`);

      const replay = await post(mkEvent(`evt_${randomUUID()}`, "checkout.session.async_payment_succeeded", "paid"));
      const replayBody = await replay.json();
      const afterReplay = (await prisma.user.findUnique({ where: { id: uid }, select: { creditBalance: true } }))!.creditBalance;
      pass("webhook: replay does not double-credit", replay.status === 200 && afterReplay === 250 && replayBody.duplicate === true, `status=${replay.status} balance=${afterReplay}`);

      const bad = await stripeWebhookPOST(
        new Request("http://localhost/api/stripe/webhook", { method: "POST", headers: { "stripe-signature": "t=1,v1=deadbeef" }, body: mkEvent(`evt_${randomUUID()}`, "checkout.session.completed", "paid") })
      );
      pass("webhook: invalid signature rejected", bad.status === 400, `status=${bad.status}`);
    } else {
      for (const name of ["webhook: unpaid session grants nothing", "webhook: paid session grants credits", "webhook: replay does not double-credit", "webhook: invalid signature rejected"]) {
        skip(name, "Stripe env not set");
      }
    }

    // 7. Abandoned job recovery: a running job past max attempts gets closed
    // and its reserved credits refunded exactly once.
    await prisma.user.update({ where: { id: uid }, data: { creditBalance: 0 } });
    const abandoned = await prisma.enrichmentJob.create({
      data: { userId: uid, queryType: "email", query: "abandoned@test.local", status: "running", startedAt: new Date(Date.now() - 10 * 60_000), attempts: 3, creditsReserved: 4 },
    });
    await recoverStaleJobs();
    const abRow = await prisma.enrichmentJob.findUnique({ where: { id: abandoned.id }, select: { status: true, error: true } });
    const abBal = (await prisma.user.findUnique({ where: { id: uid }, select: { creditBalance: true } }))!.creditBalance;
    const abRefunds = await prisma.creditLedger.count({ where: { idempotencyKey: `job-settle:${abandoned.id}` } });
    pass("jobs: abandoned job refunded once and closed", abRow?.status === "error" && abRow?.error === "abandoned" && abBal === 4 && abRefunds === 1, `status=${abRow?.status} balance=${abBal} refunds=${abRefunds}`);
  } finally {
    // Clean up everything: StripeEvent has no cascade to User, delete by both
    // the event ids we minted and the test user id.
    await prisma.stripeEvent
      .deleteMany({ where: { OR: [{ userId: uid }, ...(createdEventIds.length ? [{ eventId: { in: createdEventIds } }] : [])] } })
      .catch(() => undefined);
    await prisma.creditLedger.deleteMany({ where: { userId: uid } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: uid } }).catch(() => undefined);
  }

  const failed = results.filter((r) => r.status === "fail").length;
  const passed = results.filter((r) => r.status === "pass").length;
  const skipped = results.filter((r) => r.status === "skip").length;
  return NextResponse.json({ passed, failed, skipped, results }, { status: failed ? 500 : 200 });
}
