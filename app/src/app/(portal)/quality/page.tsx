import { requireSessionUserId } from "@/lib/session";
import { computeQuality } from "@/lib/analytics";
import { PageTitle, MetricCard } from "@/components/portal-ui";

export const metadata = { title: "Quality - yute" };

function usd(micro: number): string {
  return `$${(micro / 1_000_000).toFixed(4)}`;
}

export default async function QualityPage() {
  const userId = await requireSessionUserId();
  const q = await computeQuality(userId, 30);

  return (
    <main className="min-h-screen bg-[#F6F6F1] px-4 py-5 [font-family:Helvetica,Arial,sans-serif] lg:px-8">
      <div className="mx-auto max-w-6xl">
        <PageTitle
          eyebrow="Observability"
          title="Data quality & metering"
          subtitle="Last 30 days. Coverage is how often a source answers; quality is how often the answer is confident; cost is what we actually spent."
        />

        <div className="mt-8 grid gap-4 lg:grid-cols-4">
          <MetricCard label="Hit rate" value={`${q.hitRate}%`} />
          <MetricCard label="Confidence quality" value={`${q.quality}%`} />
          <MetricCard label="Deliverable rate" value={`${q.deliverableRate}%`} />
          <MetricCard label="Cost / deliverable" value={usd(q.costPerDeliverableMicroUsd)} />
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-4">
          <MetricCard label="Lookups" value={q.requests.toLocaleString()} />
          <MetricCard label="Unique scanned" value={q.scanned.toLocaleString()} />
          <MetricCard label="Spend (COGS)" value={usd(q.costMicroUsd)} />
          <MetricCard label="Margin (collected - COGS)" value={`${q.marginPct}%`} />
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <MetricCard label="Collected (actual revenue)" value={usd(q.collectedMicroUsd)} />
          <MetricCard label="List value of credits used" value={usd(q.priceMicroUsd)} />
        </div>

        <section className="mt-6 overflow-hidden border border-[#E2E1D9]">
          <div className="flex h-11 items-center border-b border-[#E2E1D9] bg-[#FFFFFA] px-4">
            <h2 className="text-sm font-medium text-[#11130f]">Provider coverage</h2>
          </div>
          <div className="grid grid-cols-[1.4fr_0.8fr_0.8fr_0.9fr_0.8fr_1fr] bg-[#F6F6F1] px-5 py-3 text-sm font-medium text-[#555951]">
            <span>Provider</span>
            <span>Attempts</span>
            <span>Hits</span>
            <span>Coverage</span>
            <span>Avg ms</span>
            <span>Cost</span>
          </div>
          {q.providers.length ? (
            q.providers.map((p) => (
              <div
                key={p.provider}
                className="grid grid-cols-[1.4fr_0.8fr_0.8fr_0.9fr_0.8fr_1fr] border-t border-[#E2E1D9] px-5 py-4 text-sm text-[#33362f]"
              >
                <span className="font-medium">{p.provider}</span>
                <span>{p.attempts}</span>
                <span>{p.hits}</span>
                <span>{p.coverage}%</span>
                <span>{p.avgMs}</span>
                <span>{usd(p.costMicroUsd)}</span>
              </div>
            ))
          ) : (
            <div className="px-5 py-6 text-sm text-[#555951]">No provider calls recorded yet.</div>
          )}
        </section>

        <section className="mt-6 overflow-hidden border border-[#E2E1D9]">
          <div className="flex h-11 items-center border-b border-[#E2E1D9] bg-[#FFFFFA] px-4">
            <h2 className="text-sm font-medium text-[#11130f]">Spend by source</h2>
          </div>
          {q.spendBySource.length ? (
            q.spendBySource.map((s) => (
              <div key={s.source} className="flex items-center justify-between border-t border-[#E2E1D9] px-5 py-4 text-sm text-[#33362f]">
                <span className="font-medium">{s.source}</span>
                <span className="text-[#555951]">
                  {s.requests} lookups · COGS {usd(s.costMicroUsd)}
                </span>
              </div>
            ))
          ) : (
            <div className="px-5 py-6 text-sm text-[#555951]">No spend yet.</div>
          )}
        </section>
      </div>
    </main>
  );
}
