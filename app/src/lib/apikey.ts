import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export interface AuthedKey {
  id: string;
  userId: string;
  scope: string;
}

export async function findApiKey(authorization: string | null, xApiKey: string | null): Promise<AuthedKey | null> {
  const raw = (authorization?.startsWith("Bearer ") ? authorization.slice(7) : xApiKey)?.trim() ?? null;
  if (!raw || !raw.startsWith("yute_")) return null;
  const key = await prisma.apiKey.findUnique({ where: { keyHash: sha256(raw) } });
  if (!key || key.revokedAt) return null;
  return { id: key.id, userId: key.userId, scope: key.scope };
}
