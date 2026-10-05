"use server";

import { requireSessionUserId } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { stripe, isStripeConfigured, packById, upsertCustomerId } from "@/lib/stripe";

export async function createCheckoutAction(formData: FormData): Promise<void> {
  const userId = await requireSessionUserId();
  const packId = String(formData.get("pack") ?? "");
  const pack = packById(packId);
  if (!pack || !isStripeConfigured()) return;

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user) return;

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
    metadata: { userId, credits: String(pack.credits), pack: pack.id },
    success_url: `${base}/credits?paid=1`,
    cancel_url: `${base}/billing?canceled=1`,
  });

  const { redirect } = await import("next/navigation");
  if (session.url) redirect(session.url);
}
