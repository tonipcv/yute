export const CREDIT_MICRO_USD = Number(process.env.YUTE_CREDIT_MICRO_USD ?? 50_000); // $0.05 / credit
export const FRESH_LOOKUP_CREDITS = 1;
export const CACHE_HIT_CREDITS = Number(process.env.YUTE_CACHE_HIT_CREDITS ?? 1);
// Phone numbers cost providers ~10x an email, so they bill more credits.
export const PHONE_CREDIT_MULTIPLIER = Number(process.env.YUTE_PHONE_CREDIT_MULTIPLIER ?? 10);

export interface Plan {
  id: string;
  label: string;
  /** Hard per-month cap of billed lookups. null = limited only by credit balance. */
  monthlyLimit: number | null;
}

export const PLANS: Record<string, Plan> = {
  free: { id: "free", label: "Free", monthlyLimit: 100 },
  pro: { id: "pro", label: "Pay as you go", monthlyLimit: null },
  scale: { id: "scale", label: "Scale", monthlyLimit: null },
};

export function planFor(id: string | null | undefined): Plan {
  return PLANS[id ?? "free"] ?? PLANS.free;
}
