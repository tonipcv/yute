import { findApiKey } from "@/lib/apikey";
import { registerWebhook, listWebhooks } from "@/lib/webhooks";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await findApiKey(request.headers.get("authorization"), request.headers.get("x-api-key"));
  if (!auth) return NextResponse.json({ error: "Missing or invalid API key." }, { status: 401 });
  const hooks = await listWebhooks(auth.userId);
  return NextResponse.json({
    object: "webhooks",
    webhooks: hooks.map((h) => ({ id: h.id, url: h.url, active: h.active, created_at: h.createdAt.toISOString() })),
  });
}

export async function POST(request: Request) {
  const auth = await findApiKey(request.headers.get("authorization"), request.headers.get("x-api-key"));
  if (!auth) return NextResponse.json({ error: "Missing or invalid API key." }, { status: 401 });

  let body: { url?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!body.url) return NextResponse.json({ error: "url is required" }, { status: 400 });

  try {
    const hook = await registerWebhook(auth.userId, body.url);
    return NextResponse.json({ object: "webhook", id: hook.id, url: hook.url, secret: hook.secret }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "failed" }, { status: 400 });
  }
}
