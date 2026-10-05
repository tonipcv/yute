"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { hashPassword, verifyPassword, getSecretFromEnv } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/ratelimit";
import { createSessionCookie, clearSessionCookie, getSessionUserId } from "@/lib/session";
import { sendWelcome } from "@/lib/email";

export type AuthState = { ok: false; error: string; email?: string } | undefined;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown").slice(0, 64);
}

function authRateLimited(ip: string): boolean {
  // 10 auth attempts per minute per IP (brute-force / signup abuse guard).
  return !rateLimit(`auth:${ip}`, 10).ok;
}

function normalizeEmail(raw: FormDataEntryValue | null): string {
  return String(raw ?? "").trim().toLowerCase();
}

export async function signInAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = normalizeEmail(formData.get("email"));
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { ok: false, error: "Fill in both email and password.", email: email || undefined };
  }

  if (authRateLimited(await clientIp())) {
    return { ok: false, error: "Too many attempts. Wait a minute and try again.", email };
  }

  getSecretFromEnv();

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return { ok: false, error: "Invalid credentials." };
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await createSessionCookie(user.id);
  redirect("/overview");
}

export async function signUpAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = normalizeEmail(formData.get("email"));
  const password = String(formData.get("password") ?? "");

  if (!EMAIL_RE.test(email)) {
    return { ok: false, error: "Enter a valid email.", email: email || undefined };
  }
  if (password.length < 8) {
    return { ok: false, error: "Password needs at least 8 characters.", email };
  }

  if (authRateLimited(await clientIp())) {
    return { ok: false, error: "Too many attempts. Wait a minute and try again.", email };
  }

  getSecretFromEnv();

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { ok: false, error: "This email is already registered.", email };
  }

  const user = await prisma.user.create({
    data: { email, passwordHash: hashPassword(password), lastLoginAt: new Date() },
  });

  void sendWelcome(user.email).catch(() => undefined);

  await createSessionCookie(user.id);
  redirect("/overview");
}

export async function signOutAction(): Promise<void> {
  await clearSessionCookie();
  redirect("/login");
}

export type ChangePasswordState = { ok: boolean; error?: string };

export async function updatePasswordAction(_prev: ChangePasswordState, formData: FormData): Promise<ChangePasswordState> {
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("new") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!current || !next) return { ok: false, error: "Fill in the current and the new password." };
  if (next.length < 8) return { ok: false, error: "The new password needs at least 8 characters." };
  if (next !== confirm) return { ok: false, error: "The confirmation does not match." };

  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) redirect("/login");
  if (!verifyPassword(current, user.passwordHash)) {
    return { ok: false, error: "Current password is wrong." };
  }

  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hashPassword(next) } });
  return { ok: true };
}
