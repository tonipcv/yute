import type { Metadata } from "next";
import Link from "next/link";
import { Mark } from "@/components/mark";

export const metadata: Metadata = { title: "API docs - yute" };

const code = "mt-4 overflow-x-auto border border-[#E2E1D9] bg-[#F6F6F1] px-4 py-3 font-mono text-xs leading-6 text-[#33362f]";

export default function DocsPage() {
  return (
    <main className="min-h-screen bg-[#F6F6F1] px-4 py-5 text-[#11130f] [font-family:Helvetica,Arial,sans-serif] lg:px-8">
      <div className="mx-auto max-w-4xl">
        <header className="mb-5 flex items-center justify-between border-b border-[#E2E1D9] pb-4">
          <Link href="/overview" className="flex items-center gap-2">
            <span className="block h-4 w-3 text-[#11130f]"><Mark /></span>
            <span className="text-sm font-medium">yute</span>
          </Link>
          <Link href="/login" className="text-xs font-medium text-[#555951] hover:text-[#11130f]">Sign in</Link>
        </header>

        <header className="mb-5 border-b border-[#E2E1D9] pb-4">
          <p className="text-[11px] font-medium uppercase text-[#777970]">Public</p>
          <h1 className="mt-1 text-3xl font-medium tracking-normal">API Docs</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#555951]">One endpoint. Pass a query, get clean JSON.</p>
        </header>

        <section className="border border-[#E2E1D9] bg-[#FFFFFA]">
          <div className="flex h-11 items-center border-b border-[#E2E1D9] px-4">
            <h2 className="text-sm font-medium">Endpoint</h2>
          </div>
          <div className="p-4">
            <pre className={code}>{`GET https://api.yute.dev/v1/lookup
Authorization: Bearer yute_your_key`}</pre>
          </div>
        </section>

        <section className="mt-4 border border-[#E2E1D9] bg-[#FFFFFA]">
          <div className="flex h-11 items-center border-b border-[#E2E1D9] px-4">
            <h2 className="text-sm font-medium">Query</h2>
          </div>
          <div className="divide-y divide-[#E2E1D9]">
            <QueryRow name="?email=" body="Person lookup by email. Returns validation: syntax, domain, MX records, deliverable." />
            <QueryRow name="?domain=" body="Company lookup by web domain. Returns domain liveness." />
            <QueryRow name="?name=" body="Person lookup by full name." />
          </div>
        </section>

        <section className="mt-4 border border-[#E2E1D9] bg-[#FFFFFA]">
          <div className="flex h-11 items-center border-b border-[#E2E1D9] px-4">
            <h2 className="text-sm font-medium">Example</h2>
          </div>
          <div className="p-4">
            <pre className={code}>{`curl "https://api.yute.dev/v1/lookup?email=leo@example.com" \\
  -H "Authorization: Bearer yute_..."`}</pre>
            <pre className={code}>{`{
  "request_id": "...",
  "object": "lookup",
  "query": { "type": "email", "value": "leo@example.com" },
  "resolved": {
    "email": {
      "email": "leo@example.com",
      "syntaxValid": true,
      "domain": "example.com",
      "deliverable": true
    }
  },
  "enrichment": "web_search at request time",
  "ms": 12
}`}</pre>
          </div>
        </section>

        <section className="mt-4 border border-[#E2E1D9] bg-[#FFFFFA] p-4">
          <h2 className="text-sm font-medium">How resolution works</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[#555951]">
            yute searches the live web first and validates what it finds. Only what the web cannot resolve is routed - after validation - to its data provider partners.
          </p>
        </section>

        <footer className="mt-10 flex items-center justify-between border-t border-[#E2E1D9] pt-4 text-xs text-[#777970]">
          <span>Copyright &copy; 2026 yute</span>
          <Link href="/login" className="hover:text-[#11130f]">Workspace access</Link>
        </footer>
      </div>
    </main>
  );
}

function QueryRow({ name, body }: { name: string; body: string }) {
  return (
    <div className="flex min-h-[58px] items-center gap-4 px-4 py-3">
      <code className="shrink-0 border border-[#E2E1D9] bg-[#F6F6F1] px-2 py-1 font-mono text-xs text-[#173D2D]">{name}</code>
      <p className="text-sm leading-6 text-[#555951]">{body}</p>
    </div>
  );
}
