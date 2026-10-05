"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Copy, FileText, Rocket } from "lucide-react";
import { runLookupAction, type PlaygroundState } from "@/actions/playground";
import { cn } from "@/lib/cn";

export function PlaygroundTool({
  queryType,
  title,
  subtitle,
  endpoint,
  label,
  placeholder,
  samples,
}: {
  queryType: "email" | "domain" | "name" | "phone";
  title: string;
  subtitle: string;
  endpoint: string;
  label: string;
  placeholder: string;
  samples: string[];
}) {
  const [state, formAction, pending] = useActionState<PlaygroundState | undefined, FormData>(runLookupAction, undefined);
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState(false);

  const curl = `curl "https://yute.heuv.dev/v1/lookup?${queryType}=${query || placeholder}" \\
  -H "Authorization: Bearer yute_..."`;

  const result = state?.resolved
    ? JSON.stringify(
        {
          query: { type: state.queryType, value: state.query },
          resolved: state.resolved,
          resolved_core: state.resolvedCore,
          sources: state.sources,
          confidence: state.confidence,
          mode: state.mode,
          cache: state.cache,
          credits_charged: state.creditsCharged,
          balance: state.balance,
          cost_usd: state.costUsd,
          ms: state.ms,
        },
        null,
        2
      )
    : null;

  return (
    <div className="grid min-h-screen bg-[#F6F6F1] [font-family:Helvetica,Arial,sans-serif] xl:grid-cols-[minmax(0,1fr)_minmax(420px,42%)]">
      <main className="min-w-0 px-4 py-5 lg:px-8 xl:px-10">
        <div className="mx-auto max-w-[760px]">
          <header className="mb-5 flex flex-col gap-4 border-b border-[#E2E1D9] pb-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[11px] font-medium uppercase text-[#777970]">API Playground</p>
              <h1 className="mt-1 text-[30px] font-medium leading-tight tracking-normal text-[#11130f]">{title}</h1>
              <p className="mt-1.5 text-sm leading-6 text-[#555951]">{subtitle}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/docs"
                className="inline-flex h-9 items-center gap-1.5 border border-[#E2E1D9] bg-[#FFFFFA] px-3 text-sm font-medium text-[#555951] hover:border-[#173D2D]/60"
              >
                <FileText className="h-4 w-4" />
                Docs
              </Link>
              <Link
                href="/docs"
                className="inline-flex h-9 items-center gap-1.5 border border-[#E2E1D9] bg-[#FFFFFA] px-3 text-sm font-medium text-[#555951] hover:border-[#173D2D]/60"
              >
                <Rocket className="h-4 w-4" />
                {endpoint}
              </Link>
            </div>
          </header>

          <form action={formAction}>
            <input type="hidden" name="queryType" value={queryType} />
            <section className="mb-5">
              <p className="mb-2 text-sm font-medium text-[#555951]">{label}</p>
              <div className="flex min-h-[88px] items-start gap-3 border border-[#E2E1D9] bg-[#FFFFFA] px-4 py-3">
                <input
                  aria-label={label}
                  name="query"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={placeholder}
                  autoComplete="off"
                  className="min-h-[60px] min-w-0 flex-1 bg-transparent pt-1 text-sm font-medium leading-6 text-[#11130f] outline-none placeholder:text-[#777970]"
                />
                <button
                  type="submit"
                  disabled={pending}
                  className="mt-auto inline-flex h-9 shrink-0 items-center gap-2 bg-[#173D2D] px-4 text-sm font-medium text-white disabled:opacity-70"
                >
                  {pending ? "Running" : "Run"}
                  <ArrowRight className={cn("h-4 w-4 rotate-180", pending && "animate-pulse")} />
                </button>
              </div>
            </section>
          </form>

          <div className="mb-5 flex flex-wrap items-center gap-2">
            <span className="text-xs text-[#777970]">Try</span>
            {samples.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setQuery(s)}
                className="border border-[#E2E1D9] bg-[#FFFFFA] px-2.5 py-1 font-mono text-xs text-[#33362f] hover:border-[#173D2D]/60"
              >
                {s}
              </button>
            ))}
          </div>

          {state?.error ? (
            <div className="mb-5 border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700">{state.error}</div>
          ) : null}

          <section className="mb-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-[#555951]">Equivalent request</p>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(curl);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[#555951] hover:text-[#11130f]"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <pre className="mt-2 overflow-x-auto border border-[#E2E1D9] bg-[#FFFFFA] px-4 py-3 font-mono text-xs leading-6 text-[#33362f]">{curl}</pre>
          </section>

          {state?.ok ? (
            <div className="mb-5 flex flex-wrap gap-2 text-xs">
              <Badge label="mode" value={state.mode ?? "-"} />
              <Badge label="confidence" value={`${state.confidence ?? 0}%`} />
              <Badge label="credits" value={String(state.creditsCharged ?? 0)} />
              {state.cache ? <Badge label="cache" value="hit" /> : null}
              {typeof state.balance === "number" ? <Badge label="balance" value={String(state.balance)} /> : null}
            </div>
          ) : null}

          {state?.sources && state.sources.length ? (
            <section className="mb-5">
              <p className="mb-2 text-sm font-medium text-[#555951]">Sources</p>
              <div className="divide-y divide-[#E2E1D9] border border-[#E2E1D9] bg-[#FFFFFA]">
                {(state.sources as Array<{ provider?: string; field?: string; url?: string; note?: string }>).map((s, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                    <span className="font-medium text-[#33362f]">{s.provider ?? "?"}</span>
                    <span className="text-[#777970]">{s.field ?? ""}</span>
                    {s.url ? (
                      <a href={s.url} target="_blank" rel="noreferrer" className="truncate text-[#173D2D] underline">
                        {s.url}
                      </a>
                    ) : (
                      <span className="text-[#777970]">{s.note ?? ""}</span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {result ? (
            <section className="mb-5 xl:hidden">
              <p className="mb-2 text-sm font-medium text-[#555951]">Response</p>
              <pre className="overflow-x-auto border border-[#E2E1D9] bg-[#FFFFFA] px-4 py-3 font-mono text-xs leading-6 text-[#33362f]">{result}</pre>
            </section>
          ) : null}
        </div>
      </main>

      <aside className="hidden min-w-0 border-l border-[#E2E1D9] bg-[#FFFFFA] xl:block">
        <div className="flex h-11 items-center justify-between border-b border-[#E2E1D9] px-4">
          <h2 className="text-sm font-medium text-[#11130f]">Response</h2>
          {state?.ok ? <span className="text-xs text-[#173D2D]">{state.ms}ms</span> : null}
        </div>
        <div className="p-5">
          {result ? (
            <pre className="overflow-x-auto border border-[#E2E1D9] bg-[#F6F6F1] px-4 py-3 font-mono text-xs leading-6 text-[#33362f]">{result}</pre>
          ) : (
            <p className="text-sm leading-6 text-[#555951]">
              No request yet. Run a lookup and the clean JSON appears here - the same body the API returns.
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}

function Badge({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 border border-[#E2E1D9] bg-[#FFFFFA] px-2.5 py-1">
      <span className="uppercase tracking-wide text-[#777970]">{label}</span>
      <span className="font-medium text-[#11130f]">{value}</span>
    </span>
  );
}
