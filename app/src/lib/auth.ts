import { createHash, createHmac, pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";

const PBKDF2_ITERATIONS = 210_000;
const KEY_LEN = 64;

export function hashPassword(password: string, iterations = PBKDF2_ITERATIONS): string {
  const salt = randomBytes(16).toString("hex");
  const hash = pbkdf2Sync(password, salt, iterations, KEY_LEN, "sha256").toString("hex");
  return `pbkdf2$${iterations}$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, iterStr, salt, expected] = stored.split("$");
  if (scheme !== "pbkdf2" || !iterStr || !salt || !expected) return false;
  const actual = pbkdf2Sync(password, salt, Number(iterStr), KEY_LEN, "sha256");
  const expectedBuf = Buffer.from(expected, "hex");
  if (actual.length !== expectedBuf.length) return false;
  return timingSafeEqual(actual, expectedBuf);
}

export interface SessionPayload {
  sub: string;
  exp: number;
  iat: number;
}

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

export function createSessionToken(secret: string, ttlSeconds = 60 * 60 * 24 * 30, subject = "me"): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = { sub: subject, iat: now, exp: now + ttlSeconds };
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifySessionToken(secret: string, token: string): SessionPayload {
  const [body, sig] = token.split(".");
  if (!body || !sig) throw new Error("Token inválido");
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("Assinatura inválida");
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
  if (payload.exp * 1000 < Date.now()) throw new Error("Sessão expirada");
  return payload;
}

export function getSecretFromEnv(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("AUTH_SECRET ausente ou curto demais (mínimo 32 chars)");
  }
  return secret;
}

export function newApiKey(): string {
  return `yute_${randomBytes(32).toString("base64url")}`;
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}
