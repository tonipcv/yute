import { isGoogleConfigured, newState, signState, googleAuthUrl } from "@/lib/oauth";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isGoogleConfigured()) {
    return NextResponse.json({ error: "Google OAuth not configured." }, { status: 503 });
  }
  const state = newState();
  const sig = signState(state);
  const res = NextResponse.redirect(googleAuthUrl(state));
  res.cookies.set("yute_oauth_state", `${state}.${sig}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  return res;
}
