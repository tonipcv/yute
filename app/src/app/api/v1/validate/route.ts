import { findApiKey } from "@/lib/apikey";
import { rateLimit } from "@/lib/ratelimit";
import { verifyEmail } from "@/lib/email-verify";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await findApiKey(request.headers.get("authorization"), request.headers.get("x-api-key"));
  if (!auth) return NextResponse.json({ error: "Missing or invalid API key." }, { status: 401 });

  const rl = rateLimit(`validate:${auth.id}`);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded.", retry_after: rl.retryAfterSeconds },
      { status: 429, headers: { "retry-after": String(rl.retryAfterSeconds) } }
    );
  }

  const email = new URL(request.url).searchParams.get("email")?.trim() ?? "";
  if (!email) return NextResponse.json({ error: "Send ?email=." }, { status: 400 });

  const verification = await verifyEmail(email);
  return NextResponse.json(
    { object: "validation", ...verification },
    { headers: { "cache-control": "no-store" } }
  );
}
