import { PageTitle, SectionHeader } from "@/components/portal-ui";
import { CopyButton } from "@/components/copy-button";

export const metadata = { title: "Integrations - yute" };

const pre = "mt-3 overflow-x-auto border border-[#E2E1D9] bg-[#F6F6F1] px-4 py-3 font-mono text-xs leading-6 text-[#33362f]";

const snippets = [
  {
    title: "cURL",
    body: "One request, no SDK.",
    code: `curl "https://api.yute.dev/v1/lookup?email=leo@example.com" \\
  -H "Authorization: Bearer yute_..."`,
  },
  {
    title: "JavaScript",
    body: "Fetch or any HTTP client.",
    code: `const res = await fetch(
  "https://api.yute.dev/v1/lookup?email=leo@example.com",
  { headers: { Authorization: \`Bearer \${process.env.YUTE_API_KEY}\` } }
);
const data = await res.json();`,
  },
  {
    title: "Python",
    body: "requests, no wrapper.",
    code: `import os, requests

res = requests.get(
    "https://api.yute.dev/v1/lookup",
    params={"email": "leo@example.com"},
    headers={"Authorization": f"Bearer {os.environ['YUTE_API_KEY']}"},
)
data = res.json()`,
  },
  {
    title: "MCP",
    body: "Expose lookup to your coding agent.",
    code: `{
  "mcpServers": {
    "yute": {
      "url": "https://api.yute.dev/mcp",
      "headers": { "Authorization": "Bearer yute_..." }
    }
  }
}`,
  },
];

export default function IntegrationsPage() {
  return (
    <main className="min-h-screen bg-[#F6F6F1] px-4 py-5 [font-family:Helvetica,Arial,sans-serif] lg:px-8">
      <div className="mx-auto max-w-6xl">
      <PageTitle
        eyebrow="Learn"
        title="Integrations"
        subtitle="yute is plain HTTP. Use it from any language, any agent, any backend - no SDK to install."
      />

      <div className="grid gap-4 xl:grid-cols-2">
        {snippets.map((s) => (
          <section key={s.title} className="border border-[#E2E1D9] bg-[#FFFFFA]">
            <div className="flex h-11 items-center justify-between border-b border-[#E2E1D9] px-4">
              <h2 className="text-sm font-medium text-[#11130f]">{s.title}</h2>
              <CopyButton text={s.code} />
            </div>
            <div className="p-4">
              <p className="text-sm text-[#555951]">{s.body}</p>
              <pre className={pre}>{s.code}</pre>
            </div>
          </section>
        ))}
      </div>

      <section className="mt-4 border border-[#E2E1D9] bg-[#FFFFFA]">
        <SectionHeader title="Response shape" actionLabel="API Docs" href="/docs" />
        <div className="p-4">
          <pre className={pre}>{`{
  "request_id": "…",
  "object": "lookup",
  "query": { "type": "email", "value": "leo@example.com" },
  "resolved": {
    "email": "leo@example.com",
    "syntaxValid": true,
    "domain": "example.com",
    "mxRecords": 3,
    "deliverable": true
  },
  "enrichment": "web_search at request time",
  "ms": 12
}`}</pre>
        </div>
      </section>
      </div>
    </main>
  );
}
