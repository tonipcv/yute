"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  ArrowUpRight,
  BarChart3,
  BookOpen,
  Coins,
  FileText,
  Home,
  KeyRound,
  LogOut,
  Mail,
  Plug,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Mark } from "@/components/mark";

interface SidebarProps {
  user: { email: string; creditBalance: number; plan: string };
  signOut: () => Promise<void>;
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  external?: boolean;
  exact?: boolean;
}

const navSections: { label: string | null; items: NavItem[] }[] = [
  {
    label: null,
    items: [{ href: "/overview", label: "Home", icon: Home, exact: true }],
  },
  {
    label: "Management",
    items: [
      { href: "/usage", label: "Usage", icon: BarChart3 },
      { href: "/quality", label: "Quality", icon: BarChart3 },
      { href: "/logs", label: "Request Logs", icon: FileText },
      { href: "/credits", label: "Credits", icon: Coins },
      { href: "/billing", label: "Billing", icon: Coins },
      { href: "/api-keys", label: "API Keys", icon: KeyRound },
      { href: "/settings", label: "Settings", icon: Settings },
      ...(process.env.YUTE_ADMIN_EMAILS ? [{ href: "/admin", label: "Admin", icon: Settings }] : []),
    ],
  },
  {
    label: "Learn",
    items: [
      { href: "/docs", label: "Docs", icon: BookOpen },
      { href: "/integrations", label: "Integrations", icon: Plug },
    ],
  },
];

export default function Sidebar({ user, signOut }: SidebarProps) {
  const pathname = usePathname();
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const initials = (user.email || "y")
    .split(/[ @._-]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[260px] flex-col border-r border-[#E2E1D9] bg-[#FFFFFA] [font-family:Helvetica,Arial,sans-serif] lg:flex">
      <div className="flex h-[58px] items-center justify-between border-b border-[#E2E1D9] px-4 py-4">
        <Link href="/overview" className="flex min-w-0 items-center gap-2 text-sm font-medium text-[#11130f]">
          <span className="block h-4 w-3 shrink-0 text-[#11130f]"><Mark /></span>
          <span className="truncate text-sm font-medium">yute</span>
        </Link>
      </div>

      <nav className="flex-1 overflow-auto px-3 pb-4">
        <div className="space-y-5">
          {navSections.map((section) => (
            <div key={section.label || "primary"}>
              {section.label ? (
                <p className="mb-2.5 px-2.5 text-[11px] font-medium uppercase text-[#777970]">{section.label}</p>
              ) : null}
              <div className="space-y-1">
                {section.items.map((item) => (
                  <SidebarLink key={`${section.label}-${item.href}-${item.label}`} item={item} pathname={pathname} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </nav>

      <a
        href="mailto:hello@yute.dev"
        className="mx-3.5 mb-3 border border-[#E2E1D9] bg-[#F6F6F1] px-3.5 py-2.5 text-sm text-[#555951]"
      >
        Give us feedback
      </a>

      <Link
        href="/credits"
        className="mx-3.5 mb-3 flex items-center justify-between border border-[#E2E1D9] bg-[#FFFFFA] px-3.5 py-2.5"
      >
        <span className="text-xs font-medium uppercase text-[#777970]">Credits</span>
        <span className="text-sm font-medium text-[#11130f]">
          {user.creditBalance.toLocaleString()}
          <span className="ml-1 text-[10px] uppercase text-[#777970]">{user.plan}</span>
        </span>
      </Link>

      <div className="relative border-t border-[#E2E1D9] p-3.5">
        {userMenuOpen ? (
          <div className="absolute bottom-[76px] left-3.5 right-3.5 overflow-hidden border border-[#E2E1D9] bg-[#FFFFFA] shadow-2xl shadow-[#11130f]/10">
            <div className="flex items-center gap-3 px-4 py-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center bg-[#173D2D] text-xl font-medium text-white">{initials || "y"}</div>
              <div className="min-w-0">
                <p className="truncate text-lg font-medium text-[#11130f]">yute workspace</p>
                <p className="truncate text-sm text-[#555951]">{user.email}</p>
              </div>
            </div>
            <div className="mx-4 border-t border-[#E2E1D9]" />
            <a
              href="/settings"
              className="flex h-14 items-center gap-3 px-4 text-sm font-medium text-[#33362f] transition hover:bg-[#F6F6F1]"
            >
              <Settings className="h-5 w-5 text-[#777970]" />
              Settings
            </a>
            <div className="mx-4 border-t border-[#E2E1D9]" />
            <a
              href="mailto:hello@yute.dev"
              className="flex h-14 items-center gap-3 px-4 text-sm font-medium text-[#33362f] transition hover:bg-[#F6F6F1]"
            >
              <Mail className="h-5 w-5 text-[#777970]" />
              Contact us
            </a>
            <div className="mx-4 border-t border-[#E2E1D9]" />
            <button
              type="button"
              onClick={() => void signOut()}
              className="flex h-14 w-full items-center gap-3 px-4 text-left text-sm font-medium text-[#33362f] transition hover:bg-[#F6F6F1]"
            >
              <LogOut className="h-5 w-5 text-[#777970]" />
              Logout
            </button>
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => setUserMenuOpen((open) => !open)}
          className="flex w-full items-center gap-3 px-1 py-1.5 text-left transition hover:bg-[#F6F6F1]"
          aria-expanded={userMenuOpen}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center bg-[#173D2D] text-sm font-medium text-white">{initials || "y"}</div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-[#11130f]">yute workspace</p>
            <p className="truncate text-xs text-[#555951]">{user.email}</p>
          </div>
        </button>
      </div>
    </aside>
  );
}

function SidebarLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/");

  return (
    <Link
      href={item.href}
      className={cn(
        "flex min-h-9 items-center gap-3 px-2.5 text-sm font-medium transition-colors",
        active ? "bg-[#173D2D] text-white" : "text-[#555951] hover:bg-[#F6F6F1] hover:text-[#11130f]",
      )}
    >
      <item.icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{item.label}</span>
      {item.external ? <ArrowUpRight className="ml-auto h-3.5 w-3.5 text-[#777970]" /> : null}
    </Link>
  );
}
