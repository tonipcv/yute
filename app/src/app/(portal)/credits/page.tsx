import { requireSessionUserId } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getMonthlyUsage, listLedger } from "@/lib/credits";
import { planFor, CREDIT_MICRO_USD } from "@/lib/pricing";
import { PageTitle, MetricCard } from "@/components/portal-ui";

export const metadata = { title: "Credits - yute" };

function fmt(delta: number): string {
  return delta > 0 ? `+${delta}` : String(delta);
}

export default async function CreditsPage() {
  const userId = await requireSessionUserId();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { creditBalance: true, plan: true, monthlyLimit: true },
  });
  const plan = planFor(user?.plan);
  const used = await getMonthlyUsage(userId);
  const ledger = await listLedger(userId, 50);
  const limit = user?.monthlyLimit ?? plan.monthlyLimit;

  return (
    <main className="min-h-screen bg-[#F6F6F1] px-4 py-5 [font-family:Helvetica,Arial,sans-serif] lg:px-8">
      <div className="mx-auto max-w-6xl">
        <PageTitle
          title="Credits"
          subtitle={`1 credit = 1 resolved lookup. Misses are free. Credit price: $${(CREDIT_MICRO_USD / 1_000_000).toFixed(2)}.`}
        />

        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          <MetricCard label="Balance" value={(user?.creditBalance ?? 0).toLocaleString()} />
          <MetricCard label="Plan" value={plan.label} />
          <MetricCard
            label="Used this month"
            value={plan.id === "free" ? `${used.toLocaleString()} / ${(limit ?? 100).toLocaleString()}` : `${used.toLocaleString()} (no cap)`}
          />
        </div>

        <div className="mt-6 overflow-hidden border border-[#E2E1D9]">
          <div className="grid grid-cols-[1.4fr_0.8fr_1fr_1.2fr] bg-[#F6F6F1] px-5 py-3 text-sm font-medium text-[#555951]">
            <span>Reason</span>
            <span>Delta</span>
            <span>Balance after</span>
            <span>When</span>
          </div>
          {ledger.length ? (
            ledger.map((row, i) => (
              <div
                key={i}
                className="grid grid-cols-[1.4fr_0.8fr_1fr_1.2fr] border-t border-[#E2E1D9] px-5 py-4 text-sm text-[#33362f]"
              >
                <span className="font-medium">{row.reason}</span>
                <span className={row.delta < 0 ? "text-red-600" : row.delta > 0 ? "text-emerald-700" : "text-[#777970]"}>
                  {fmt(row.delta)}
                </span>
                <span>{row.balanceAfter.toLocaleString()}</span>
                <span className="text-[#555951]">{row.createdAt.toISOString().slice(0, 16).replace("T", " ")}</span>
              </div>
            ))
          ) : (
            <div className="px-5 py-6 text-sm text-[#555951]">No credit activity yet.</div>
          )}
        </div>
      </div>
    </main>
  );
}
