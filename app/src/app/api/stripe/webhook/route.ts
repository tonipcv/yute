import type Stripe from "stripe";
import { stripe, isStripeConfigured } from "@/lib/stripe";
import { fulfillCheckoutPurchase, recordStripeEvent } from "@/lib/billing";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A checkout session is only fulfilled once Stripe confirms the money moved. */
function isPaid(session: Stripe.Checkout.Session): boolean {
  return session.payment_status === "paid" || session.payment_status === "no_payment_required";
}

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!isStripeConfigured() || !secret) return NextResponse.json({ error: "Stripe not configured." }, { status: 503 });

  const sig = request.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing signature." }, { status: 400 });

  const raw = await request.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(raw, sig, secret);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Invalid signature" }, { status: 400 });
  }

  try {
    // checkout.session.completed fires both for immediate payments and, with
    // delayed payment methods, before the money settles. Only fulfill a paid
    // session here; async settlements are fulfilled by async_payment_succeeded.
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const session = event.data.object as Stripe.Checkout.Session;

      if (!isPaid(session)) {
        // Delayed method still pending: record and wait for async_payment_succeeded.
        await recordStripeEvent(event.id, event.type).catch((err) => {
          if (err?.code !== "P2002") throw err;
        });
        return NextResponse.json({ received: true, pending: true });
      }

      const userId = session.metadata?.userId;
      const credits = Number(session.metadata?.credits ?? 0);
      if (!userId || !(credits > 0)) {
        await recordStripeEvent(event.id, event.type).catch((err) => {
          if (err?.code !== "P2002") throw err;
        });
        return NextResponse.json({ received: true, ignored: "missing_metadata" });
      }

      const result = await fulfillCheckoutPurchase({
        eventId: event.id,
        eventType: event.type,
        sessionId: session.id,
        userId,
        credits,
        amountCents: session.amount_total ?? 0,
        currency: session.currency,
        pack: session.metadata?.pack,
      });

      return NextResponse.json({ received: true, granted: result.granted, duplicate: result.duplicate });
    }

    // Any other event: record for audit/idempotency, take no action.
    await recordStripeEvent(event.id, event.type).catch((err) => {
      if (err?.code !== "P2002") throw err;
    });
    return NextResponse.json({ received: true });
  } catch (err) {
    // A real failure (DB down, user missing). Return 500 so Stripe retries and
    // the payment is never silently dropped.
    console.error("stripe webhook failed", event.id, event.type, err);
    return NextResponse.json({ error: "webhook processing failed" }, { status: 500 });
  }
}
