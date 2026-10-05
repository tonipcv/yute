import { PageTitle, Tabs } from "@/components/portal-ui";
import { requireSessionUserId } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Profile - yute" };

export default async function SettingsProfilePage() {
  const userId = await requireSessionUserId();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, createdAt: true, lastLoginAt: true },
  });

  return (
    <main className="min-h-screen bg-[#F6F6F1] px-4 py-5 [font-family:Helvetica,Arial,sans-serif] lg:px-8">
      <div className="mx-auto max-w-6xl">
      <PageTitle eyebrow="Management" title="Settings" />
      <Tabs
        active="/settings"
        tabs={[
          { href: "/settings", label: "Profile" },
          { href: "/settings/password", label: "Password" },
        ]}
      />

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <section className="border border-[#E2E1D9] bg-[#FFFFFA] p-4">
          <p className="text-[11px] font-medium uppercase text-[#777970]">User</p>
          <p className="mt-2 text-lg font-medium text-[#11130f]">{user?.email}</p>
          <div className="mt-3 grid gap-px border border-[#E2E1D9] bg-[#E2E1D9] text-sm">
            <div className="flex justify-between bg-[#FFFFFA] px-3 py-2">
              <span className="text-[#555951]">Member since</span>
              <span>{user ? user.createdAt.toISOString().slice(0, 10) : "-"}</span>
            </div>
            <div className="flex justify-between bg-[#FFFFFA] px-3 py-2">
              <span className="text-[#555951]">Last sign in</span>
              <span>{user?.lastLoginAt ? user.lastLoginAt.toISOString().slice(0, 16).replace("T", " ") : "-"}</span>
            </div>
            <div className="flex justify-between gap-6 bg-[#FFFFFA] px-3 py-2">
              <span className="shrink-0 text-[#555951]">User id</span>
              <span className="truncate font-mono text-xs">{userId}</span>
            </div>
          </div>
        </section>

        <section className="border border-[#E2E1D9] bg-[#FFFFFA] p-4">
          <h2 className="text-sm font-medium text-[#11130f]">Workspace</h2>
          <p className="mt-1 text-xs leading-5 text-[#555951]">
            This workspace owns its keys and logs. There is one user per workspace by design - keys can be scoped per project instead.
          </p>
          <div className="mt-4 grid gap-2">
            <a
              href="/api-keys"
              className="inline-flex h-9 w-fit items-center justify-center border border-[#E2E1D9] bg-[#FFFFFA] px-4 text-xs font-medium text-[#33362f] transition hover:border-[#173D2D]/60"
            >
              Manage API keys
            </a>
            <a
              href="mailto:hello@yute.dev"
              className="inline-flex h-9 w-fit items-center justify-center border border-[#E2E1D9] bg-[#FFFFFA] px-4 text-xs font-medium text-[#33362f] transition hover:border-[#173D2D]/60"
            >
              Contact us
            </a>
          </div>
        </section>
      </div>
      </div>
    </main>
  );
}
