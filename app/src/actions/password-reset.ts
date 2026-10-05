"use server";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { sendPasswordReset } from "@/lib/email";
import { createPasswordReset, consumePasswordReset } from "@/lib/password-reset";

export type ResetRequestState = { ok: boolean; error?: string; message?: string } | undefined;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function baseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "https://yute.heuv.dev";
}

export async function requestPasswordReset(_prev: ResetRequestState, formData: FormData): Promise<ResetRequestState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Enter a valid email." };

  const user = await prisma.user.findUnique({ where: { email } });
  // Always answer the same way to avoid account enumeration.
  if (user) {
    const token = await createPasswordReset(user.id);
    await sendPasswordReset(user.email, `${baseUrl()}/reset-password?token=${token}`);
  }
  return { ok: true, message: "If that email exists, we've sent a reset link." };
}

export type ResetState = { ok: boolean; error?: string; message?: string } | undefined;

export async function resetPasswordAction(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const token = String(formData.get("token") ?? "");
  const next = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!token) return { ok: false, error: "Missing token." };
  if (next.length < 8) return { ok: false, error: "Password needs at least 8 characters." };
  if (next !== confirm) return { ok: false, error: "The confirmation does not match." };

  const userId = await consumePasswordReset(token);
  if (!userId) return { ok: false, error: "This reset link is invalid or expired." };

  await prisma.user.update({ where: { id: userId }, data: { passwordHash: hashPassword(next) } });
  return { ok: true, message: "Password updated. You can sign in now." };
}
