import { prisma } from "@/lib/prisma";
import { findApiKey } from "@/lib/apikey";
import { getMonthlyUsage, grantCredits, listLedger } from "@/lib/credits";
import { planFor } from "@/lib/pricing";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await findApiKey(request.headers.get("authorization"), request.headers.get("x-api-key"));
  if (!auth) return NextResponse.json({ error: "Missing or invalid API key." }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { creditBalance: true, plan: true, monthlyLimit: true },
  });
  const plan = planFor(user?.plan);
  const used = await getMonthlyUsage(auth.userId);
  const ledger = await listLedger(auth.userId, 20);

  return NextResponse.json({
    object: "credits",
    balance: user?.creditBalance ?? 0,
    plan: plan.id,
    // free has a hard monthly cap; paid plans/tiers are limited by credit balance
    monthly_limit: plan.id === "free" ? (user?.monthlyLimit ?? plan.monthlyLimit) : null,
    monthly_used: used,
    ledger: ledger.map((l) => ({ delta: l.delta, reason: l.reason, balance_after: l.balanceAfter, at: l.createdAt.toISOString() })),
  });
}

/** Admin top-up. Requires header x-admin-secret matching YUTE_ADMIN_SECRET. */
export async function POST(request: Request) {
  const adminSecret = process.env.YUTE_ADMIN_SECRET;
  if (!adminSecret || request.headers.get("x-admin-secret") !== adminSecret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: { email?: string; userId?: string; amount?: number; reason?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount === 0) {
    return NextResponse.json({ error: "amount must be a non-zero number" }, { status: 400 });
  }
  const user = body.userId
    ? await prisma.user.findUnique({ where: { id: body.userId } })
    : body.email
      ? await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } })
      : null;
  if (!user) return NextResponse.json({ error: "user not found" }, { status: 404 });

  const balance = await grantCredits(user.id, Math.trunc(amount), body.reason ?? "admin:grant");
  return NextResponse.json({ object: "credits_grant", user_id: user.id, balance });
}
