import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { LookupResult } from "@/lib/types";
import { CACHE_HIT_CREDITS, FRESH_LOOKUP_CREDITS, PHONE_CREDIT_MULTIPLIER } from "@/lib/pricing";

export interface ReserveResult {
  ok: boolean;
  balance: number;
  reserved?: number;
  reason?: "insufficient_credits" | "monthly_limit" | "no_user";
}

function startOfMonth(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

/** Pre-charge estimate: 10x for phone lookups (providers bill ~10x an email). */
export function reserveCreditsFor(queryType: string): number {
  return queryType === "phone" ? FRESH_LOOKUP_CREDITS * PHONE_CREDIT_MULTIPLIER : FRESH_LOOKUP_CREDITS;
}

export async function getMonthlyUsage(userId: string): Promise<number> {
  const agg = await prisma.requestLog.aggregate({
    where: { userId, creditsCharged: { gt: 0 }, createdAt: { gte: startOfMonth() } },
    _sum: { creditsCharged: true },
  });
  return agg._sum.creditsCharged ?? 0;
}

/**
 * Atomically reserve credits for a lookup if the workspace has balance.
 * The credit balance is the source of truth (free credits + purchased credits
 * live in the same pool); plan monthlyLimit only gates users who have not
 * paid for credits this month, so buying a top-up always unblocks you.
 *
 * The user row is locked (SELECT ... FOR UPDATE) so concurrent lookups can't
 * read the same balance and both debit it, and the final debit is conditional
 * (creditBalance >= amount) as a second line of defense.
 */
export async function reserveCredit(
  userId: string,
  amount = 1
): Promise<ReserveResult> {
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    if (locked.length === 0) return { ok: false, balance: 0, reason: "no_user" };

    const user = await tx.user.findUnique({ where: { id: userId }, select: { creditBalance: true, plan: true, monthlyLimit: true } });
    if (!user) return { ok: false, balance: 0, reason: "no_user" };

    const used = await tx.requestLog.aggregate({
      where: { userId, creditsCharged: { gt: 0 }, createdAt: { gte: startOfMonth() } },
      _sum: { creditsCharged: true },
    });
    const monthlyUsed = used._sum.creditsCharged ?? 0;

    // Free tier is capped each month: 100 free lookups, fixed. Paid plans have
    // no per-month cap — their credit balance is the limit, so a purchased
    // top-up always unblocks the workspace.
    if (user.plan === "free" && monthlyUsed >= user.monthlyLimit) {
      return { ok: false, balance: user.creditBalance, reason: "monthly_limit" };
    }

    // Conditional debit: only succeeds if the balance still covers it.
    const debited = await tx.user.updateMany({
      where: { id: userId, creditBalance: { gte: amount } },
      data: { creditBalance: { decrement: amount } },
    });
    if (debited.count === 0) {
      return { ok: false, balance: user.creditBalance, reason: "insufficient_credits" };
    }

    const updated = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { creditBalance: true } });
    await tx.creditLedger.create({
      data: { userId, delta: -amount, reason: "reserve", balanceAfter: updated.creditBalance },
    });
    return { ok: true, balance: updated.creditBalance, reserved: amount };
  });
}

/**
 * Settle a reservation. `opts.credits` is the confirmed charge from
 * billingDecision; `opts.reserved` is what reserveCredit took up-front.
 * Refunds whatever was reserved but not charged; if the confirmed charge is
 * bigger than the reservation (legacy callers), it debits the difference.
 * Pass `opts.idempotencyKey` to make settlement exactly-once (used by the job
 * worker so a retried job cannot refund or charge twice).
 * Returns the resulting balance and the number of credits charged.
 */
export async function settleCredit(
  userId: string,
  charge: boolean,
  opts: { reason: string; requestId?: string; credits?: number; reserved?: number; idempotencyKey?: string } = { reason: "lookup" }
): Promise<{ balance: number; charged: number; alreadySettled?: boolean }> {
  const wanted = charge ? Math.max(0, opts.credits ?? 0) : 0;
  const reserved = Math.max(0, opts.reserved ?? 0);
  const refund = reserved > wanted ? reserved - wanted : 0;
  const extra = wanted > reserved ? wanted - reserved : 0;

  try {
    return await prisma.$transaction(async (tx) => {
      if (opts.idempotencyKey) {
        const seen = await tx.creditLedger.findUnique({ where: { idempotencyKey: opts.idempotencyKey } });
        if (seen) return { balance: seen.balanceAfter, charged: wanted, alreadySettled: true };
      }

      let balance: number;
      if (refund > 0) {
        const u = await tx.user.update({
          where: { id: userId },
          data: { creditBalance: { increment: refund } },
          select: { creditBalance: true },
        });
        balance = u.creditBalance;
        await tx.creditLedger.create({
          data: { userId, delta: refund, reason: `refund:${opts.reason}`, requestId: opts.requestId, idempotencyKey: opts.idempotencyKey, balanceAfter: balance },
        });
      } else if (extra > 0) {
        const u = await tx.user.update({
          where: { id: userId },
          data: { creditBalance: { decrement: extra } },
          select: { creditBalance: true },
        });
        balance = u.creditBalance;
        await tx.creditLedger.create({
          data: { userId, delta: -extra, reason: `charge-adjust:${opts.reason}`, requestId: opts.requestId, idempotencyKey: opts.idempotencyKey, balanceAfter: balance },
        });
      } else {
        balance = (await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { creditBalance: true } })).creditBalance;
        await tx.creditLedger.create({
          data: { userId, delta: 0, reason: `charged:${opts.reason}`, requestId: opts.requestId, idempotencyKey: opts.idempotencyKey, balanceAfter: balance },
        });
      }
      return { balance, charged: wanted };
    });
  } catch (err) {
    // A concurrent settlement with the same key won the race: read its result.
    if (opts.idempotencyKey && err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const seen = await prisma.creditLedger.findUnique({ where: { idempotencyKey: opts.idempotencyKey } });
      return { balance: seen?.balanceAfter ?? (await getBalance(userId)), charged: wanted, alreadySettled: true };
    }
    throw err;
  }
}

export async function getBalance(userId: string): Promise<number> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { creditBalance: true } });
  return u?.creditBalance ?? 0;
}

export interface BillDecision {
  billable: boolean;
  reason: string;
  credits: number;
}

/**
 * Clay-style billing: a miss or error is free, and a returned value that fails
 * validation is refunded. Only confirmed-good data is charged.
 */
export function billingDecision(queryType: string, result: LookupResult): BillDecision {
  const credits = result.cacheHit ? CACHE_HIT_CREDITS : FRESH_LOOKUP_CREDITS;
  if (!result.ok) return { billable: false, reason: "error", credits: 0 };

  const r = result.resolved;
  const hasEmail = (typeof r.email === "string" && r.email) || (Array.isArray(r.emails) && r.emails.length > 0);
  const hasPerson = typeof r.fullName === "string" && r.fullName;
  const hasCompany = typeof r.companyName === "string" && r.companyName;

  if (queryType === "phone") {
    const hasPhone = typeof r.phone === "string" && r.phone.length > 0;
    const verified = r.verified === true;
    if (!hasPhone) return { billable: false, reason: "miss", credits: 0 };
    if (!verified) return { billable: false, reason: "unconfirmed", credits: 0 };
    return { billable: true, reason: "phone", credits: credits * PHONE_CREDIT_MULTIPLIER };
  }
  if (hasEmail) {
    const status = typeof r.status === "string" ? r.status : null;
    // Strict: only a fully validated email is billed.
    // catch_all / unknown / invalid are free (missing or unconfirmed data).
    if (status !== "valid") {
      return { billable: false, reason: status === "invalid" ? "invalid_data" : "unconfirmed", credits: 0 };
    }
    return { billable: true, reason: "email", credits };
  }
  if (hasPerson) return { billable: true, reason: "person", credits };
  if (hasCompany) return { billable: true, reason: "company", credits };
  if (queryType === "domain" && r.domainLive === true) return { billable: true, reason: "domain", credits };
  return { billable: false, reason: "miss", credits: 0 };
}

/** Can we actually bill the customer for this result? Misses are free. */
export function isBillable(queryType: string, result: LookupResult): boolean {
  return billingDecision(queryType, result).billable;
}

export function creditsFor(result: LookupResult): number {
  return result.cacheHit ? CACHE_HIT_CREDITS : FRESH_LOOKUP_CREDITS;
}

export function priceMicroUsd(credits: number): number {
  return credits * Number(process.env.YUTE_CREDIT_MICRO_USD ?? 50_000);
}

export async function grantCredits(
  userId: string,
  amount: number,
  reason: string,
  idempotencyKey?: string
): Promise<{ balance: number; granted: boolean }> {
  return prisma.$transaction(async (tx) => {
    if (idempotencyKey) {
      const existing = await tx.creditLedger.findUnique({ where: { idempotencyKey } });
      if (existing) return { balance: existing.balanceAfter, granted: false };
    }
    const u = await tx.user.update({ where: { id: userId }, data: { creditBalance: { increment: amount } }, select: { creditBalance: true } });
    await tx.creditLedger.create({ data: { userId, delta: amount, reason, idempotencyKey, balanceAfter: u.creditBalance } });
    return { balance: u.creditBalance, granted: true };
  });
}

export async function listLedger(userId: string, take = 50) {
  return prisma.creditLedger.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take });
}
