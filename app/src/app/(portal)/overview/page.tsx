import Link from "next/link";
import {
  BarChart3,
  BookOpen,
  ChevronRight,
  Coins,
  FileSearch,
  Globe,
  KeyRound,
  Plug,
  ScrollText,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { DashboardRow, SectionHeader } from "@/components/portal-ui";
import { requireSessionUserId } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { HomeKeyCard, type KeyRow } from "@/components/keys-client";

export const metadata = { title: "Overview - yute" };

export default async function OverviewPage() {
  const userId = await requireSessionUserId();

  const [keys, requests] = await Promise.all([
    prisma.apiKey.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, prefix: true, last4: true, scope: true, revokedAt: true, createdAt: true, lastUsedAt: true },
    }),
    prisma.requestLog.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
  ]);

  const activeCount = keys.filter((k) => !k.revokedAt).length;
  const total = await prisma.requestLog.count({ where: { userId } });
  const resolved = await prisma.requestLog.count({ where: { userId, ok: true } });

  const keyRows: KeyRow[] = keys.map((k) => ({
    id: k.id,
    name: k.name,
    prefix: k.prefix,
    last4: k.last4,
    scope: k.scope,
    status: k.revokedAt ? "revoked" : "active",
    createdAt: k.createdAt.toISOString(),
    lastUsedAt: k.lastUsedAt?.toISOString(),
  }));

  return (
    <div className="mx-auto w-full max-w-7xl px-3 py-3 text-[13px] text-[#11130f] [font-family:Helvetica,Arial,sans-serif] sm:px-5 sm:py-5">
      <header className="flex flex-col justify-between gap-3 border-b border-[#E2E1D9] pb-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-[11px] font-medium uppercase text-[#777970]">yute Studio</p>
          <h1 className="mt-1 text-2xl font-medium tracking-normal text-[#11130f]">Workspace</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/docs"
            className="inline-flex h-9 items-center justify-center gap-2 bg-[#173D2D] px-4 text-xs font-medium text-white transition hover:bg-[#0F2F22]"
          >
            Open Docs <ChevronRight className="h-3.5 w-3.5" />
          </Link>
          <Link
            href="/api-keys"
            className="inline-flex h-9 items-center justify-center gap-2 border border-[#E2E1D9] bg-[#FFFFFA] px-4 text-xs font-medium text-[#33362f] transition hover:border-[#173D2D]/60"
          >
            <KeyRound className="h-3.5 w-3.5" />
            API keys
          </Link>
        </div>
      </header>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="border border-[#E2E1D9] bg-[#FFFFFA]">
          <SectionHeader title="API surface" actionLabel="Docs" href="/docs" />
          <div className="divide-y divide-[#E2E1D9]">
            <DashboardRow title="Email Lookup" description="/v1/lookup?email= - person data with deliverability validation" href="/playground/lookup" icon={FileSearch} />
            <DashboardRow title="Domain Lookup" description="/v1/lookup?domain= - company lookup by web domain" href="/playground/domain" icon={Globe} />
            <DashboardRow title="Name Lookup" description="/v1/lookup?name= - person lookup by full name" href="/playground/name" icon={UserRound} />
            <DashboardRow title="Validation" description="Syntax, domain and MX checked before delivery" href="/usage" icon={ShieldCheck} />
            <DashboardRow title="API Keys" description="Create and revoke keys for each project" href="/api-keys" icon={KeyRound} />
          </div>
        </section>

        <HomeKeyCard keys={keyRows} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="border border-[#E2E1D9] bg-[#FFFFFA]">
          <SectionHeader title="Recent requests" actionLabel="View all" href="/logs" />
          {requests.length === 0 ? (
            <div className="p-4">
              <p className="text-sm font-medium text-[#11130f]">No requests yet</p>
              <p className="mt-1 text-xs leading-5 text-[#555951]">
                Create a key and run your first lookup. Every request shows up here.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#E2E1D9]">
              {requests.map((r) => (
                <div key={r.id} className="flex min-h-[58px] items-center gap-3 px-4 py-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center border border-[#E2E1D9] bg-[#FFFFFA] text-[#173D2D]">
                    <ScrollText className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[#11130f]">{r.query}</p>
                    <p className="mt-0.5 truncate text-xs text-[#555951]">
                      {r.queryType} · {r.ms}ms · {r.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                    </p>
                  </div>
                  <span className={r.ok ? "text-xs font-medium text-emerald-700" : "text-xs font-medium text-red-600"}>
                    {r.ok ? "resolved" : "failed"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="border border-[#E2E1D9] bg-[#FFFFFA]">
          <SectionHeader title="Workspace" actionLabel="Account" href="/settings" />
          <div className="divide-y divide-[#E2E1D9]">
            <DashboardRow title="API Keys" description={`${activeCount} active keys`} href="/api-keys" icon={KeyRound} />
            <DashboardRow title="Request Logs" description={`${total} lookups logged, ${resolved} resolved`} href="/logs" icon={ScrollText} />
            <DashboardRow title="Usage" description="Calls, success rate and average response" href="/usage" icon={BarChart3} />
            <DashboardRow title="Billing" description="Plan, limits and how we price" href="/billing" icon={Coins} />
            <DashboardRow title="Docs" description="Endpoint, params and examples" href="/docs" icon={BookOpen} />
            <DashboardRow title="Settings" description="Profile and password" href="/settings" icon={UserRound} />
            <DashboardRow title="Integrations" description="cURL, JavaScript, Python and MCP" href="/integrations" icon={Plug} />
          </div>
        </section>
      </div>
    </div>
  );
}


