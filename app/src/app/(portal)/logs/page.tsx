import { FileText } from "lucide-react";
import { requireSessionUserId } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Request logs - yute" };

export default async function LogsPage() {
  const userId = await requireSessionUserId();
  const rows = await prisma.requestLog.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <main className="min-h-screen bg-[#F6F6F1] px-4 py-5 [font-family:Helvetica,Arial,sans-serif] lg:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-5 border-b border-[#E2E1D9] pb-4">
          <p className="text-[11px] font-medium uppercase text-[#777970]">Dashboard</p>
          <h1 className="mt-1 text-3xl font-medium tracking-normal text-[#11130f]">Request Logs</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#555951]">
            Recent API calls for your workspace, newest first. Provider and internal cost details stay private.
          </p>
        </header>

        {rows.length ? (
          <div className="mt-8 overflow-hidden border border-[#E2E1D9]">
            <div className="grid grid-cols-[1.4fr_0.8fr_0.8fr_0.8fr_0.8fr_1.2fr] bg-[#F6F6F1] px-5 py-3 text-sm font-medium text-[#555951]">
              <span>Query</span>
              <span>Type</span>
              <span>Key</span>
              <span>Status</span>
              <span>Time</span>
              <span>When</span>
            </div>
            {rows.map((row) => (
              <div
                key={row.id}
                className="grid grid-cols-[1.4fr_0.8fr_0.8fr_0.8fr_0.8fr_1.2fr] border-t border-[#E2E1D9] px-5 py-4 text-sm text-[#33362f]"
              >
                <span className="truncate font-medium">{row.query}</span>
                <span className="text-[#555951]">{row.queryType}</span>
                <span className="text-[#555951]">{row.apiKeyId ? "key" : "-"}</span>
                <span className={row.ok ? "text-emerald-700" : "text-red-600"}>{row.ok ? "resolved" : "failed"}</span>
                <span>{row.ms}ms</span>
                <span className="text-[#555951]">{row.createdAt.toISOString().slice(0, 16).replace("T", " ")}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex min-h-[340px] flex-col items-center justify-center text-center">
            <div className="mb-6 flex h-12 w-12 items-center justify-center bg-[#F6F6F1] text-[#11130f]">
              <FileText className="h-6 w-6" />
            </div>
            <h2 className="text-xl font-semibold text-[#11130f]">No request logs yet</h2>
            <p className="mt-3 max-w-md text-sm leading-6 text-[#555951]">
              Create an API key and run a lookup. Every call appears here.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
