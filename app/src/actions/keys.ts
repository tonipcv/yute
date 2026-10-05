"use server";

import { requireSessionUserId } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { newApiKey, sha256 } from "@/lib/auth";

export interface CreateKeyResult {
  id: string;
  name: string;
  /** the raw key - returned exactly once, right after creation */
  raw: string;
  prefix: string;
  last4: string;
  scope: string;
  createdAt: string;
}

export async function createKeyAction(formData: FormData): Promise<CreateKeyResult> {
  const userId = await requireSessionUserId();
  const name = String(formData.get("name") ?? "").trim() || "Lookup key";
  const scope = String(formData.get("scope") ?? "").trim() || "lookup:read";

  const raw = newApiKey();
  const key = await prisma.apiKey.create({
    data: {
      userId,
      name,
      scope,
      keyHash: sha256(raw),
      prefix: raw.slice(0, 11) + "…",
      last4: raw.slice(-4),
    },
  });

  return {
    id: key.id,
    name: key.name,
    raw,
    prefix: key.prefix,
    last4: key.last4,
    scope: key.scope,
    createdAt: key.createdAt.toISOString(),
  };
}

export async function revokeKeyAction(formData: FormData): Promise<void> {
  const userId = await requireSessionUserId();
  const keyId = String(formData.get("keyId") ?? "");

  await prisma.apiKey.updateMany({
    where: { id: keyId, userId },
    data: { revokedAt: new Date() },
  });
}
