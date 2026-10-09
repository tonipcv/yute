# yute

B2B data-router API for developers. Resolve a person or company from an email, company domain, full name, or phone number — one endpoint, one credit system, sources included.

Web-first: yute runs a search-routed pipeline (SERP → page fetch → extraction → paid-finder fallback → SMTP email verification), the same flow an analyst would do by hand, and returns structured JSON with cited sources and confidence.

## What it does

- `GET /v1/lookup` — sync person/company lookup by `email`, `domain`, `name`, or `phone`
- `POST /v1/enrich` + `GET /v1/jobs/:id` — async enrichment jobs with webhook delivery
- `GET /v1/validate` — email-only validation (syntax, MX, SMTP, catch-all)
- `GET /v1/credits` — balance and ledger
- `GET/POST /v1/webhooks` — endpoint management (SSRF-hardened)
- `GET /v1/providers` — data routing diagnostics
- `POST /api/mcp` (+ `/mcp`) — hosted MCP server for AI clients
- Portal at `/login`, `/register`, `/docs`, and `/` (signed in) — API keys, playground, usage, billing, logs

Billing is per-resolved-record: misses are free, cache hits are near-free, and every call is metered with idempotent reserve/settle on a row-locked credit ledger.

## Stack

- **Next.js 15** (App Router) + React 19 + TypeScript
- **PostgreSQL** via Prisma (raw Pool for hot paths)
- **pg-boss** durable queue on the same Postgres for async jobs
- **Stripe** credit packs + idempotent webhook fulfillment
- **Resend** for transactional email
- Standalone stdio MCP server (`mcp-server.js`, bin `yute-mcp`)

## Quick start (local)

```bash
# 1. Install (postinstall runs prisma generate)
pnpm install

# 2. Configure env
cp .env.example .env.local   # fill in DATABASE_URL, AUTH_SECRET

# 3. Create schema
pnpm db:push                 # or: pnpm db:migrate

# 4. Run
pnpm dev                     # http://localhost:3000
```

Optional integrations (all env-driven, see `.env.example`): DataForSEO, LLM extraction (Gemini/Groq/DeepSeek/OpenAI), paid finders (Prospeo, Findymail, Hunter, Clay), Stripe, Resend, Google OAuth, Sentry, phone providers (LeadMagic, 1Lookup). Provider routing config lives in `providers.json`.

## Scripts

| Script | What it does |
| --- | --- |
| `pnpm dev` | Next.js dev server |
| `pnpm build` / `pnpm start` | Production build & serve (standalone output) |
| `pnpm typecheck` | TypeScript, no emit |
| `pnpm db:migrate` | Prisma migrations (dev) |
| `pnpm db:deploy` | Apply migrations (prod) |
| `pnpm db:status` | Migration status |

## MCP server

Connect from Claude Desktop or any MCP client:

```json
{
  "mcpServers": {
    "yute": {
      "command": "node",
      "args": ["/path/to/yute/mcp-server.js"],
      "env": { "YUTE_API_KEY": "yute_..." }
    }
  }
}
```

Env: `YUTE_API_KEY` (required), `YUTE_API_BASE_URL` (optional, default `https://app.yute.io`).

## Repository layout

```
app/    Next.js application (API, portal, docs, hosted MCP)
site/   Static landing page (no build step)
```

## API surface

See the full HTTP reference in the app at `/docs`, or `site/llms.txt`. Every lookup response includes `data`, `sources`, `confidence`, and email deliverability; responses and billable outcomes are logged per key in the portal (Usage → Logs).
