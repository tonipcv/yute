import { handleLookupRequest } from "@/lib/http-lookup";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { status, headers, body } = await handleLookupRequest(request);
  return NextResponse.json(body, { status, headers });
}
