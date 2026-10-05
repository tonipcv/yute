import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { createSessionCookie } from "@/lib/session";
import { isGoogleConfigured, verifyState, exchangeGoogleCode } from "@/lib/oauth";
import { sendWelcome } from "@/lib/email";
import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://yute.heuv.dev";
  if (!isGoogleConfigured()) return NextResponse.redirect(`${base}/login`);

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") ?? "";
  const jar = await cookies();
  const cookieVal = jar.get("yute_oauth_state")?.value ?? "";
  const [cookieState, cookieSig] = cookieVal.split(".");

  if (!code || !state || state !== cookieState || !verifyState(state, cookieSig ?? "")) {
    return NextResponse.redirect(`${base}/login?expired=1`);
  }

  const profile = await exchangeGoogleCode(code);
  if (!profile || !profile.emailVerified) return NextResponse.redirect(`${base}/login`);

  let user = await prisma.user.findUnique({ where: { email: profile.email } });
  if (!user) {
    user = await prisma.user.create({
      data: { email: profile.email, passwordHash: hashPassword(randomBytes(24).toString("hex")), lastLoginAt: new Date() },
    });
    void sendWelcome(user.email).catch(() => undefined);
  } else {
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  }

  await createSessionCookie(user.id);
  const res = NextResponse.redirect(`${base}/overview`);
  res.cookies.delete("yute_oauth_state");
  return res;
}
