import { findApiKey } from "@/lib/apikey";
import { providerCatalog } from "@/lib/providers";
import { isDataForSeoConfigured } from "@/lib/providers/dataforseo";
import { isLlmConfigured } from "@/lib/extract";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await findApiKey(request.headers.get("authorization"), request.headers.get("x-api-key"));
  if (!auth) return NextResponse.json({ error: "Missing or invalid API key." }, { status: 401 });

  const stages = {
    web: { provider: "dataforseo", configured: isDataForSeoConfigured() },
    extraction: { provider: "llm", configured: isLlmConfigured() },
    validation: { provider: "internal", configured: true },
  };

  const providers = providerCatalog();
  return NextResponse.json({
    object: "providers",
    stages,
    providers,
    configured: providers.filter((p) => p.configured).map((p) => p.id),
  });
}
