import { requireSessionUserId } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { KeysManager, type KeyRow } from "@/components/keys-client";
import { PageTitle } from "@/components/portal-ui";

export const metadata = { title: "API keys - yute" };

export default async function KeysPage() {
  const userId = await requireSessionUserId();
  const keys = await prisma.apiKey.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });

  const rows: KeyRow[] = keys.map((k) => ({
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
    <main className="min-h-screen bg-[#F6F6F1] px-4 py-5 [font-family:Helvetica,Arial,sans-serif] lg:px-8">
      <div className="mx-auto max-w-6xl">
        <PageTitle
          title="API Keys"
          subtitle="One key per project. The full secret is shown only right after creation - store it then."
        />
        <KeysManager keys={rows} />
      </div>
    </main>
  );
}
