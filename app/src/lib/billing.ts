import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export interface CheckoutFulfillment {
  eventId: string;
  eventType: string;
  sessionId: string;
  userId: string;
  credits: number;
  amountCents: number;
  currency?: string | null;
  pack?: string | null;
}

export interface FulfillmentResult {
  granted: boolean;
  duplicate: boolean;
  balance: number;
}

const DUP = Symbol("duplicate");

/**
 * Record the webhook event, grant the credits and lift the plan in a single
 * transaction. Idempotency is enforced twice:
 *  - unique StripeEvent.eventId (same delivery replay)
 *  - unique CreditLedger.idempotencyKey = stripe_session:<sessionId>
 *    (two different events naming the same checkout session)
 * If any part fails the whole transaction rolls back, so a payment is never
 * marked delivered without its credits.
 */
export async function fulfillCheckoutPurchase(input: CheckoutFulfillment): Promise<FulfillmentResult> {
  try {
    return await prisma.$transaction(async (tx) => {
      const seenEvent = await tx.stripeEvent.findUnique({ where: { eventId: input.eventId } });
      if (seenEvent) throw DUP;

      const sessionKey = `stripe_session:${input.sessionId}`;
      const seenGrant = await tx.creditLedger.findUnique({ where: { idempotencyKey: sessionKey } });
      if (seenGrant) throw DUP;

      const user = await tx.user.findUnique({ where: { id: input.userId }, select: { creditBalance: true, plan: true } });
      if (!user) throw new Error(`stripe fulfillment: user ${input.userId} not found`);

      const upgraded = input.pack && user.plan === "free";
      const updated = await tx.user.update({
        where: { id: input.userId },
        data: {
          creditBalance: { increment: input.credits },
          ...(upgraded ? { plan: "pro" } : {}),
        },
        select: { creditBalance: true },
      });

      await tx.creditLedger.create({
        data: {
          userId: input.userId,
          delta: input.credits,
          reason: `stripe:${input.sessionId}`,
          idempotencyKey: sessionKey,
          balanceAfter: updated.creditBalance,
        },
      });

      await tx.stripeEvent.create({
        data: {
          eventId: input.eventId,
          type: input.eventType,
          sessionId: input.sessionId,
          userId: input.userId,
          credits: input.credits,
          amountCents: input.amountCents,
          currency: input.currency ?? null,
        },
      });

      return { granted: true, duplicate: false, balance: updated.creditBalance };
    });
  } catch (err) {
    if (err === DUP) {
      const existing = await prisma.stripeEvent.findUnique({ where: { eventId: input.eventId } });
      const seenLedger = existing ?? (await prisma.creditLedger.findUnique({ where: { idempotencyKey: `stripe_session:${input.sessionId}` } }));
      return { granted: false, duplicate: true, balance: seenLedger && "balanceAfter" in seenLedger ? seenLedger.balanceAfter : 0 };
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { granted: false, duplicate: true, balance: 0 };
    }
    throw err;
  }
}

/** Record a webhook event we intentionally do not act on, without granting. */
export async function recordStripeEvent(eventId: string, type: string): Promise<void> {
  await prisma.stripeEvent.create({ data: { eventId, type } });
}
