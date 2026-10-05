import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { requireSessionUserId } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { EmptyState, LimitCard, MetricCard, PageTitle, TableHeader, TableRow } from "@/components/portal-ui";

export const metadata = { title: "Usage - yute" };

export default async function UsagePage() {
  const userId = await requireSessionUserId();

  const [total, resolved, failed, agg, byType, recent] = await Promise.all([
    prisma.requestLog.count({ where: { userId } }),
    prisma.requestLog.count({ where: { userId, ok: true } }),
    prisma.requestLog.count({ where: { userId, ok: false } }),
    prisma.requestLog.aggregate({ where: { userId }, _avg: { ms: true } }),
    prisma.requestLog.groupBy({
      by: ["queryType", "ok"],
      where: { userId },
      _count: { _all: true },
      _avg: { ms: true },
    }),
    prisma.requestLog.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 10 }),
  ]);

  const avgMs = Math.round(agg._avg.ms ?? 0);

  const rows = ["email", "domain", "name"].map((type) => {
    const forType = byType.filter((r) => r.queryType === type);
    const calls = forType.reduce((sum, r) => sum + r._count._all, 0);
    const okCalls = forType.filter((r) => r.ok).reduce((sum, r) => sum + r._count._all, 0);
    const avg = forType.length
      ? Math.round(forType.reduce((sum, r) => sum + (r._avg.ms ?? 0) * r._count._all, 0) / Math.max(calls, 1))
      : 0;
    return { type, calls, okCalls, avg, successRate: calls ? Math.round((okCalls / calls) * 100) : 0 };
  });

  return (
    <main className="min-h-screen bg-[#F6F6F1] px-4 py-5 [font-family:Helvetica,Arial,sans-serif] lg:px-8">
      <div className="mx-auto max-w-6xl">
      <PageTitle
        title="Usage"
        subtitle="All analytics are based on UTC. There may be a small delay for requests to show up."
      />

      {total === 0 ? (
        <>
          <div className="mt-8">
            <EmptyState
              icon={BarChart3}
              title="No usage recorded"
              body="Run a lookup from the API Playground or call the API with a key. Usage shows up here."
              action={
                <Link
                  href="/playground/lookup"
                  className="inline-flex h-9 items-center justify-center bg-[#173D2D] px-4 text-xs font-medium text-white transition hover:bg-[#0F2F22]"
                >
                  Open Playground
                </Link>
              }
            />
          </div>
          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <LimitCard title="Free workspace" body="Every workspace starts free. Playground requests and API calls count the same." href="/billing" action="View plans" />
            <LimitCard title="Validation included" body="Syntax, domain and MX checks run on every email lookup at no extra cost." href="/playground/lookup" action="Try a lookup" />
            <LimitCard title="Logs are private" body="Provider and internal cost details never leave your workspace." href="/logs" action="Open logs" />
          </div>
        </>
      ) : (
        <>
          <div className="mt-8 grid gap-4 lg:grid-cols-4">
            <MetricCard label="Calls" value={total.toLocaleString()} />
            <MetricCard label="Resolved" value={resolved.toLocaleString()} />
            <MetricCard label="Failed" value={failed.toLocaleString()} />
            <MetricCard label="Avg response" value={`${avgMs}ms`} />
          </div>

          <div className="mt-6 overflow-hidden border border-[#E2E1D9]">
            <TableHeader cols="grid-cols-[1.2fr_0.7fr_0.7fr_0.7fr_0.8fr]" labels={["Query type", "Calls", "Resolved", "Success", "Avg time"]} />
            {rows.map((row) => (
              <TableRow key={row.type} cols="grid-cols-[1.2fr_0.7fr_0.7fr_0.7fr_0.8fr]">
                <span className="font-medium">{row.type}</span>
                <span>{row.calls.toLocaleString()}</span>
                <span>{row.okCalls.toLocaleString()}</span>
                <span>{row.successRate}%</span>
                <span>{row.avg}ms</span>
              </TableRow>
            ))}
          </div>

          <div className="mt-6 overflow-hidden border border-[#E2E1D9]">
            <TableHeader cols="grid-cols-[1.4fr_0.8fr_0.7fr_0.8fr_1.2fr]" labels={["Recent request", "Type", "Status", "Time", "When"]} />
            {recent.map((row) => (
              <TableRow key={row.id} cols="grid-cols-[1.4fr_0.8fr_0.7fr_0.8fr_1.2fr]">
                <span className="font-medium">{row.query}</span>
                <span className="text-[#555951]">{row.queryType}</span>
                <span className={row.ok ? "text-emerald-700" : "text-red-600"}>{row.ok ? "resolved" : "failed"}</span>
                <span>{row.ms}ms</span>
                <span className="text-[#555951]">{row.createdAt.toISOString().slice(0, 16).replace("T", " ")}</span>
              </TableRow>
            ))}
          </div>
        </>
      )}
      </div>
    </main>
  );
}
