import Link from "next/link";
import { requireSessionUserId } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageTitle, TableHeader, TableRow } from "@/components/portal-ui";
import { createCheckoutAction } from "@/actions/billing";
import { CREDIT_PACKS, isStripeConfigured } from "@/lib/stripe";
import { getMonthlyUsage } from "@/lib/credits";
import { planFor } from "@/lib/pricing";
export const metadata = { title: "Billing - yute" };

const tiers = [
  { name: "Free", price: "$0", lookups: "100 / month", note: "Playground + API, validation included" },
  { name: "Pay as you go", price: "from $50", lookups: "No monthly cap", note: "1,000+ credit top-ups, never expire" },
  { name: "Scale", price: "Contact", lookups: "Custom", note: "Volume pricing, dedicated routing" },
];

export default async function BillingPage() {
  const userId = await requireSessionUserId();
  const row = await prisma.user.findUnique({ where: { id: userId }, select: { plan: true, monthlyLimit: true, creditBalance: true } });
  const [calls, keys, balance] = await Promise.all([
    prisma.requestLog.count({ where: { userId } }),
    prisma.apiKey.count({ where: { userId, revokedAt: null } }),
    getMonthlyUsage(userId),
  ]);
  const plan = planFor(row?.plan);
  const checkoutReady = isStripeConfigured();

  return (
    <main className="min-h-screen bg-[#F6F6F1] px-4 py-5 [font-family:Helvetica,Arial,sans-serif] lg:px-8">
      <div className="mx-auto max-w-6xl">
      <PageTitle title="Billing" subtitle="Free for your first 100 lookups. Top up credits any time — a top-up removes the monthly cap." />

      <div className="grid gap-4 xl:grid-cols-3">
        <section className="border border-[#E2E1D9] bg-[#FFFFFA] p-4">
          <p className="text-[11px] font-medium uppercase text-[#777970]">Current plan</p>
          <p className="mt-2 text-4xl font-medium tracking-tight text-[#11130f]">{plan.label}</p>
          <div className="mt-3 grid gap-px border border-[#E2E1D9] bg-[#E2E1D9] text-sm">
            <div className="flex justify-between bg-[#FFFFFA] px-3 py-2">
              <span className="text-[#555951]">Credit balance</span>
              <span>{(row?.creditBalance ?? 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between bg-[#FFFFFA] px-3 py-2">
              <span className="text-[#555951]">Credits used this month</span>
              <span>
                {balance.toLocaleString()}
                {plan.id === "free" ? ` / ${(plan.monthlyLimit ?? 100).toLocaleString()}` : ""}
              </span>
            </div>
            <div className="flex justify-between bg-[#FFFFFA] px-3 py-2">
              <span className="text-[#555951]">Active keys</span>
              <span>{keys}</span>
            </div>
          </div>
          <Link
            href="#buy-credits"
            className="mt-4 inline-flex h-10 w-full items-center justify-center bg-[#173D2D] px-4 text-sm font-medium text-white transition hover:bg-[#0F2F22]"
          >
            Top up credits
          </Link>
        </section>

        <section className="border border-[#E2E1D9] bg-[#FFFFFA] xl:col-span-2">
          <div className="flex h-11 items-center border-b border-[#E2E1D9] px-4">
            <h2 className="text-sm font-medium text-[#11130f]">Plans</h2>
          </div>
          <TableHeader cols="grid-cols-[1fr_0.7fr_1fr_1.6fr]" labels={["Plan", "Price", "Lookups", "Includes"]} />
          {tiers.map((tier) => (
            <TableRow key={tier.name} cols="grid-cols-[1fr_0.7fr_1fr_1.6fr]">
              <span className="font-medium">{tier.name}</span>
              <span>{tier.price}</span>
              <span>{tier.lookups}</span>
              <span className="text-[#555951]">{tier.note}</span>
            </TableRow>
          ))}
        </section>
      </div>

      <section id="buy-credits" className="mt-4 border border-[#E2E1D9] bg-[#FFFFFA]">
        <div className="flex h-11 items-center border-b border-[#E2E1D9] px-4">
          <h2 className="text-sm font-medium text-[#11130f]">Buy credits</h2>
        </div>
        <div className="grid gap-px bg-[#E2E1D9] sm:grid-cols-3">
          {CREDIT_PACKS.map((pack) => (
            <div key={pack.id} className="flex flex-col bg-[#FFFFFA] p-4">
              <p className="text-2xl font-medium text-[#11130f]">{pack.credits.toLocaleString()}</p>
              <p className="mt-1 text-xs uppercase text-[#777970]">credits</p>
              <p className="mt-3 text-sm text-[#555951]">
                ${pack.priceUsd.toLocaleString()} · ${(pack.priceUsd / pack.credits).toFixed(4)}/credit
              </p>
              <form action={createCheckoutAction} className="mt-4">
                <input type="hidden" name="pack" value={pack.id} />
                <button
                  type="submit"
                  disabled={!checkoutReady}
                  className="inline-flex h-10 w-full items-center justify-center bg-[#173D2D] px-4 text-sm font-medium text-white transition hover:bg-[#0F2F22] disabled:opacity-50"
                  title={checkoutReady ? "" : "Payments are not enabled yet"}
                >
                  Buy
                </button>
              </form>
            </div>
          ))}
        </div>
        {!checkoutReady ? (
          <p className="border-t border-[#E2E1D9] px-4 py-3 text-xs text-[#777970]">
            Card payments are not enabled yet. Contact us to top up.
          </p>
        ) : null}
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-3">
        <div className="border border-[#E2E1D9] bg-[#FFFFFA] p-4">
          <h3 className="text-sm font-semibold text-[#11130f]">How we keep it cheap</h3>
          <p className="mt-2 text-sm leading-6 text-[#555951]">
            Live web search resolves most requests before any provider is contacted. Providers only get validated, unresolved queries.
          </p>
        </div>
        <div className="border border-[#E2E1D9] bg-[#FFFFFA] p-4">
          <h3 className="text-sm font-semibold text-[#11130f]">Usage we do not bill</h3>
          <p className="mt-2 text-sm leading-6 text-[#555951]">
            Failed lookups and validation-only checks are not charged. You can see every call in{" "}
            <Link href="/logs" className="text-[#173D2D]">Request Logs</Link>.
          </p>
        </div>
        <div className="border border-[#E2E1D9] bg-[#FFFFFA] p-4">
          <h3 className="text-sm font-semibold text-[#11130f]">Need an invoice?</h3>
          <p className="mt-2 text-sm leading-6 text-[#555951]">
            Write to hello@yute.dev with your workspace email and we send a receipt for the period.
          </p>
        </div>
      </section>
      </div>
    </main>
  );
}
