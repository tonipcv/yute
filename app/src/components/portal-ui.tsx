import Link from "next/link";
import { ArrowUpRight, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function PageTitle({ eyebrow, title, subtitle }: { eyebrow?: string; title: string; subtitle?: string }) {
  return (
    <header className="mb-5 border-b border-[#E2E1D9] pb-4">
      <p className="text-[11px] font-medium uppercase text-[#777970]">{eyebrow ?? "Dashboard"}</p>
      <h1 className="mt-1 text-3xl font-medium tracking-normal text-[#11130f]">{title}</h1>
      {subtitle ? <p className="mt-2 max-w-3xl text-sm leading-6 text-[#555951]">{subtitle}</p> : null}
    </header>
  );
}

export function SectionHeader({
  title,
  actionLabel,
  href,
}: {
  title: string;
  actionLabel?: string;
  href?: string;
}) {
  return (
    <div className="flex h-11 items-center justify-between border-b border-[#E2E1D9] px-4">
      <h2 className="text-sm font-medium text-[#11130f]">{title}</h2>
      {actionLabel ? (
        <Link href={href ?? "/"} className="inline-flex items-center gap-1.5 text-xs font-medium text-[#555951] hover:text-[#11130f]">
          {actionLabel}
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      ) : null}
    </div>
  );
}

export function DashboardRow({
  title,
  description,
  href,
  icon: Icon,
  external,
}: {
  title: string;
  description: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  external?: boolean;
}) {
  return (
    <Link href={href} className="group flex min-h-[58px] items-center gap-3 px-4 py-3 transition hover:bg-[#F6F6F1]">
      <span className="grid h-8 w-8 shrink-0 place-items-center border border-[#E2E1D9] bg-[#FFFFFA] text-[#173D2D]">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[#11130f]">{title}</p>
        <p className="mt-0.5 truncate text-xs text-[#555951]">{description}</p>
      </div>
      {external ? (
        <ArrowUpRight className="h-4 w-4 shrink-0 text-[#777970] transition group-hover:text-[#11130f]" />
      ) : (
        <ChevronRight className="h-4 w-4 shrink-0 text-[#777970] transition group-hover:text-[#11130f]" />
      )}
    </Link>
  );
}

export function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[#E2E1D9] bg-[#FFFFFA] p-4">
      <p className="text-[11px] font-medium uppercase text-[#777970]">{label}</p>
      <p className="mt-1 text-xl font-medium tracking-tight text-[#11130f]">{value}</p>
    </div>
  );
}

export function LimitCard({ title, body, href, action }: { title: string; body: string; href: string; action: string }) {
  return (
    <div className="border border-[#E2E1D9] bg-[#FFFFFA] p-4">
      <h3 className="text-sm font-semibold text-[#11130f]">{title}</h3>
      <p className="mt-2 min-h-[44px] text-sm leading-6 text-[#555951]">{body}</p>
      <Link href={href} className="mt-3 inline-flex text-sm font-medium text-[#173D2D]">
        {action} →
      </Link>
    </div>
  );
}

export function Tabs({ tabs, active }: { tabs: { href: string; label: string }[]; active: string }) {
  return (
    <div className="flex gap-6 border-b border-[#E2E1D9]">
      {tabs.map((tab) => {
        const isActive = tab.href === active;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "py-3 text-sm font-medium",
              isActive ? "border-b-2 border-[#173D2D] text-[#173D2D]" : "text-[#33362f] hover:text-[#11130f]",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}

export function TableHeader({ cols, labels }: { cols: string; labels: ReactNode[] }) {
  return (
    <div className={cn("grid bg-[#F6F6F1] px-5 py-3 text-sm font-medium text-[#555951]", cols)}>
      {labels.map((label, i) => (
        <span key={i}>{label}</span>
      ))}
    </div>
  );
}

export function TableRow({ cols, children }: { cols: string; children: ReactNode }) {
  return (
    <div className={cn("grid items-center border-t border-[#E2E1D9] px-5 py-4 text-sm text-[#33362f]", cols)}>
      {children}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-[340px] flex-col items-center justify-center text-center">
      <div className="mb-6 flex h-12 w-12 items-center justify-center bg-[#F6F6F1] text-[#11130f]">
        <Icon className="h-6 w-6" />
      </div>
      <h2 className="text-xl font-semibold text-[#11130f]">{title}</h2>
      <p className="mt-3 max-w-md text-sm leading-6 text-[#555951]">{body}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

export function Banner({ kind, children }: { kind: "error" | "warn" | "ok"; children: ReactNode }) {
  const styles =
    kind === "error"
      ? "border-red-200 bg-red-50 text-red-700"
      : kind === "warn"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : "border-emerald-200 bg-emerald-50 text-emerald-900";
  return <div className={cn("border p-4 text-sm", styles)}>{children}</div>;
}
