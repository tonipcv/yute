import { POST as mcpPost, GET as mcpGet } from "@/app/api/mcp/route";
import { handleLookupRequest } from "@/lib/http-lookup";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Convenience alias for the MCP endpoint at /mcp. */
export async function POST(request: Request) {
  return mcpPost(request);
}

/**
 * A plain GET with lookup params acts as the REST lookup
 * (convenient cURL against /mcp); otherwise describe the server.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.has("email") || url.searchParams.has("domain") || url.searchParams.has("name") || url.searchParams.has("phone")) {
    const { status, headers, body } = await handleLookupRequest(request);
    return NextResponse.json(body, { status, headers });
  }
  return mcpGet();
}
