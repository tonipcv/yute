import { prisma } from "@/lib/prisma";
import { providerCatalog } from "@/lib/providers";
import { isDataForSeoConfigured } from "@/lib/providers/dataforseo";
import { isLlmConfigured } from "@/lib/extract";
import { isEmailConfigured } from "@/lib/email";
import { isStripeConfigured } from "@/lib/stripe";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let db = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    db = true;
  } catch {
    db = false;
  }

  const providers = providerCatalog();
  const configured = providers.filter((p) => p.configured).map((p) => p.id);

  return NextResponse.json(
    {
      ok: db,
      db,
      web: isDataForSeoConfigured(),
      extraction: isLlmConfigured(),
      email: isEmailConfigured(),
      billing: isStripeConfigured(),
      queue: process.env.YUTE_QUEUE !== "off",
      sentry: Boolean(process.env.SENTRY_DSN),
      providers: configured,
      ts: new Date().toISOString(),
    },
    { status: db ? 200 : 503 }
  );
}
