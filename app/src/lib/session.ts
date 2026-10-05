import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSessionToken, verifySessionToken, getSecretFromEnv } from "@/lib/auth";

export const SESSION_COOKIE = "yute_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

export async function getSessionUserId(): Promise<string | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    return verifySessionToken(getSecretFromEnv(), token).sub;
  } catch {
    return null;
  }
}

export async function requireSessionUserId(): Promise<string> {
  const sub = await getSessionUserId();
  if (!sub) redirect("/login");
  return sub;
}

export async function createSessionCookie(subject: string): Promise<void> {
  const token = createSessionToken(getSecretFromEnv(), SESSION_TTL_SECONDS, subject);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}
