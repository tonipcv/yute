import "server-only";
import Stripe from "stripe";

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

let client: Stripe | null = null;

export function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY not set");
  if (!client) client = new Stripe(key);
  return client;
}

export interface CreditPack {
  id: string;
  credits: number;
  priceUsd: number;
  label: string;
}

/** Credit packs sold as one-off Checkout payments. */
export const CREDIT_PACKS: CreditPack[] = [
  { id: "pack_1k", credits: 1_000, priceUsd: 50, label: "1,000 credits" },
  { id: "pack_10k", credits: 10_000, priceUsd: 450, label: "10,000 credits" },
  { id: "pack_100k", credits: 100_000, priceUsd: 3_500, label: "100,000 credits" },
];

export function packById(id: string): CreditPack | undefined {
  return CREDIT_PACKS.find((p) => p.id === id);
}

/** Reuse a single Stripe customer per workspace email. */
export async function upsertCustomerId(email: string): Promise<string> {
  const s = stripe();
  const existing = await s.customers.list({ email, limit: 1 });
  if (existing.data[0]) return existing.data[0].id;
  const created = await s.customers.create({ email });
  return created.id;
}
