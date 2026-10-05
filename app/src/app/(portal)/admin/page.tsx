import { notFound } from "next/navigation";
import { requireSessionUserId } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageTitle, MetricCard } from "@/components/portal-ui";
import { computeQuality } from "@/lib/analytics";

export const metadata = { title: "Admin - yute" };

function isAdmin(email: string): boolean {
  const list = (process.env.YUTE_ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return list.includes(email.toLowerCase());
}

export default async function AdminPage() {
  const userId = await requireSessionUserId();
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!me || !isAdmin(me.email)) notFound();

  const [users, keys, logs, jobs] = await Promise.all([
    prisma.user.findMany({ orderBy: { createdAt: "desc" }, take: 100, select: { id: true, email: true, plan: true, creditBalance: true, createdAt: true, lastLoginAt: true } }),
    prisma.apiKey.count(),
    prisma.requestLog.count(),
    prisma.enrichmentJob.count(),
  ]);
  const q = await computeQuality(userId, 30);

  return (
    <main className="min-h-screen bg-[#F6F6F1] px-4 py-5 [font-family:Helvetica,Arial,sans-serif] lg:px-8">
      <div className="mx-auto max-w-6xl">
        <PageTitle eyebrow="Internal" title="Admin" subtitle="Workspaces, usage and quality across the instance." />

        <div className="mt-8 grid gap-4 lg:grid-cols-4">
          <MetricCard label="Users" value={users.length.toLocaleString()} />
          <MetricCard label="API keys" value={keys.toLocaleString()} />
          <MetricCard label="Lookups" value={logs.toLocaleString()} />
          <MetricCard label="Jobs" value={jobs.toLocaleString()} />
        </div>

        <section className="mt-6 overflow-hidden border border-[#E2E1D9]">
          <div className="grid grid-cols-[1.6fr_0.6fr_0.8fr_1.2fr_1.2fr] bg-[#F6F6F1] px-5 py-3 text-sm font-medium text-[#555951]">
            <span>Email</span>
            <span>Plan</span>
            <span>Credits</span>
            <span>Created</span>
            <span>Last login</span>
          </div>
          {users.map((u) => (
            <div key={u.id} className="grid grid-cols-[1.6fr_0.6fr_0.8fr_1.2fr_1.2fr] border-t border-[#E2E1D9] px-5 py-3 text-sm text-[#33362f]">
              <span className="truncate font-medium">{u.email}</span>
              <span>{u.plan}</span>
              <span>{u.creditBalance.toLocaleString()}</span>
              <span className="text-[#555951]">{u.createdAt.toISOString().slice(0, 10)}</span>
              <span className="text-[#555951]">{u.lastLoginAt ? u.lastLoginAt.toISOString().slice(0, 16).replace("T", " ") : "-"}</span>
            </div>
          ))}
        </section>

        <section className="mt-6 overflow-hidden border border-[#E2E1D9]">
          <div className="flex h-11 items-center border-b border-[#E2E1D9] bg-[#FFFFFA] px-4">
            <h2 className="text-sm font-medium text-[#11130f]">Provider coverage (my workspace)</h2>
          </div>
          {q.providers.map((p) => (
            <div key={p.provider} className="flex items-center justify-between border-t border-[#E2E1D9] px-5 py-3 text-sm">
              <span className="font-medium">{p.provider}</span>
              <span className="text-[#555951]">{p.attempts} calls · {p.coverage}% coverage · ${(p.costMicroUsd / 1_000_000).toFixed(4)}</span>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
