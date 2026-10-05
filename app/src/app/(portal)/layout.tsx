import { redirect } from "next/navigation";
import { getSessionUserId } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { signOutAction } from "@/actions/auth";
import Sidebar from "@/components/sidebar";

export const metadata = { robots: { index: false, follow: false } };

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, creditBalance: true, plan: true } });
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen bg-[#F6F6F1] text-[#11130f] [font-family:Helvetica,Arial,sans-serif]">
      <Sidebar user={user} signOut={signOutAction} />
      <div className="flex min-h-screen min-w-0 flex-col lg:ml-[260px]">
        <main className="flex-1 overflow-auto bg-[#F6F6F1]">{children}</main>
      </div>
    </div>
  );
}
