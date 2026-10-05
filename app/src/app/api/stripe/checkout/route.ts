import { prisma } from "@/lib/prisma";
import { findApiKey } from "@/lib/apikey";
import { stripe, isStripeConfigured, packById, upsertCustomerId } from "@/lib/stripe";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isStripeConfigured()) return NextResponse.json({ error: "Stripe not configured." }, { status: 503 });

  const auth = await findApiKey(request.headers.get("authorization"), request.headers.get("x-api-key"));
  if (!auth) return NextResponse.json({ error: "Missing or invalid API key." }, { status: 401 });

  let body: { pack?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }
  const pack = body.pack ? packById(body.pack) : undefined;
  if (!pack) return NextResponse.json({ error: "Unknown pack." }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { id: auth.userId }, select: { email: true } });
  if (!user) return NextResponse.json({ error: "User not found." }, { status: 404 });

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://yute.heuv.dev";
  const customer = user.email ? await upsertCustomerId(user.email) : undefined;
  const session = await stripe().checkout.sessions.create({
    mode: "payment",
    customer,
    customer_email: customer ? undefined : user.email,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: Math.round(pack.priceUsd * 100),
          product_data: { name: `${pack.credits.toLocaleString()} yute credits` },
        },
      },
    ],
    metadata: { userId: auth.userId, credits: String(pack.credits), pack: pack.id },
    success_url: `${base}/credits?paid=1`,
    cancel_url: `${base}/billing?canceled=1`,
  });

  return NextResponse.json({ object: "checkout_session", url: session.url, id: session.id });
}
